import { create } from 'zustand'
import { SheetData, ClaudeResult, LogEntry } from '@/types'

interface FileInfo {
  name: string
  size: number
}

interface ExcelStore {
  fileInfo: FileInfo | null
  originalSheets: SheetData[]
  claudeResult: ClaudeResult | null
  // 스트리밍 중 실시간 시트 미리보기
  streamingSheets: SheetData[]
  streamingSheetsValueOnly: SheetData[]
  // "결과물" 시트: 누적 작업 상태 (원본 훼손 없이 별도 관리)
  resultWorkingSheets: SheetData[]
  activeTab: string
  isProcessing: boolean
  logs: LogEntry[]
  showOutputDialog: boolean

  setFileInfo: (info: FileInfo | null) => void
  setOriginalSheets: (sheets: SheetData[]) => void
  setActiveTab: (tab: string) => void
  addLog: (type: LogEntry['type'], message: string) => void
  clearLogs: () => void
  setProcessing: (value: boolean) => void
  setClaudeResult: (result: ClaudeResult | null) => void
  // 결과물 시트 업데이트 + "결과물" 탭으로 자동 전환
  setResultWorkingSheets: (sheets: SheetData[]) => void
  addStreamingSheet: (sheet: SheetData, sheetValue: SheetData) => void
  clearStreamingSheets: () => void
  setShowOutputDialog: (value: boolean) => void
  reset: () => void
}

let logIdCounter = 0

export const useExcelStore = create<ExcelStore>((set) => ({
  fileInfo: null,
  originalSheets: [],
  claudeResult: null,
  streamingSheets: [],
  streamingSheetsValueOnly: [],
  resultWorkingSheets: [],
  activeTab: '',
  isProcessing: false,
  logs: [],
  showOutputDialog: false,

  setFileInfo: (info) => set({ fileInfo: info }),

  // 새 파일 업로드 시 작업 상태 초기화
  setOriginalSheets: (sheets) =>
    set({
      originalSheets: sheets,
      activeTab: sheets[0]?.name ?? '',
      resultWorkingSheets: [],   // 새 파일이면 기존 결과물 초기화
      claudeResult: null,
    }),

  setActiveTab: (tab) => set({ activeTab: tab }),

  addLog: (type, message) =>
    set((state) => ({
      logs: [
        ...state.logs,
        {
          id: String(++logIdCounter),
          type,
          message,
          timestamp: new Date().toLocaleTimeString('ko-KR'),
        },
      ],
    })),
  clearLogs: () => set({ logs: [] }),
  setProcessing: (value) => set({ isProcessing: value }),

  setClaudeResult: (result) =>
    set((state) => ({
      claudeResult: result,
      streamingSheets: [],
      streamingSheetsValueOnly: [],
      // resultWorkingSheets가 있으면 그 탭 유지, 없으면 결과 시트로
      activeTab:
        state.resultWorkingSheets.length > 0
          ? '결과물'
          : result?.resultSheets[0]?.name ||
            state.activeTab ||
            state.originalSheets[0]?.name ||
            '',
    })),

  // 결과물 시트 업데이트: "결과물" 탭으로 자동 전환
  setResultWorkingSheets: (sheets) =>
    set({
      resultWorkingSheets: sheets,
      activeTab: sheets.length > 0 ? '결과물' : '',
    }),

  addStreamingSheet: (sheet, sheetValue) =>
    set((state) => ({
      streamingSheets: [...state.streamingSheets, sheet],
      streamingSheetsValueOnly: [...state.streamingSheetsValueOnly, sheetValue],
      activeTab: state.streamingSheets.length === 0 ? sheet.name : state.activeTab,
    })),
  clearStreamingSheets: () =>
    set({ streamingSheets: [], streamingSheetsValueOnly: [] }),

  setShowOutputDialog: (value) => set({ showOutputDialog: value }),

  reset: () =>
    set({
      fileInfo: null,
      originalSheets: [],
      claudeResult: null,
      streamingSheets: [],
      streamingSheetsValueOnly: [],
      resultWorkingSheets: [],
      activeTab: '',
      isProcessing: false,
      logs: [],
      showOutputDialog: false,
    }),
}))
