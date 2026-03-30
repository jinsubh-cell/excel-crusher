import * as XLSX from 'xlsx'
import { SheetData, CellValue } from '@/types'

export function parseExcelBuffer(buffer: ArrayBuffer): SheetData[] {
  const wb = XLSX.read(new Uint8Array(buffer), {
    type: 'array',
    cellDates: false, // raw: false가 셀 포맷 문자열로 변환해 줌
    cellNF: false,
    raw: false,       // Excel 셀 서식 그대로 표시 (날짜 포맷, 숫자 콤마 등)
  })

  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name]
    // blankrows: true로 변경 → 원본 행 번호 보존
    const data = XLSX.utils.sheet_to_json<CellValue[]>(ws, {
      header: 1,
      defval: '',
      blankrows: true,  // 빈 행도 포함해 원본 행 번호 유지
      raw: false,       // 셀 서식 적용된 값 반환 (1,234,567 / 2026-01-15 등)
    }) as CellValue[][]

    // 맨 끝의 완전한 빈 행 제거 (trailing empty rows만)
    while (data.length > 0) {
      const last = data[data.length - 1]
      if (last.every((c) => c === '' || c === null || c === undefined)) {
        data.pop()
      } else {
        break
      }
    }

    return { name, data }
  })
}

export function downloadExcel(sheets: SheetData[], filename: string) {
  const wb = XLSX.utils.book_new()

  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.data)
    const colWidths = (sheet.data[0] ?? []).map((_, colIdx) => {
      const maxLen = sheet.data.reduce((max, row) => {
        const cell = String(row[colIdx] ?? '')
        return Math.max(max, cell.length)
      }, 10)
      return { wch: Math.min(maxLen + 2, 50) }
    })
    ws['!cols'] = colWidths
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31))
  }

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Claude에 보낼 데이터 준비
 * - 명령어 키워드와 일치하는 행은 반드시 포함
 * - 나머지는 maxRowsPerSheet 한도 내 앞 행부터 포함
 */
export function sheetsToClaudeInput(
  sheets: SheetData[],
  command: string = '',
  maxRowsPerSheet = 1000
): SheetData[] {
  // 명령어에서 2글자 이상 키워드 추출
  const keywords = command
    .split(/[\s,。、]+/)
    .map((k) => k.trim())
    .filter((k) => k.length >= 2)

  return sheets.map((sheet) => {
    const allRows = sheet.data
    const total = allRows.length

    // 행이 maxRowsPerSheet 이하면 그대로 전송
    if (total <= maxRowsPerSheet) {
      return { name: sheet.name, data: allRows }
    }

    // 헤더행 (첫 번째 행)은 항상 포함
    const header = allRows.slice(0, 1)
    const dataRows = allRows.slice(1)

    // 키워드가 있는 경우 매칭 행 우선 포함
    let matchingRows: CellValue[][] = []
    let otherRows: CellValue[][] = []

    if (keywords.length > 0) {
      for (const row of dataRows) {
        const rowStr = row.map((c) => String(c ?? '')).join('\t')
        const isMatch = keywords.some((kw) => rowStr.includes(kw))
        if (isMatch) {
          matchingRows.push(row)
        } else {
          otherRows.push(row)
        }
      }
    } else {
      otherRows = dataRows
    }

    // 매칭 행 전부 + 남은 슬롯에 일반 행 채우기
    const remainingSlots = Math.max(0, maxRowsPerSheet - 1 - matchingRows.length)
    const sampleOthers = otherRows.slice(0, remainingSlots)

    const resultRows = [...matchingRows, ...sampleOthers]
    const sentRows = resultRows.length

    // 메타 정보 행 추가 (Claude에게 전체 크기 알림)
    const metaRow: CellValue[] = [
      `[데이터 요약: 전체 ${total}행 중 키워드 매칭 ${matchingRows.length}행 + 샘플 ${sampleOthers.length}행 전송. 누락 ${total - 1 - sentRows}행]`,
    ]

    return {
      name: sheet.name,
      data: [...header, ...resultRows, metaRow],
    }
  })
}
