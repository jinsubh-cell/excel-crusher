'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Sparkles, Send, Loader2, ChevronDown, RotateCcw, CheckCircle } from 'lucide-react'
import { applyOperations } from '@/lib/operations'
import { SheetData, SheetOp, ClaudeResult } from '@/types'

/* ── Office.js 전역 타입 선언 ── */
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Office: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Excel: any
  }
}

const EXAMPLES = [
  '각 열의 합계·평균 요약 시트 만들어줘',
  '중복된 행 모두 제거해줘',
  '날짜 열 기준으로 오름차순 정렬',
  '빈 셀 있는 행 모두 찾아줘',
  '숫자 데이터 통계 분석해줘',
  '피벗 형태로 데이터 요약해줘',
  '특정 조건에 맞는 행만 필터링해줘',
]

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  isSuccess?: boolean
}

let msgId = 0

export default function ExcelAddinPage() {
  const [officeReady, setOfficeReady] = useState(false)
  const [officeError, setOfficeError] = useState<string | null>(null)
  const [command, setCommand] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
  const [showExamples, setShowExamples] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  /* ── Office.js 로드 및 초기화 ── */
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://appsforoffice.microsoft.com/lib/1/hosted/office.js'
    script.async = true
    script.onload = () => {
      window.Office?.onReady((info: { host: string }) => {
        // Excel 내부 또는 개발 모드(host가 null)에서 실행 가능
        if (!info.host || info.host === window.Office?.HostType?.Excel) {
          setOfficeReady(true)
        } else {
          setOfficeError(`지원하지 않는 호스트입니다: ${info.host}`)
        }
      })
    }
    script.onerror = () => {
      // Office.js 로드 실패 = 개발/브라우저 환경 → 그냥 허용
      setOfficeReady(true)
    }
    document.head.appendChild(script)
    return () => {
      if (document.head.contains(script)) document.head.removeChild(script)
    }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory, isProcessing])

  /* ── 현재 워크북의 모든 시트 읽기 ── */
  const readAllSheets = useCallback(async (): Promise<SheetData[]> => {
    if (!window.Excel) {
      // 개발 모드: 더미 데이터 반환
      return [{ name: 'Sheet1', data: [['이름', '점수', '등급'], ['홍길동', 95, 'A'], ['김철수', 82, 'B']] }]
    }
    return window.Excel.run(async (ctx: any) => {
      const worksheets = ctx.workbook.worksheets
      worksheets.load('items/name')
      await ctx.sync()

      const result: SheetData[] = []
      for (const ws of worksheets.items) {
        const range = ws.getUsedRangeOrNullObject()
        range.load(['values', 'isNullObject'])
        await ctx.sync()
        if (!range.isNullObject && Array.isArray(range.values)) {
          result.push({ name: ws.name, data: range.values as string[][] })
        }
      }
      return result
    })
  }, [])

  /* ── 결과 시트를 Excel에 기록 ── */
  const writeResultsToExcel = useCallback(async (
    resultSheets: SheetData[],
    isMethodA: boolean,
  ) => {
    if (!window.Excel) return  // 개발 모드 스킵

    await window.Excel.run(async (ctx: any) => {
      const wb = ctx.workbook

      if (isMethodA) {
        /* 방식 A: 원본 시트 내용을 수정된 데이터로 덮어쓰기 */
        for (const sheet of resultSheets) {
          const ws = wb.worksheets.getItemOrNullObject(sheet.name)
          ws.load('isNullObject')
          await ctx.sync()
          if (ws.isNullObject || !sheet.data.length) continue

          const used = ws.getUsedRangeOrNullObject()
          used.load('isNullObject')
          await ctx.sync()
          if (!used.isNullObject) used.clear()
          await ctx.sync()

          const cols = Math.max(...sheet.data.map(r => r.length))
          if (sheet.data.length > 0 && cols > 0) {
            const range = ws.getRange('A1')
              .getResizedRange(sheet.data.length - 1, cols - 1)
            range.values = sheet.data.map(row =>
              Array.from({ length: cols }, (_, i) => row[i] ?? '')
            )
          }
        }
      } else {
        /* 방식 B: 새 시트 생성 */
        for (const sheet of resultSheets) {
          // 같은 이름이 있으면 삭제
          const existing = wb.worksheets.getItemOrNullObject(sheet.name)
          existing.load('isNullObject')
          await ctx.sync()
          if (!existing.isNullObject) {
            existing.delete()
            await ctx.sync()
          }

          const newWs = wb.worksheets.add(sheet.name)
          if (sheet.data.length > 0) {
            const cols = Math.max(...sheet.data.map(r => r.length))
            const range = newWs.getRange('A1')
              .getResizedRange(sheet.data.length - 1, cols - 1)
            range.values = sheet.data.map(row =>
              Array.from({ length: cols }, (_, i) => row[i] ?? '')
            )
          }
          newWs.activate()
        }
      }

      await ctx.sync()
    })
  }, [])

  /* ── Claude API 호출 ── */
  const handleExecute = useCallback(async () => {
    if (!command.trim() || isProcessing) return

    const cmd = command.trim()
    setCommand('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    setChatHistory(prev => [...prev, { id: String(++msgId), role: 'user', content: cmd }])
    setIsProcessing(true)
    setStatusMsg('엑셀 데이터 읽는 중...')

    try {
      /* 1. 시트 데이터 읽기 */
      const sheets = await readAllSheets()
      if (!sheets.length) throw new Error('시트 데이터를 찾을 수 없습니다.')

      setStatusMsg('Claude AI 처리 중...')

      /* 2. Claude API 스트리밍 호출 */
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd, sheets }),
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
          try {
            const parsed = JSON.parse(line.slice(6))
            if (parsed.type === 'progress') setStatusMsg(parsed.message ?? '')
            if (parsed.type === 'op' && parsed.op) collectedOps.push(parsed.op)
            if (parsed.type === 'result' && parsed.data) result = parsed.data
            if (parsed.type === 'error') throw new Error(parsed.error)
          } catch (e) {
            if (e instanceof SyntaxError) continue
            throw e
          }
        }
      }

      /* 3. 연산 폴백 */
      if (!result && collectedOps.length > 0) {
        result = {
          resultSheets: [], resultSheetsValueOnly: [], logs: [],
          summary: `${collectedOps.length}개 연산 적용`,
          operations: collectedOps,
        }
      }
      if (!result) throw new Error('결과를 받지 못했습니다. 다시 시도해 주세요.')

      /* 4. 방식 A: 연산 명세를 클라이언트에서 직접 적용 */
      const isMethodA = !!(result.operations?.length && !result.resultSheets.length)
      if (isMethodA) {
        const applied = applyOperations(sheets, result.operations!)
        result.resultSheets = applied
        result.resultSheetsValueOnly = applied
      }

      /* 5. Excel에 결과 기록 */
      if (!result.isChatOnly && result.resultSheets.length > 0) {
        setStatusMsg('Excel에 결과 반영 중...')
        await writeResultsToExcel(result.resultSheets, isMethodA)
        setChatHistory(prev => [...prev, {
          id: String(++msgId),
          role: 'assistant',
          content: `${result!.summary || '처리 완료'}\n\n✅ Excel에 바로 반영되었습니다.`,
          isSuccess: true,
        }])
      } else {
        /* 방식 C: 텍스트 응답 */
        setChatHistory(prev => [...prev, {
          id: String(++msgId),
          role: 'assistant',
          content: result!.summary || '처리 완료',
        }])
      }
    } catch (err) {
      setChatHistory(prev => [...prev, {
        id: String(++msgId),
        role: 'assistant',
        content: `⚠️ ${err instanceof Error ? err.message : '오류 발생'}`,
      }])
    } finally {
      setIsProcessing(false)
      setStatusMsg('')
    }
  }, [command, isProcessing, readAllSheets, writeResultsToExcel])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleExecute() }
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCommand(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px'
  }

  if (officeError) {
    return (
      <div className="flex items-center justify-center h-screen bg-white p-4 text-center">
        <p className="text-sm text-red-500">{officeError}</p>
      </div>
    )
  }

  const canSend = officeReady && !!command.trim() && !isProcessing

  return (
    <div className="flex flex-col h-screen bg-white select-none"
      style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* ── 헤더 ── */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-200 bg-white shrink-0">
        <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center shadow-sm">
          <Sparkles size={14} className="text-white" />
        </div>
        <div className="flex-1 leading-none">
          <p className="text-[13px] font-bold text-gray-900">Claude</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Excel AI 어시스턴트</p>
        </div>
        {!officeReady && (
          <Loader2 size={13} className="text-amber-400 animate-spin shrink-0" />
        )}
        {chatHistory.length > 0 && (
          <button
            onClick={() => setChatHistory([])}
            title="대화 초기화"
            className="p-1.5 text-gray-300 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RotateCcw size={12} />
          </button>
        )}
      </div>

      {/* ── 상태 표시줄 (처리 중일 때만) ── */}
      {isProcessing && statusMsg && (
        <div className="px-3 py-1.5 bg-amber-50 border-b border-amber-100 shrink-0">
          <p className="text-[11px] text-amber-700 flex items-center gap-1.5">
            <Loader2 size={10} className="animate-spin shrink-0" />
            {statusMsg}
          </p>
        </div>
      )}

      {/* ── 채팅 영역 ── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {chatHistory.length === 0 ? (
          /* 웰컴 화면 */
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center pb-6">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg">
              <Sparkles size={28} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 mb-1">
                스프레드시트를 도와드릴게요
              </p>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                데이터 정렬·필터·분석·수정을<br />자연어로 요청하면<br />
                엑셀에 바로 반영됩니다
              </p>
            </div>
            <div className="flex flex-col gap-1.5 w-full">
              {EXAMPLES.slice(0, 4).map((ex, i) => (
                <button
                  key={i}
                  onClick={() => { setCommand(ex); textareaRef.current?.focus() }}
                  className="text-[11px] px-3 py-2 bg-white border border-gray-200 rounded-xl text-gray-500 hover:text-gray-800 hover:border-amber-200 hover:bg-amber-50/40 transition-all text-left shadow-sm"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          chatHistory.map((msg) => (
            <div key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center shrink-0 mt-1 mr-1.5">
                  {msg.isSuccess
                    ? <CheckCircle size={10} className="text-white" />
                    : <Sparkles size={9} className="text-white" />
                  }
                </div>
              )}
              <div className={`max-w-[88%] rounded-2xl px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap break-words ${
                msg.role === 'user'
                  ? 'bg-blue-500 text-white rounded-br-sm'
                  : msg.isSuccess
                  ? 'bg-green-50 border border-green-200 text-green-800 rounded-bl-sm shadow-sm'
                  : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm'
              }`}>
                {msg.content}
              </div>
            </div>
          ))
        )}

        {/* 타이핑 인디케이터 */}
        {isProcessing && (
          <div className="flex justify-start items-end gap-1.5">
            <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center shrink-0">
              <Sparkles size={9} className="text-white animate-pulse" />
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-3 py-2.5 shadow-sm">
              <div className="flex gap-1">
                {[0, 150, 300].map(d => (
                  <span key={d} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── 입력 영역 ── */}
      <div className="border-t border-gray-200 bg-white px-3 pt-2.5 pb-3 shrink-0">
        <div className={`flex items-end gap-2 bg-gray-50 border rounded-xl px-3 py-2 transition-all ${
          isProcessing ? 'opacity-70 border-gray-200'
            : 'border-gray-200 focus-within:border-amber-300 focus-within:ring-2 focus-within:ring-amber-50'
        }`}>
          <textarea
            ref={textareaRef}
            value={command}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            disabled={isProcessing || !officeReady}
            placeholder={officeReady ? '메시지를 입력하세요...' : '연결 중...'}
            rows={1}
            className="flex-1 bg-transparent border-none outline-none resize-none text-[12px] text-gray-800 placeholder-gray-400 disabled:opacity-50 leading-relaxed"
            style={{ maxHeight: '100px' }}
          />
          <button
            onClick={handleExecute}
            disabled={!canSend}
            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all ${
              isProcessing ? 'bg-amber-100 cursor-wait'
                : canSend ? 'bg-amber-500 hover:bg-amber-600 active:scale-95 shadow-sm'
                : 'bg-gray-100 cursor-not-allowed'
            }`}
          >
            {isProcessing
              ? <Sparkles size={12} className="text-amber-500 animate-pulse" />
              : <Send size={12} className={canSend ? 'text-white' : 'text-gray-400'} />
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

        {showExamples && (
          <div className="mt-2 flex flex-col gap-1 max-h-36 overflow-y-auto">
            {EXAMPLES.map((ex, i) => (
              <button
                key={i}
                onClick={() => { setCommand(ex); setShowExamples(false); textareaRef.current?.focus() }}
                className="text-left text-[11px] px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-white transition-all"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
