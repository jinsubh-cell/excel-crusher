export type CellValue = string | number | boolean | null | undefined

export interface SheetData {
  name: string
  data: CellValue[][]
}

/** Claude가 반환하는 연산 명세 (방식 A) */
export interface SheetOp {
  op:
    | 'swap_cols'             // 두 열 교환
    | 'delete_rows_where'     // 조건 행 삭제
    | 'delete_rows_by_index'  // 행 번호 기반 삭제 (1번~N번)
    | 'filter_keep'           // 조건 행만 유지
    | 'sort_rows'             // 정렬
    | 'rename_col'            // 열 이름 변경
    | 'delete_col'            // 열 삭제
    | 'move_col'              // 열 이동
  sheet: string               // 대상 시트명
  col?: number                // 열 번호 (0부터)
  col_a?: number              // swap_cols: 첫 번째 열
  col_b?: number              // swap_cols: 두 번째 열
  from_col?: number           // move_col: 원래 위치
  to_col?: number             // move_col: 이동할 위치
  row_from?: number           // delete_rows_by_index: 시작 행 번호 (1부터, 헤더 제외)
  row_to?: number             // delete_rows_by_index: 끝 행 번호
  value?: string              // 검색값
  match?: 'exact' | 'contains'   // 매칭 방식
  order?: 'asc' | 'desc'     // sort_rows: 정렬 방향
  new_name?: string           // rename_col: 새 이름
}

export interface ClaudeResult {
  resultSheets: SheetData[]
  resultSheetsValueOnly: SheetData[]
  logs: string[]
  summary: string
  operations?: SheetOp[]  // 방식 A: 클라이언트에서 적용
  isChatOnly?: boolean    // 방식 C: 대화 응답만 있는 경우
}

export type LogType = 'info' | 'success' | 'error' | 'processing' | 'claude'

export interface LogEntry {
  id: string
  type: LogType
  message: string
  timestamp: string
}

export type OutputMode = 'formula' | 'value'
