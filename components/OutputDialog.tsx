'use client'

import { useState } from 'react'
import { Download, FunctionSquare, Hash, X, CheckCircle } from 'lucide-react'
import { useExcelStore } from '@/lib/store'
import { downloadExcel } from '@/lib/excel'

export default function OutputDialog() {
  const { claudeResult, fileInfo, setShowOutputDialog, addLog } = useExcelStore()
  const [selected, setSelected] = useState<'formula' | 'value' | null>(null)
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async (mode: 'formula' | 'value') => {
    if (!claudeResult) return
    setSelected(mode)
    setDownloading(true)
    try {
      const sheets = mode === 'formula' ? claudeResult.resultSheets : claudeResult.resultSheetsValueOnly
      const base = fileInfo?.name.replace(/\.(xlsx|xls|csv)$/i, '') ?? 'result'
      const filename = `${base}_${mode === 'formula' ? '함수포함' : '값전용'}.xlsx`
      downloadExcel(sheets, filename)
      addLog('success', `다운로드: ${filename}`)
      setTimeout(() => setShowOutputDialog(false), 600)
    } catch (err) {
      addLog('error', `다운로드 실패: ${err instanceof Error ? err.message : '오류'}`)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowOutputDialog(false)} />
      <div className="relative bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl glow-green">
        <button onClick={() => setShowOutputDialog(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors">
          <X size={16} />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-green-50 rounded-lg border border-green-100">
            <Download size={18} className="text-green-600" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">결과물 생성 방식 선택</h2>
            <p className="text-xs text-gray-400 mt-0.5">다운로드 형식을 선택하세요</p>
          </div>
        </div>

        {claudeResult?.summary && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
            <p className="text-xs text-gray-600">
              <span className="text-green-600 font-semibold">처리 완료:</span> {claudeResult.summary}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handleDownload('formula')}
            disabled={downloading}
            className={`flex flex-col items-center gap-2.5 p-4 rounded-xl border-2 transition-all ${
              selected === 'formula'
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
            } disabled:opacity-50`}
          >
            <FunctionSquare size={24} className="text-blue-500" />
            <div className="text-center">
              <p className="text-xs font-bold text-gray-800">함수 포함 생성</p>
              <p className="text-xs text-gray-400 mt-0.5">=SUM, =AVERAGE 등<br />엑셀 수식 유지</p>
            </div>
            {selected === 'formula' && <CheckCircle size={14} className="text-blue-500" />}
          </button>

          <button
            onClick={() => handleDownload('value')}
            disabled={downloading}
            className={`flex flex-col items-center gap-2.5 p-4 rounded-xl border-2 transition-all ${
              selected === 'value'
                ? 'border-green-400 bg-green-50'
                : 'border-gray-200 hover:border-green-300 hover:bg-green-50/50'
            } disabled:opacity-50`}
          >
            <Hash size={24} className="text-green-600" />
            <div className="text-center">
              <p className="text-xs font-bold text-gray-800">값으로만 생성</p>
              <p className="text-xs text-gray-400 mt-0.5">계산된 결과값만<br />순수 데이터 저장</p>
            </div>
            {selected === 'value' && <CheckCircle size={14} className="text-green-600" />}
          </button>
        </div>

        <p className="mt-3 text-xs text-gray-400 text-center">
          {claudeResult?.resultSheets.length ?? 0}개 결과 시트 → Excel (.xlsx)
        </p>
      </div>
    </div>
  )
}
