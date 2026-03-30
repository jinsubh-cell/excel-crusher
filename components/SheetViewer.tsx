'use client'

import { useMemo, useRef, useState, useCallback } from 'react'
import { FileSpreadsheet, Sparkles, ChevronLeft, ChevronRight, Loader2, Download, Pencil } from 'lucide-react'
import { useExcelStore } from '@/lib/store'
import { downloadExcel } from '@/lib/excel'
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
  onDownload,
}: {
  tabs: { name: string; isResult: boolean; isModified?: boolean; isStreaming?: boolean }[]
  activeTab: string
  onSelect: (name: string) => void
  onDownload: () => void
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
                ? tab.isResult || tab.isModified || tab.isStreaming
                  ? 'bg-white text-green-700 border-green-200 font-semibold shadow-sm'
                  : 'bg-white text-gray-800 border-gray-200 font-semibold shadow-sm'
                : tab.isResult || tab.isModified || tab.isStreaming
                ? 'text-green-600 border-transparent hover:bg-white/70 hover:border-green-100'
                : 'text-gray-500 border-transparent hover:bg-white/70 hover:border-gray-200'
            }`}
          >
            {tab.isStreaming ? (
              <Loader2 size={9} className="text-green-500 shrink-0 animate-spin" />
            ) : tab.isModified ? (
              <Pencil size={9} className="text-amber-500 shrink-0" />
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

      {/* ── 저장 버튼 (탭바 맨 오른쪽) ── */}
      <button
        onClick={onDownload}
        title="현재 미리보기 내용 다운로드"
        className="shrink-0 flex items-center gap-1.5 px-3 self-stretch border-l border-gray-200 text-xs font-medium transition-colors text-gray-500 bg-gray-50 hover:bg-green-50 hover:text-green-700 hover:border-green-100"
      >
        <Download size={13} />
        <span>저장</span>
      </button>
    </div>
  )
}

export default function SheetViewer() {
  const {
    originalSheets, claudeResult, streamingSheets,
    activeTab, setActiveTab, isProcessing, fileInfo,
  } = useExcelStore()

  // 스트리밍 중이면 streamingSheets, 완료되면 claudeResult 시트 표시
  const isShowingStreaming = !claudeResult && isProcessing && streamingSheets.length > 0

  const allTabs = useMemo(() => {
    // 스트리밍 중: 원본 + 스트리밍 시트 표시
    if (isShowingStreaming) {
      const streamingNames = new Set(streamingSheets.map(s => s.name))
      const origFiltered = originalSheets
        .filter(s => !streamingNames.has(s.name))
        .map(s => ({ ...s, isResult: false, isModified: false, isStreaming: false }))
      const streamTabs = streamingSheets.map(s => ({
        ...s, isResult: false, isModified: false, isStreaming: true,
      }))
      return [...origFiltered, ...streamTabs]
    }

    // 결과가 있는 경우
    if (claudeResult && claudeResult.resultSheets.length > 0) {
      const origNameSet = new Set(originalSheets.map(s => s.name))
      const resultMap = new Map(claudeResult.resultSheets.map(s => [s.name, s]))

      // 방식 A: 결과 시트가 원본과 같은 이름 → 원본 탭에 수정된 데이터 표시
      const isMethodA = claudeResult.resultSheets.some(r => origNameSet.has(r.name))

      if (isMethodA) {
        // 원본 탭 이름 유지, 데이터만 수정본으로 교체 (✏️ 아이콘으로 수정됨 표시)
        const origTabs = originalSheets.map(s => ({
          name: s.name,
          data: resultMap.get(s.name)?.data ?? s.data,
          isResult: false,
          isModified: resultMap.has(s.name),  // 수정된 탭 표시
          isStreaming: false,
        }))
        // 결과 중 원본에 없는 새 시트도 추가 (드문 경우)
        const extraResultSheets = claudeResult.resultSheets
          .filter(r => !origNameSet.has(r.name))
          .map(s => ({ ...s, isResult: true, isModified: false, isStreaming: false }))
        return [...origTabs, ...extraResultSheets]
      } else {
        // 방식 B: 원본 유지 + 새 결과 시트 추가 (✨ 아이콘)
        return [
          ...originalSheets.map(s => ({ ...s, isResult: false, isModified: false, isStreaming: false })),
          ...claudeResult.resultSheets.map(s => ({ ...s, isResult: true, isModified: false, isStreaming: false })),
        ]
      }
    }

    // 기본: 원본 시트만
    return originalSheets.map(s => ({ ...s, isResult: false, isModified: false, isStreaming: false }))
  }, [originalSheets, claudeResult, streamingSheets, isShowingStreaming])

  const activeSheet = useMemo(
    () => allTabs.find((t) => t.name === activeTab),
    [allTabs, activeTab]
  )

  // 다운로드 핸들러 — 현재 미리보기에 표시된 내용 그대로 다운로드
  const handleDownload = useCallback(() => {
    if (allTabs.length === 0) return
    const base = fileInfo?.name.replace(/\.(xlsx|xls|csv)$/i, '') ?? 'excel'
    const hasModified = allTabs.some(t => t.isModified || t.isResult)
    const suffix = hasModified ? '_수정본' : ''
    // allTabs에는 방식A 수정 데이터가 이미 반영되어 있음
    downloadExcel(
      allTabs.map(t => ({ name: t.name, data: t.data })),
      `${base}${suffix}.xlsx`
    )
  }, [allTabs, fileInfo])

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
      {/* 탭 바 (시트 많아도 스크롤 가능) + 다운로드 버튼 */}
      <TabBar
        tabs={allTabs.map((t) => ({
          name: t.name,
          isResult: t.isResult,
          isModified: t.isModified,
          isStreaming: t.isStreaming,
        }))}
        activeTab={activeTab}
        onSelect={setActiveTab}
        onDownload={handleDownload}
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
          {activeSheet.isModified && (
            <span className="text-xs text-amber-600 flex items-center gap-1 font-medium">
              <Pencil size={9} /> AI 수정 적용됨
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
