import { SheetData, SheetOp, CellValue } from '@/types'

/**
 * Claude의 연산 명세(SheetOp[])를 원본 시트 데이터에 적용하여
 * 수정된 시트 목록을 반환합니다.
 * 원본 데이터를 직접 수정하지 않고 깊은 복사본에 적용합니다.
 */
export function applyOperations(
  sheets: SheetData[],
  ops: SheetOp[]
): SheetData[] {
  // 깊은 복사
  const result: SheetData[] = sheets.map((s) => ({
    name: s.name,
    data: s.data.map((row) => [...row]),
  }))

  for (const op of ops) {
    const sheet = result.find((s) => s.name === op.sheet)
    if (!sheet) {
      // 시트명이 정확히 일치하지 않으면 유사 검색
      const fuzzy = result.find(
        (s) =>
          s.name.includes(op.sheet) ||
          op.sheet.includes(s.name) ||
          s.name.replace(/\s/g, '') === op.sheet.replace(/\s/g, '')
      )
      if (!fuzzy) continue
      applyOp(fuzzy, op)
    } else {
      applyOp(sheet, op)
    }
  }

  return result
}

function applyOp(sheet: SheetData, op: SheetOp) {
  switch (op.op) {
    /* ── 두 열 교환 ─────────────────────────────── */
    case 'swap_cols': {
      const a = op.col_a ?? 0
      const b = op.col_b ?? 1
      for (const row of sheet.data) {
        const tmp: CellValue = row[a] ?? ''
        row[a] = row[b] ?? ''
        row[b] = tmp
      }
      break
    }

    /* ── 조건 일치 행 삭제 ───────────────────────── */
    case 'delete_rows_where': {
      const col = op.col ?? 0
      const val = String(op.value ?? '')
      const match = op.match ?? 'exact'
      sheet.data = sheet.data.filter((row, idx) => {
        if (idx === 0) return true // 헤더 행 보존
        const cellStr = String(row[col] ?? '').trim()
        const isMatch =
          match === 'contains' ? cellStr.includes(val) : cellStr === val
        return !isMatch
      })
      break
    }

    /* ── 조건 일치 행만 유지 ─────────────────────── */
    case 'filter_keep': {
      const col = op.col ?? 0
      const val = String(op.value ?? '')
      const match = op.match ?? 'exact'
      sheet.data = sheet.data.filter((row, idx) => {
        if (idx === 0) return true // 헤더 행 보존
        const cellStr = String(row[col] ?? '').trim()
        return match === 'contains' ? cellStr.includes(val) : cellStr === val
      })
      break
    }

    /* ── 정렬 ───────────────────────────────────── */
    case 'sort_rows': {
      const col = op.col ?? 0
      const order = op.order ?? 'asc'
      if (sheet.data.length <= 1) break
      const header = sheet.data[0]
      const rows = sheet.data.slice(1)
      rows.sort((a, b) => {
        const va = a[col] ?? ''
        const vb = b[col] ?? ''
        // 숫자면 숫자 비교
        const na = Number(va)
        const nb = Number(vb)
        if (!isNaN(na) && !isNaN(nb)) {
          return order === 'asc' ? na - nb : nb - na
        }
        // 한국어 포함 문자열 비교
        const cmp = String(va).localeCompare(String(vb), 'ko', {
          numeric: true,
          sensitivity: 'base',
        })
        return order === 'asc' ? cmp : -cmp
      })
      sheet.data = [header, ...rows]
      break
    }

    /* ── 열 이름 변경 ───────────────────────────── */
    case 'rename_col': {
      const col = op.col ?? 0
      if (sheet.data[0]) {
        sheet.data[0][col] = op.new_name ?? ''
      }
      break
    }

    /* ── 열 삭제 ────────────────────────────────── */
    case 'delete_col': {
      const col = op.col ?? 0
      for (const row of sheet.data) {
        row.splice(col, 1)
      }
      break
    }

    /* ── 열 이동 ────────────────────────────────── */
    case 'move_col': {
      const from = op.from_col ?? 0
      const to = op.to_col ?? 0
      if (from === to) break
      for (const row of sheet.data) {
        const [cell] = row.splice(from, 1)
        row.splice(to, 0, cell ?? '')
      }
      break
    }
  }
}

/** 연산명 → 사람이 읽을 수 있는 설명 */
export function describeOp(op: SheetOp): string {
  const colLabel = (n?: number) => {
    if (n === undefined) return '?'
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    if (n < 26) return letters[n]
    return letters[Math.floor(n / 26) - 1] + letters[n % 26]
  }

  switch (op.op) {
    case 'swap_cols':
      return `${op.sheet}: ${colLabel(op.col_a)}열 ↔ ${colLabel(op.col_b)}열 교환`
    case 'delete_rows_where':
      return `${op.sheet}: ${colLabel(op.col)}열에서 "${op.value}" 행 삭제`
    case 'filter_keep':
      return `${op.sheet}: ${colLabel(op.col)}열에서 "${op.value}" 행만 유지`
    case 'sort_rows':
      return `${op.sheet}: ${colLabel(op.col)}열 기준 ${op.order === 'desc' ? '내림차순' : '오름차순'} 정렬`
    case 'rename_col':
      return `${op.sheet}: ${colLabel(op.col)}열 이름 → "${op.new_name}"`
    case 'delete_col':
      return `${op.sheet}: ${colLabel(op.col)}열 삭제`
    case 'move_col':
      return `${op.sheet}: ${colLabel(op.from_col)}열 → ${colLabel(op.to_col)}열로 이동`
    default:
      return `${op.sheet}: ${op.op}`
  }
}
