'use client'

import { useCallback, useRef, useState } from 'react'
import { Upload, FileSpreadsheet, X, Loader2, FileSearch } from 'lucide-react'
import { parseExcelBuffer, formatFileSize } from '@/lib/excel'
import { useExcelStore } from '@/lib/store'

/** 파일 분석 중 로딩 모달 */
function LoadingModal() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-white/80 backdrop-blur-sm" />
      <div className="relative bg-white border border-gray-200 rounded-2xl px-10 py-8 shadow-xl flex flex-col items-center gap-4 min-w-[280px]">
        {/* 아이콘 + 스피너 */}
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-green-50 border border-green-100 flex items-center justify-center">
            <FileSearch size={30} className="text-green-600" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-white rounded-full flex items-center justify-center border border-gray-100 shadow-sm">
            <Loader2 size={14} className="text-green-500 spinner" />
          </div>
        </div>

        <div className="text-center">
          <p className="text-base font-bold text-gray-800">엑셀 파일 분석 중</p>
          <p className="text-sm text-gray-400 mt-1">시트와 데이터를 읽고 있습니다...</p>
        </div>

        {/* 프로그레스 바 애니메이션 */}
        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-green-400 rounded-full animate-[progress_1.5s_ease-in-out_infinite]" style={{
            background: 'linear-gradient(90deg, #86efac, #22c55e, #16a34a, #22c55e, #86efac)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s linear infinite',
          }} />
        </div>
      </div>

      <style jsx>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  )
}

export default function ExcelUploader() {
  const { fileInfo, setFileInfo, setOriginalSheets, addLog, clearLogs, reset } = useExcelStore()
  const [isDragOver, setIsDragOver] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback(
    async (file: File) => {
      if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
        addLog('error', `지원하지 않는 형식: ${file.name} (.xlsx .xls .csv 가능)`)
        return
      }

      setIsLoading(true)
      clearLogs()
      addLog('info', `파일 로드: ${file.name}`)

      try {
        const buffer = await file.arrayBuffer()
        const sheets = parseExcelBuffer(buffer)
        setFileInfo({ name: file.name, size: file.size })
        setOriginalSheets(sheets)
        addLog('success', `로드 완료 — ${sheets.length}개 시트, ${formatFileSize(file.size)}`)
        sheets.forEach((s) =>
          addLog('info', `  📄 "${s.name}" — ${s.data.length}행 × ${(s.data[0]?.length ?? 0)}열`)
        )
        addLog('info', '오른쪽 패널에 명령을 입력하세요')
      } catch (err) {
        addLog('error', `파싱 오류: ${err instanceof Error ? err.message : '오류 발생'}`)
      } finally {
        setIsLoading(false)
      }
    },
    [addLog, clearLogs, setFileInfo, setOriginalSheets]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) processFile(file)
    },
    [processFile]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) processFile(file)
      if (inputRef.current) inputRef.current.value = ''
    },
    [processFile]
  )

  return (
    <>
      {/* 로딩 모달 */}
      {isLoading && <LoadingModal />}

      {fileInfo ? (
        <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg shadow-sm">
          <FileSpreadsheet size={15} className="text-green-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-800 truncate font-medium">{fileInfo.name}</p>
            <p className="text-xs text-gray-400">{formatFileSize(fileInfo.size)}</p>
          </div>
          <button
            onClick={reset}
            className="p-1 text-gray-400 hover:text-red-500 transition-colors rounded"
            title="파일 제거"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <div
          className={`relative border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all duration-200 ${
            isDragOver
              ? 'border-green-400 bg-green-50'
              : 'border-gray-200 hover:border-green-300 hover:bg-green-50/50 bg-white'
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleChange}
          />
          <Upload size={22} className={`mx-auto mb-2 ${isDragOver ? 'text-green-500' : 'text-gray-300'}`} />
          <p className="text-sm font-medium text-gray-600">파일을 드래그하거나 클릭하여 업로드</p>
          <p className="text-xs text-gray-400 mt-0.5">.xlsx · .xls · .csv</p>
        </div>
      )}
    </>
  )
}
