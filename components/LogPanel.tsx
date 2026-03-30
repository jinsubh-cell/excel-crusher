'use client'

import { useEffect, useRef } from 'react'
import { CheckCircle, XCircle, Info, Loader2, Sparkles, Terminal } from 'lucide-react'
import { useExcelStore } from '@/lib/store'
import { LogType } from '@/types'

const ICONS: Record<LogType, React.ReactNode> = {
  info: <Info size={11} className="text-blue-400 shrink-0 mt-0.5" />,
  success: <CheckCircle size={11} className="text-green-500 shrink-0 mt-0.5" />,
  error: <XCircle size={11} className="text-red-500 shrink-0 mt-0.5" />,
  processing: <Loader2 size={11} className="text-amber-500 shrink-0 mt-0.5 spinner" />,
  claude: <Sparkles size={11} className="text-purple-500 shrink-0 mt-0.5" />,
}

const COLORS: Record<LogType, string> = {
  info: 'text-gray-500',
  success: 'text-green-600',
  error: 'text-red-500',
  processing: 'text-amber-600',
  claude: 'text-purple-600',
}

export default function LogPanel() {
  const { logs } = useExcelStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-100 shrink-0 bg-gray-50">
        <Terminal size={11} className="text-gray-400" />
        <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">작업 로그</span>
        {logs.length > 0 && <span className="ml-auto text-xs text-gray-300">{logs.length}</span>}
      </div>
      <div className="flex-1 overflow-y-auto p-2 font-mono bg-gray-50">
        {logs.length === 0 ? (
          <p className="text-xs text-gray-300 text-center mt-3">파일을 업로드하면 로그가 표시됩니다</p>
        ) : (
          <div className="space-y-0.5">
            {logs.map((entry) => (
              <div key={entry.id} className={`log-entry flex items-start gap-1.5 text-xs py-0.5 ${COLORS[entry.type]}`}>
                {ICONS[entry.type]}
                <span className="text-gray-300 shrink-0">{entry.timestamp}</span>
                <span className="flex-1 break-words">{entry.message}</span>
              </div>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
