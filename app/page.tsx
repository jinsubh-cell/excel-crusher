'use client'

import { Zap } from 'lucide-react'
import ExcelUploader from '@/components/ExcelUploader'
import SheetViewer from '@/components/SheetViewer'
import ClaudePanel from '@/components/ClaudePanel'
import LogPanel from '@/components/LogPanel'
import OutputDialog from '@/components/OutputDialog'
import { useExcelStore } from '@/lib/store'

export default function Home() {
  const { showOutputDialog } = useExcelStore()

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-50">
      {/* 헤더 */}
      <header className="flex items-center gap-3 px-5 py-2.5 border-b border-gray-200 bg-white shrink-0 shadow-sm">
        <div className="flex items-center justify-center w-7 h-7 bg-green-50 rounded-lg border border-green-100">
          <Zap size={14} className="text-green-600" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-gray-900 leading-none">엑셀 깨부수기</h1>
          <p className="text-xs text-gray-400 leading-none mt-0.5">AI Excel Editor powered by Claude</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-gray-400">Claude 3.5 Sonnet</span>
        </div>
      </header>

      {/* 메인 */}
      <main className="flex flex-1 overflow-hidden">
        {/* ── 좌측 패널 (60%) ── */}
        <div className="flex flex-col w-[60%] border-r border-gray-200 overflow-hidden bg-white">
          {/* 파일 업로드 */}
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 shrink-0">
            <ExcelUploader />
          </div>

          {/* 시트 뷰어 */}
          <div className="flex-1 overflow-hidden bg-white">
            <SheetViewer />
          </div>

          {/* 로그 패널 */}
          <div className="h-[180px] border-t border-gray-100 bg-gray-50 overflow-hidden shrink-0">
            <LogPanel />
          </div>
        </div>

        {/* ── 우측 패널 — Claude AI (Excel 확장 스타일 고정 너비) ── */}
        <div className="w-[340px] min-w-[340px] bg-white overflow-hidden border-l border-gray-200">
          <ClaudePanel />
        </div>
      </main>

      {/* 다운로드 다이얼로그 */}
      {showOutputDialog && <OutputDialog />}
    </div>
  )
}
