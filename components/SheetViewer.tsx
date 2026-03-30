'use client'

import { useMemo, useRef, useState, useCallback } from 'react'
import {
  FileSpreadsheet, Sparkles, ChevronLeft, ChevronRight,
  Loader2, Download, Pencil, X,
} from 'lucide-react'
import { useExcelStore } from '@/lib/store'
import { downloadExcel } from '@/lib/excel'
import { SheetData } from '@/types'

/** 숫자 인덱스 → 엑셀 컬럼 문자 */
function colLetter(index: number): string {
  let result = ''
  let n = index + 1
  while (n > 0) {
    n--
    result = String.fromCharCode(65 + (n % 26)) + result
    n = Math.floor(n / 26)
  }
  return result
}

/** 엑셀 그리드 — 상하좌우 스크롤 + 고정 헤더/행번호 */
function DataTable({ sheet }: { sheet: SheetData }) {
  const rows = sheet.data
  const colCount = useMemo(
    () => rows.reduce((max, row) => Math.max(max, row.length), 0),
    [rows]
  )

  if (rows.length === 0 || colCount === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        데이터가 없습니다
      </div>
    )
  }

  return (
    /* ── 스크롤 컨테이너: 상하좌우 모두 스크롤 가능 ── */
    <div
      className="h-full w-full"
      style={{
        overflow: 'auto',
        overflowX: 'auto',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <table
        className="text-xs border-collapse"
        style={{
          tableLayout: 'fixed',
          minWidth: `${colCount * 100 + 50}px`,
          width: `${colCount * 100 + 50}px`,
        }}
      >
        <colgroup>
          <col style={{ width: '42px', minWidth: '42px' }} />
          {Array.from({ length: colCount }).map((_, i) => (
            <col key={i} style={{ width: '100px', minWidth: '80px' }} />
          ))}
        </colgroup>

        {/* ── 컬럼 헤더 (상단 고정) ── */}
        <thead style={{ position: 'sticky', top: 0, zIndex: 20 }}>
          <tr>
            <th
              className="border border-gray-300 text-center select-none"
              style={{
                background: '#f1f5f9',
                position: 'sticky',
                left: 0,
                zIndex: 30,
                width: 42,
              }}
            />
            {Array.from({ length: colCount }).map((_, ci) => (
              <th
                key={ci}
                className="border border-gray-300 px-1 py-1 text-center text-gray-600 font-bold select-none tracking-wide bg-gray-100"
              >
                {colLetter(ci)}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.slice(0, 5000).map((row, ri) => (
            <tr key={ri} className="hover:bg-blue-50/60 transition-colors">
              {/* 행 번호 (좌측 고정) */}
              <td
                className="border border-gray-200 text-center text-gray-500 font-bold select-none text-[11px]"
                style={{
                  background: '#f8fafc',
                  position: 'sticky',
                  left: 0,
                  zIndex: 10,
                  width: 42,
                }}
              >
                {ri + 1}
              </td>
              {Array.from({ length: colCount }).map((_, ci) => {
                const val = row[ci]
                const isFormula = typeof val === 'string' && val.startsWith('=')
                const isNumber =
                  typeof val === 'number' ||
                  (!isFormula && val !== '' && val !== null && val !== undefined && !isNaN(Number(val)))
                const displayVal = val === null || val === undefined ? '' : String(val)
                return (
                  <td
                    key={ci}
                    className={`border border-gray-200 px-2 py-1 overflow-hidden text-ellipsis whitespace-nowrap ${
                      isFormula
                        ? 'text-blue-600 font-mono bg-blue-50/30'
                        : isNumber && displayVal !== ''
                        ? 'text-right text-gray-800'
                        : 'text-left text-gray-700'
                    }`}
                    style={{ maxWidth: 200 }}
                    title={displayVal}
                  >
                    {displayVal}
                  </td>
                )
              })}
            </tr>
          ))}
          {rows.length > 5000 && (
            <tr>
              <td
                colSpan={colCount + 1}
                className="text-center text-gray-400 text-xs py-2 border border-gray-200 bg-gray-50"
              >
                ... {rows.length - 5000}개 행 더 있음 (최대 5000행 표시)
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

/** 탭 바 — 이름 변경(더블클릭), 삭제(×) 지원 */
function TabBar({
  tabs,
  activeTab,
  onSelect,
  onRename,
  onDelete,
  onDownload,
}: {
  tabs: { name: string; isResult: boolean; isStreaming?: boolean }[]
  activeTab: string
  onSelect: (name: string) => void
  onRename: (oldName: string, newName: string) => void
  onDelete: (name: string) => void
  onDownload: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [editingTab, setEditingTab] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 0)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' })
    setTimeout(updateScrollState, 300)
  }

  const startEdit = (e: React.MouseEvent, name: string) => {
    e.stopPropagation()
    setEditingTab(name)
    setEditingValue(name)
    setTimeout(() => {
      editInputRef.current?.focus()
      editInputRef.current?.select()
    }, 0)
  }

  const commitEdit = () => {
    if (editingTab !== null) {
      onRename(editingTab, editingValue)
    }
    setEditingTab(null)
  }

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
    if (e.key === 'Escape') setEditingTab(null)
  }

  return (
    <div className="flex items-end border-b border-gray-200 bg-gray-50 shrink-0 overflow-hidden">
      {/* 왼쪽 화살표 */}
      <button
        onClick={() => scroll('left')}
        disabled={!canScrollLeft}
        className="shrink-0 p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-20 disabled:cursor-default border-r border-gray-200 bg-gray-50 self-stretch flex items-center"
      >
        <ChevronLeft size={14} />
      </button>

      {/* 탭 스크롤 영역 */}
      <div
        ref={scrollRef}
        onScroll={updateScrollState}
        className="flex gap-0.5 px-1 pt-1.5 overflow-x-auto flex-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <style jsx>{`div::-webkit-scrollbar { display: none; }`}</style>

        {tabs.map((tab) => {
          const isActive = activeTab === tab.name
          const isEditing = editingTab === tab.name
          return (
            <div
              key={tab.name}
              role="button"
              tabIndex={0}
              onClick={() => !isEditing && onSelect(tab.name)}
              onDoubleClick={(e) => !tab.isStreaming && startEdit(e, tab.name)}
              className={`group flex items-center gap-1 pl-2.5 pr-1 py-1.5 text-xs rounded-t whitespace-nowrap transition-all shrink-0 border border-b-0 cursor-pointer select-none outline-none ${
                isActive
                  ? tab.isResult || tab.isStreaming
                    ? 'bg-white text-green-700 border-green-300 font-semibold shadow-sm'
                    : 'bg-white text-gray-800 border-gray-200 font-semibold shadow-sm'
                  : tab.isResult || tab.isStreaming
                  ? 'text-green-600 border-transparent hover:bg-white/70 hover:border-green-100'
                  : 'text-gray-500 border-transparent hover:bg-white/70 hover:border-gray-200'
              }`}
            >
              {/* 아이콘 */}
              {tab.isStreaming ? (
                <Loader2 size={9} className="text-green-500 shrink-0 animate-spin" />
              ) : tab.isResult ? (
                <Sparkles size={9} className="text-green-500 shrink-0" />
              ) : null}

              {/* 이름 또는 인라인 편집 입력 */}
              {isEditing ? (
                <input
                  ref={editInputRef}
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={handleEditKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  className="w-20 text-xs border border-blue-400 rounded px-1 py-0 outline-none bg-blue-50 text-gray-800 font-normal"
                  style={{ height: '18px' }}
                />
              ) : (
                <span
                  className="max-w-[100px] truncate"
                  title={`더블클릭으로 이름 변경: ${tab.name}`}
                >
                  {tab.name}
                </span>
              )}

              {/* × 삭제 버튼 — 스트리밍 중 제외 */}
              {!tab.isStreaming && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(tab.name)
                  }}
                  title={`"${tab.name}" 시트 삭제`}
                  className={`shrink-0 rounded p-0.5 transition-all ml-0.5 ${
                    isActive
                      ? 'opacity-60 hover:opacity-100 hover:bg-red-100 hover:text-red-500 text-gray-500'
                      : 'opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-red-100 hover:text-red-500 text-gray-400'
                  }`}
                >
                  <X size={9} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* 오른쪽 화살표 */}
      <button
        onClick={() => scroll('right')}
        disabled={!canScrollRight}
        className="shrink-0 p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-20 disabled:cursor-default border-l border-gray-200 bg-gray-50 self-stretch flex items-center"
      >
        <ChevronRight size={14} />
      </button>

      {/* 저장 버튼 (맨 오른쪽) */}
      <button
        onClick={onDownload}
        title="현재 미리보기 다운로드"
        className="shrink-0 flex items-center gap-1.5 px-3 self-stretch border-l border-gray-200 text-xs font-medium transition-colors text-gray-500 bg-gray-50 hover:bg-green-50 hover:text-green-700"
      >
        <Download size={13} />
        <span>저장</span>
      </button>
    </div>
  )
}

export default function SheetViewer() {
  const {
    originalSheets,
    resultWorkingSheets,
    resultTabName,
    streamingSheets,
    activeTab,
    setActiveTab,
    isProcessing,
    fileInfo,
    renameSheet,
    deleteSheet,
  } = useExcelStore()

  const isShowingStreaming = !!(isProcessing && streamingSheets.length > 0)

  /* ── 탭 목록 구성 ── */
  const allTabs = useMemo(() => {
    const origTabs = originalSheets.map(s => ({
      ...s,
      isResult: false,
      isStreaming: false,
    }))

    // 스트리밍 중: 원본 + 스트리밍 시트
    if (isShowingStreaming) {
      const streamingNames = new Set(streamingSheets.map(s => s.name))
      const origFiltered = origTabs.filter(t => !streamingNames.has(t.name))
      return [
        ...origFiltered,
        ...streamingSheets.map(s => ({ ...s, isResult: false, isStreaming: true })),
      ]
    }

    // 결과물 시트 있음: 원본 탭 + 결과물 탭 (resultTabName으로 표시)
    if (resultWorkingSheets.length > 0) {
      const resultTab: SheetData & { isResult: boolean; isStreaming: boolean } = {
        name: resultTabName,
        data: resultWorkingSheets[0].data,
        isResult: true,
        isStreaming: false,
      }
      return [...origTabs, resultTab]
    }

    return origTabs
  }, [originalSheets, resultWorkingSheets, resultTabName, streamingSheets, isShowingStreaming])

  const activeSheet = useMemo(
    () => allTabs.find(t => t.name === activeTab),
    [allTabs, activeTab]
  )

  /* ── 저장 버튼: 결과물 시트 우선 다운로드 ── */
  const handleDownload = useCallback(() => {
    const base = fileInfo?.name.replace(/\.(xlsx|xls|csv)$/i, '') ?? 'excel'
    if (resultWorkingSheets.length > 0) {
      downloadExcel(resultWorkingSheets, `${base}_결과물.xlsx`)
    } else if (originalSheets.length > 0) {
      downloadExcel(originalSheets, `${base}.xlsx`)
    }
  }, [resultWorkingSheets, originalSheets, fileInfo])

  if (allTabs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <FileSpreadsheet size={36} className="text-gray-200" />
        <p className="text-sm text-gray-400">엑셀 파일을 업로드하면 여기 표시됩니다</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* 탭 바 + 저장 버튼 */}
      <TabBar
        tabs={allTabs.map(t => ({ name: t.name, isResult: t.isResult, isStreaming: t.isStreaming }))}
        activeTab={activeTab}
        onSelect={setActiveTab}
        onRename={renameSheet}
        onDelete={deleteSheet}
        onDownload={handleDownload}
      />

      {/* 시트 메타 정보 */}
      {activeSheet && (
        <div className="flex items-center gap-3 px-3 py-1 bg-white border-b border-gray-100 shrink-0">
          <span className="text-xs text-gray-400">
            {activeSheet.data.length.toLocaleString()}행 ×{' '}
            {(activeSheet.data[0]?.length ?? 0).toLocaleString()}열
          </span>
          <span className="text-[10px] text-gray-300">더블클릭으로 탭 이름 변경 · × 로 삭제</span>
          {activeSheet.isStreaming && (
            <span className="text-xs text-green-600 flex items-center gap-1 font-medium">
              <Loader2 size={9} className="animate-spin" /> 생성 중...
            </span>
          )}
          {activeSheet.isResult && !activeSheet.isStreaming && (
            <span className="text-xs text-green-600 flex items-center gap-1 font-medium">
              <Sparkles size={9} /> 결과물 시트 — 원본은 변경되지 않습니다
            </span>
          )}
          {!activeSheet.isResult && !activeSheet.isStreaming && resultWorkingSheets.length > 0 && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Pencil size={9} /> 원본 시트 (보기 전용)
            </span>
          )}
        </div>
      )}

      {/* 데이터 그리드 (상하좌우 스크롤) */}
      <div className="flex-1 overflow-hidden bg-white">
        {activeSheet ? (
          <DataTable sheet={activeSheet} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-300 text-sm">
            시트를 선택하세요
          </div>
        )}
      </div>
    </div>
  )
}
