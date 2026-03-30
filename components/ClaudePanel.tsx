'use client'

import { useCallback, useRef, useState, useEffect } from 'react'
import { Sparkles, Send, RotateCcw, Download, ChevronDown } from 'lucide-react'
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

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  hasResult?: boolean
}

let msgIdCounter = 0

export default function ClaudePanel() {
  const {
    originalSheets, isProcessing, setProcessing,
    setClaudeResult, addLog, setShowOutputDialog,
    claudeResult, fileInfo,
    addStreamingSheet, clearStreamingSheets,
  } = useExcelStore()

  const [command, setCommand] = useState('')
  const [showExamples, setShowExamples] = useState(false)
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 메시지 추가 시 자동 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory, isProcessing])

  const handleExecute = useCallback(async () => {
    if (!command.trim()) { addLog('error', '명령을 입력해 주세요'); return }
    if (!originalSheets.length) { addLog('error', '엑셀 파일을 먼저 업로드해 주세요'); return }

    const submittedCommand = command.trim()

    // 사용자 메시지를 채팅에 추가
    setChatHistory(prev => [...prev, {
      id: String(++msgIdCounter),
      role: 'user',
      content: submittedCommand,
    }])

    setCommand('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    setProcessing(true)
    clearStreamingSheets()
    addLog('processing', `명령 전송: "${submittedCommand.slice(0, 60)}${submittedCommand.length > 60 ? '...' : ''}"`)

    try {
      const inputSheets = sheetsToClaudeInput(originalSheets, submittedCommand, 1000)

      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: submittedCommand, sheets: inputSheets }),
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
            addLog('claude', parsed.message)
          } else if (parsed.type === 'error' && parsed.error) {
            throw new Error(parsed.error)
          } else if (parsed.type === 'op' && parsed.op) {
            collectedOps.push(parsed.op)
            addLog('claude', `📋 ${describeOp(parsed.op)}`)
          } else if (parsed.type === 'sheet' && parsed.sheet && parsed.sheetValue) {
            addStreamingSheet(parsed.sheet, parsed.sheetValue)
            addLog('claude', `📊 시트 생성: ${parsed.sheet.name} (${parsed.sheet.data.length}행)`)
          } else if (parsed.type === 'result' && parsed.data) {
            result = parsed.data
          }
        }
      }

      // 클라이언트 폴백: result가 없어도 ops가 수집되었으면 결과 구성
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

      // 방식 A: 연산 명세 적용
      if (result.operations && result.operations.length > 0 && result.resultSheets.length === 0) {
        addLog('claude', `🔧 ${result.operations.length}개 연산을 원본 데이터에 적용 중...`)
        const applied = applyOperations(originalSheets, result.operations)
        result.resultSheets = applied
        result.resultSheetsValueOnly = applied
        addLog('success', `연산 적용 완료 — ${applied.length}개 시트 수정`)
      }

      result.logs?.forEach((l) => addLog('claude', l))
      addLog('success', `완료! 결과 시트 ${result.resultSheets.length}개 생성`)

      // AI 응답을 채팅에 추가 (isChatOnly면 다운로드 버튼 숨김)
      const isChatOnly = result!.isChatOnly === true
      setChatHistory(prev => [...prev, {
        id: String(++msgIdCounter),
        role: 'assistant',
        content: result!.summary || `처리 완료 — 결과 시트 ${result!.resultSheets.length}개 생성됨`,
        hasResult: !isChatOnly && (result!.resultSheets.length > 0 || (result!.operations?.length ?? 0) > 0),
      }])

      setClaudeResult(result)
      // ✅ 자동 다운로드 팝업 제거 — 사용자가 직접 버튼 클릭

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '오류 발생'
      addLog('error', `실패: ${errMsg}`)
      setChatHistory(prev => [...prev, {
        id: String(++msgIdCounter),
        role: 'assistant',
        content: `⚠️ ${errMsg}`,
      }])
      clearStreamingSheets()
    } finally {
      setProcessing(false)
    }
  }, [command, originalSheets, setProcessing, setClaudeResult, addLog, setShowOutputDialog, addStreamingSheet, clearStreamingSheets])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleExecute()
    }
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCommand(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }

  const canExecute = !isProcessing && !!originalSheets.length && !!command.trim()

  return (
    <div className="flex flex-col h-full bg-white">

      {/* ── 헤더 (Claude Excel 확장 스타일) ── */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100 bg-white shrink-0">
        <div className="w-6 h-6 rounded-lg bg-amber-500 flex items-center justify-center">
          <Sparkles size={12} className="text-white" />
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-xs font-bold text-gray-900">Claude</span>
          <span className="text-[10px] text-gray-400 mt-0.5">Excel Assistant</span>
        </div>
        {chatHistory.length > 0 && (
          <button
            onClick={() => { setClaudeResult(null); setChatHistory([]); addLog('info', '대화 초기화') }}
            title="대화 초기화"
            className="ml-auto p-1.5 text-gray-300 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RotateCcw size={12} />
          </button>
        )}
      </div>

      {/* ── 채팅 히스토리 ── */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3 bg-gray-50/40">
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
            {/* 예시 칩 */}
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
          chatHistory.map((msg) => (
            <div key={msg.id} className={`flex items-end gap-1.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {/* AI 아바타 */}
              {msg.role === 'assistant' && (
                <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center shrink-0 mb-0.5">
                  <Sparkles size={9} className="text-white" />
                </div>
              )}

              <div className={`max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                <div className={`rounded-2xl px-3 py-2 text-[12px] leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-blue-500 text-white rounded-br-sm'
                    : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm'
                }`}>
                  {msg.content}
                </div>

                {/* 결과 있을 때 다운로드 버튼 */}
                {msg.hasResult && claudeResult && (
                  <button
                    onClick={() => setShowOutputDialog(true)}
                    className="flex items-center gap-1.5 text-[11px] text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded-xl px-3 py-1.5 font-medium transition-colors shadow-sm"
                  >
                    <Download size={11} />
                    엑셀 다운로드 (.xlsx)
                  </button>
                )}
              </div>
            </div>
          ))
        )}

        {/* 타이핑 인디케이터 */}
        {isProcessing && (
          <div className="flex items-end gap-1.5 justify-start">
            <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center shrink-0">
              <Sparkles size={9} className="text-white animate-pulse" />
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
                onClick={() => {
                  setCommand(ex)
                  setShowExamples(false)
                  textareaRef.current?.focus()
                }}
                className="text-left text-[11px] px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-white hover:border-gray-300 transition-all"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── 입력 영역 (하단 고정 — Claude Excel 확장 스타일) ── */}
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
