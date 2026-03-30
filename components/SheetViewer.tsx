'use client'

import { useMemo, useRef, useState, useCallback } from 'react'
import { FileSpreadsheet, Sparkles, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { useExcelStore } from '@/lib/store'
import { SheetData } from '@/types'

/** 숫자 인덱스 → 엑셀 컬럼 문자 (0→A, 1→B, 25→Z, 26→AA ...) */
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

/** 엑셀과 동일한 그리드 테이블 */
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
    <div className="overflow-auto h-full w-full">
      <table
        className="text-xs border-collapse"
        style={{ tableLayout: 'fixed', minWidth: `${colCount * 100 + 50}px` }}
      >
        {/* ── 컬럼 너비 설정 ── */}
        <colgroup>
          {/* 행 번호 열 */}
          <col style={{ width: '42px', minWidth: '42px' }} />
          {Array.from({ length: colCount }).map((_, i) => (
            <col key={i} style={{ width: '100px', minWidth: '80px' }} />
          ))}
        </colgroup>

        <thead className="sticky top-0 z-20">
          <tr>
            {/* 좌상단 코너 (비어 있음) */}
            <th className="bg-gray-100 border border-gray-300 text-center select-none" />
            {/* A, B, C ... 컬럼 레터 */}
            {Array.from({ length: colCount }).map((_, ci) => (
              <th
                key={ci}
                className="bg-gray-100 border border-gray-300 px-1 py-1 text-center text-gray-600 font-bold select-none tracking-wide"
              >
                {colLetter(ci)}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.slice(0, 5000).map((row, ri) => (
            <tr key={ri} className="group hover:bg-blue-50/60 transition-colors">
              {/* 행 번호 (1, 2, 3 ...) */}
              <td className="bg-gray-50 border border-gray-200 text-center text-gray-500 font-bold select-none text-[11px] sticky left-0 z-10">
                {ri + 1}
              </td>
              {/* 데이터 셀 */}
              {Array.from({ length: colCount }).map((_, ci) => {
                const val = row[ci]
                const isFormula = typeof val === 'string' && val.startsWith('=')
                const isNumber = typeof val === 'number' || (!isFormula && val !== '' && val !== null && val !== undefined && !isNaN(Number(val)))
                const displayVal = val === null || val === undefined ? '' : String(val)
                return (
                  <td
                    key={ci}
                    className={`border border-gray-200 px-2 py-1 overflow-hidden text-ellipsis whitespace-nowrap max-w-[200px] ${
                      isFormula
                        ? 'text-blue-600 font-mono bg-blue-50/30'
                        : isNumber && displayVal !== ''
                        ? 'text-right text-gray-800'
                        : 'text-left text-gray-700'
                    }`}
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

/** 많은 탭을 좌우 스크롤로 처리하는 탭 바 */
function TabBar({
  tabs,
  activeTab,
  onSelect,
}: {
  tabs: { name: string; isResult: boolean; isStreaming?: boolean }[]
  activeTab: string
  onSelect: (name: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 0)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  const scroll = (dir: 'left' | 'right') => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' })
      setTimeout(updateScrollState, 300)
    }
  }

  return (
    <div className="flex items-end border-b border-gray-200 bg-gray-50 shrink-0 overflow-hidden">
      {/* 왼쪽 화살표 */}
      <button
        onClick={() => scroll('left')}
        disabled={!canScrollLeft}
        className="shrink-0 p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-20 disabled:cursor-default border-r border-gray-200 bg-gray-50 self-stretch flex items-center transition-colors"
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
        {tabs.map((tab) => (
          <button
            key={tab.name}
            onClick={() => onSelect(tab.name)}
            className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-t whitespace-nowrap transition-all shrink-0 border border-b-0 ${
              activeTab === tab.name
                ? tab.isResult || tab.isStreaming
                  ? 'bg-white text-green-700 border-green-200 font-semibold shadow-sm'
                  : 'bg-white text-gray-800 border-gray-200 font-semibold shadow-sm'
                : tab.isResult || tab.isStreaming
                ? 'text-green-600 border-transparent hover:bg-white/70 hover:border-green-100'
                : 'text-gray-500 border-transparent hover:bg-white/70 hover:border-gray-200'
            }`}
          >
            {tab.isStreaming ? (
              <Loader2 size={9} className="text-green-500 shrink-0 animate-spin" />
            ) : tab.isResult ? (
              <Sparkles size={9} className="text-green-500 shrink-0" />
            ) : null}
            <span className="max-w-[120px] truncate">{tab.name}</span>
          </button>
        ))}
      </div>

      {/* 오른쪽 화살표 */}
      <button
        onClick={() => scroll('right')}
        disabled={!canScrollRight}
        className="shrink-0 p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-20 disabled:cursor-default border-l border-gray-200 bg-gray-50 self-stretch flex items-center transition-colors"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  )
}

export default function SheetViewer() {
  const {
    originalSheets, claudeResult, streamingSheets,
    activeTab, setActiveTab, isProcessing,
  } = useExcelStore()

  // 스트리밍 중이면 streamingSheets, 완료되면 claudeResult 시트 표시
  const resultList = claudeResult?.resultSheets ?? (isProcessing ? streamingSheets : [])
  const isShowingStreaming = !claudeResult && isProcessing && streamingSheets.length > 0

  const allTabs = useMemo(() => {
    const orig = originalSheets.map((s) => ({ ...s, isResult: false, isStreaming: false }))
    const result = resultList.map((s) => ({
      ...s,
      isResult: !!claudeResult,
      isStreaming: isShowingStreaming,
    }))
    return [...orig, ...result]
  }, [originalSheets, resultList, claudeResult, isShowingStreaming])

  const activeSheet = useMemo(
    () => allTabs.find((t) => t.name === activeTab),
    [allTabs, activeTab]
  )

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
      {/* 탭 바 (시트 많아도 스크롤 가능) */}
      <TabBar
        tabs={allTabs.map((t) => ({ name: t.name, isResult: t.isResult, isStreaming: t.isStreaming }))}
        activeTab={activeTab}
        onSelect={setActiveTab}
      />

      {/* 시트 메타 정보 */}
      {activeSheet && (
        <div className="flex items-center gap-3 px-3 py-1 bg-white border-b border-gray-100 shrink-0">
          <span className="text-xs text-gray-400">
            {activeSheet.data.length.toLocaleString()}행 ×{' '}
            {(activeSheet.data[0]?.length ?? 0).toLocaleString()}열
          </span>
          {activeSheet.isStreaming && (
            <span className="text-xs text-green-600 flex items-center gap-1 font-medium">
              <Loader2 size={9} className="animate-spin" /> 생성 중...
            </span>
          )}
          {activeSheet.isResult && !activeSheet.isStreaming && (
            <span className="text-xs text-green-600 flex items-center gap-1 font-medium">
              <Sparkles size={9} /> Claude 결과 시트
            </span>
          )}
        </div>
      )}

      {/* 데이터 그리드 */}
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
