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
  activeTab: '',
  isProcessing: false,
  logs: [],
  showOutputDialog: false,

  setFileInfo: (info) => set({ fileInfo: info }),
  setOriginalSheets: (sheets) =>
    set({ originalSheets: sheets, activeTab: sheets[0]?.name ?? '' }),
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
      // 결과 시트가 있으면 첫 번째 결과 탭으로, 없으면 기존 탭 유지 (isChatOnly 등)
      activeTab:
        result?.resultSheets[0]?.name ||
        state.activeTab ||
        state.originalSheets[0]?.name ||
        '',
    })),
  addStreamingSheet: (sheet, sheetValue) =>
    set((state) => ({
      streamingSheets: [...state.streamingSheets, sheet],
      streamingSheetsValueOnly: [...state.streamingSheetsValueOnly, sheetValue],
      // 첫 번째 스트리밍 시트가 오면 자동으로 그 탭으로 전환
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
      activeTab: '',
      isProcessing: false,
      logs: [],
      showOutputDialog: false,
    }),
}))
