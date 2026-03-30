'use client'

import { useCallback, useRef, useState, useEffect } from 'react'
import { Sparkles, Send, RotateCcw, ChevronDown, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { useExcelStore } from '@/lib/store'
import { sheetsToClaudeInput } from '@/lib/excel'
import { applyOperations, describeOp } from '@/lib/operations'
import { ClaudeResult, SheetData, SheetOp } from '@/types'

const EXAMPLES = [
  '각 열의 합계와 평균을 계산해서 요약 시트 만들어줘',
  '중복된 행을 찾아서 제거해줘',
  '날짜 열 기준으로 오름차순 정렬해줘',
  'A열과 B열을 합쳐서 새 열 만들어줘',
  '빈 셀이 있는 행을 모두 찾아줘',
  '숫자 데이터 통계 분석 (최대, 최소, 평균, 합계) 해줘',
  '특정 조건에 맞는 행만 필터링해줘',
  '피벗 형태로 데이터 요약해줘',
]

// ── 메시지 타입 ──
type MsgRole = 'user' | 'assistant' | 'log'
type LogKind = 'processing' | 'claude' | 'success' | 'error' | 'info'

interface ChatMessage {
  id: string
  role: MsgRole
  content: string
  logKind?: LogKind
}

let msgIdCounter = 0
const nextId = () => String(++msgIdCounter)

// ── 로그 종류별 스타일 ──
const logStyle: Record<LogKind, string> = {
  processing: 'text-amber-600',
  claude:     'text-blue-500',
  success:    'text-green-600',
  error:      'text-red-500',
  info:       'text-gray-400',
}
const logPrefix: Record<LogKind, string> = {
  processing: '⏳ ',
  claude:     '',
  success:    '✅ ',
  error:      '⚠️ ',
  info:       'ℹ️ ',
}

export default function ClaudePanel() {
  const {
    originalSheets, resultWorkingSheets, setResultWorkingSheets,
    isProcessing, setProcessing,
    setClaudeResult, addLog,
    claudeResult, fileInfo,
    addStreamingSheet, clearStreamingSheets,
  } = useExcelStore()

  const [command, setCommand] = useState('')
  const [showExamples, setShowExamples] = useState(false)
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 새 메시지 올 때 자동 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory, isProcessing])

  // 채팅에 메시지 추가 헬퍼
  const addChat = useCallback((role: MsgRole, content: string, logKind?: LogKind) => {
    setChatHistory(prev => [...prev, { id: nextId(), role, content, logKind }])
  }, [])

  const handleExecute = useCallback(async () => {
    if (!command.trim()) { addChat('log', '명령을 입력해 주세요.', 'error'); return }
    if (!originalSheets.length) { addChat('log', '엑셀 파일을 먼저 업로드해 주세요.', 'error'); return }

    // 결과물 시트가 있으면 그것을 작업 기반으로, 없으면 원본 사용
    const workingSheets = resultWorkingSheets.length > 0 ? resultWorkingSheets : originalSheets

    const submittedCommand = command.trim()
    addChat('user', submittedCommand)
    setCommand('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    setProcessing(true)
    clearStreamingSheets()
    addChat('log', `명령 전송: "${submittedCommand.slice(0, 50)}${submittedCommand.length > 50 ? '...' : ''}"`, 'processing')

    try {
      const claudeInput = sheetsToClaudeInput(workingSheets, submittedCommand, 1000)

      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: submittedCommand, sheets: claudeInput }),
      })

      if (!res.ok || !res.body) throw new Error(`서버 오류 (${res.status})`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let result: ClaudeResult | null = null
      let buffer = ''
      const collectedOps: SheetOp[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data: ')) continue

          let parsed: {
            type: string
            message?: string
            error?: string
            data?: ClaudeResult
            sheet?: SheetData
            sheetValue?: SheetData
            op?: SheetOp
          }
          try { parsed = JSON.parse(line.slice(6)) } catch { continue }

          if (parsed.type === 'progress' && parsed.message) {
            // 재시도 카운트다운 메시지는 마지막 로그 업데이트
            const isCountdown = parsed.message.includes('초 후 재시도')
            if (isCountdown) {
              // 카운트다운: 마지막 로그 메시지를 업데이트
              setChatHistory(prev => {
                const last = prev[prev.length - 1]
                if (last?.role === 'log' && last.logKind === 'processing') {
                  return [...prev.slice(0, -1), { ...last, content: parsed.message! }]
                }
                return [...prev, { id: nextId(), role: 'log', content: parsed.message!, logKind: 'processing' }]
              })
            } else {
              addChat('log', parsed.message, 'processing')
            }
          } else if (parsed.type === 'error' && parsed.error) {
            throw new Error(parsed.error)
          } else if (parsed.type === 'op' && parsed.op) {
            collectedOps.push(parsed.op)
            addChat('log', `📋 ${describeOp(parsed.op)}`, 'claude')
            addLog('claude', `📋 ${describeOp(parsed.op)}`)
          } else if (parsed.type === 'sheet' && parsed.sheet && parsed.sheetValue) {
            addStreamingSheet(parsed.sheet, parsed.sheetValue)
            addChat('log', `📊 시트 생성: ${parsed.sheet.name} (${parsed.sheet.data.length}행)`, 'claude')
          } else if (parsed.type === 'result' && parsed.data) {
            result = parsed.data
          }
        }
      }

      // 클라이언트 폴백
      if (!result && collectedOps.length > 0) {
        result = {
          resultSheets: [],
          resultSheetsValueOnly: [],
          logs: [],
          summary: `${collectedOps.length}개 연산 적용`,
          operations: collectedOps,
        }
      }

      if (!result) throw new Error('결과를 받지 못했습니다. 다시 시도해 주세요.')

      // 방식 A: 연산 명세 적용 — workingSheets(결과물 or 원본) 기반으로 연산
      if (result.operations && result.operations.length > 0 && result.resultSheets.length === 0) {
        addChat('log', `🔧 ${result.operations.length}개 연산을 ${resultWorkingSheets.length > 0 ? '결과물' : '원본'} 데이터에 적용 중...`, 'claude')
        const applied = applyOperations(workingSheets, result.operations)
        result.resultSheets = applied
        result.resultSheetsValueOnly = applied
        addChat('log', `연산 적용 완료 — ${applied.length}개 시트 수정`, 'success')
      }

      result.logs?.forEach(l => addChat('log', l, 'claude'))

      // 최종 AI 응답
      const isChatOnly = result.isChatOnly === true
      addChat(
        'assistant',
        result.summary || `처리 완료 — 결과 시트 ${result.resultSheets.length}개 생성됨`,
      )

      if (!isChatOnly && result.resultSheets.length > 0) {
        // 결과물 시트를 별도 state로 관리 (원본 훼손 없이 누적)
        setResultWorkingSheets(result.resultSheets)
        addChat('log', '오른쪽 미리보기 [결과물] 탭에서 결과를 확인하세요. 탭바 오른쪽 [저장] 버튼으로 다운로드할 수 있습니다.', 'info')
      }

      // claudeResult는 내부 상태 동기화용으로만 사용 (isChatOnly인 경우에도 호출)
      setClaudeResult(result)

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '오류 발생'
      addChat('log', `실패: ${errMsg}`, 'error')
      addChat('assistant', `⚠️ ${errMsg}`)
      clearStreamingSheets()
    } finally {
      setProcessing(false)
    }
  }, [command, originalSheets, resultWorkingSheets, setResultWorkingSheets, setProcessing, setClaudeResult, addLog, addStreamingSheet, clearStreamingSheets, addChat])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // IME 조합 중(한글/일본어 등 입력 중)일 때는 Enter 무시 — nativeEvent.isComposing 체크
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleExecute() }
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCommand(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }

  const canExecute = !isProcessing && !!originalSheets.length && !!command.trim()

  return (
    <div className="flex flex-col h-full bg-white">

      {/* ── 헤더 ── */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100 bg-white shrink-0">
        <div className="w-6 h-6 rounded-lg bg-amber-500 flex items-center justify-center">
          <Sparkles size={12} className="text-white" />
        </div>
        <div className="flex flex-col leading-none flex-1">
          <span className="text-xs font-bold text-gray-900">Claude</span>
          <span className="text-[10px] text-gray-400 mt-0.5">Excel Assistant</span>
        </div>
        {chatHistory.length > 0 && (
          <button
            onClick={() => { setClaudeResult(null); setResultWorkingSheets([]); setChatHistory([]); }}
            title="대화 초기화"
            className="p-1.5 text-gray-300 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RotateCcw size={12} />
          </button>
        )}
      </div>

      {/* ── 채팅 + 로그 통합 영역 ── */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2 bg-gray-50/40">
        {chatHistory.length === 0 ? (
          /* 웰컴 화면 */
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-3 pb-6">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center">
              <Sparkles size={20} className="text-amber-500" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-800 mb-1">Excel AI 어시스턴트</p>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                데이터를 자연어로 정렬·필터·분석·수정할 수 있습니다
              </p>
            </div>
            {!originalSheets.length && (
              <p className="text-[11px] text-amber-600 bg-amber-50 px-3 py-2 rounded-xl border border-amber-100">
                먼저 오른쪽에서 엑셀 파일을 업로드하세요
              </p>
            )}
            {originalSheets.length > 0 && (
              <div className="flex flex-wrap gap-1.5 justify-center mt-1">
                {EXAMPLES.slice(0, 4).map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => { setCommand(ex); textareaRef.current?.focus() }}
                    className="text-[11px] px-2.5 py-1 bg-white border border-gray-200 rounded-full text-gray-500 hover:text-gray-800 hover:border-gray-300 hover:bg-white transition-all shadow-sm"
                  >
                    {ex.length > 18 ? ex.slice(0, 18) + '...' : ex}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          chatHistory.map((msg) => {
            /* ── 로그 메시지 ── */
            if (msg.role === 'log') {
              const kind = msg.logKind ?? 'info'
              return (
                <div key={msg.id} className={`flex items-start gap-1.5 px-1 ${logStyle[kind]}`}>
                  <span className="text-[10px] leading-relaxed opacity-80">
                    {logPrefix[kind]}{msg.content}
                  </span>
                </div>
              )
            }

            /* ── 사용자 / AI 메시지 ── */
            return (
              <div key={msg.id}
                className={`flex items-end gap-1.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center shrink-0 mb-0.5">
                    <Sparkles size={9} className="text-white" />
                  </div>
                )}
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[12px] leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-blue-500 text-white rounded-br-sm'
                    : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm'
                }`}>
                  {msg.content}
                </div>
              </div>
            )
          })
        )}

        {/* 타이핑 인디케이터 */}
        {isProcessing && (
          <div className="flex items-end gap-1.5 justify-start">
            <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center shrink-0">
              <Loader2 size={9} className="text-white animate-spin" />
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-3 py-2.5 shadow-sm">
              <div className="flex gap-1 items-center">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── 예시 명령어 펼침 ── */}
      {showExamples && (
        <div className="border-t border-gray-100 bg-white px-3 py-2.5 max-h-44 overflow-y-auto shrink-0">
          <div className="flex flex-col gap-1">
            {EXAMPLES.map((ex, i) => (
              <button
                key={i}
                onClick={() => { setCommand(ex); setShowExamples(false); textareaRef.current?.focus() }}
                className="text-left text-[11px] px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-white hover:border-gray-300 transition-all"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── 입력 영역 ── */}
      <div className="border-t border-gray-100 bg-white px-3 pt-2.5 pb-3 shrink-0">
        <div className={`flex items-end gap-2 bg-gray-50 border rounded-xl px-3 py-2 transition-all ${
          isProcessing ? 'border-gray-200 opacity-70' : 'border-gray-200 focus-within:border-amber-300 focus-within:ring-2 focus-within:ring-amber-50'
        }`}>
          <textarea
            ref={textareaRef}
            value={command}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            disabled={isProcessing}
            placeholder={originalSheets.length ? '메시지를 입력하세요...' : '파일을 먼저 업로드하세요'}
            rows={1}
            className="flex-1 bg-transparent border-none outline-none resize-none text-[12px] text-gray-800 placeholder-gray-400 disabled:opacity-50 leading-relaxed"
            style={{ maxHeight: '120px' }}
          />
          <button
            onClick={handleExecute}
            disabled={!canExecute}
            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all ${
              isProcessing
                ? 'bg-amber-100 cursor-wait'
                : canExecute
                ? 'bg-amber-500 hover:bg-amber-600 active:scale-95 shadow-sm'
                : 'bg-gray-100 cursor-not-allowed'
            }`}
          >
            {isProcessing
              ? <Sparkles size={12} className="text-amber-500 animate-pulse" />
              : <Send size={12} className={canExecute ? 'text-white' : 'text-gray-400'} />
            }
          </button>
        </div>
        <div className="flex items-center justify-between mt-1.5 px-0.5">
          <button
            onClick={() => setShowExamples(v => !v)}
            className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
          >
            <ChevronDown size={10} className={`transition-transform ${showExamples ? 'rotate-180' : ''}`} />
            예시 명령
          </button>
          <span className="text-[10px] text-gray-300">Enter 전송 · Shift+Enter 줄바꿈</span>
        </div>
      </div>

    </div>
  )
}
