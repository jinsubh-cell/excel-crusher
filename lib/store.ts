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
  resultTabName: string  // 결과물 탭 이름 (사용자가 변경 가능)
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
  setResultWorkingSheets: (sheets: SheetData[]) => void
  addStreamingSheet: (sheet: SheetData, sheetValue: SheetData) => void
  clearStreamingSheets: () => void
  setShowOutputDialog: (value: boolean) => void
  renameSheet: (oldName: string, newName: string) => void
  deleteSheet: (name: string) => void
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
  resultTabName: '결과물',
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
      resultWorkingSheets: [],
      resultTabName: '결과물',
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
      activeTab:
        state.resultWorkingSheets.length > 0
          ? state.resultTabName
          : result?.resultSheets[0]?.name ||
            state.activeTab ||
            state.originalSheets[0]?.name ||
            '',
    })),

  // 결과물 시트 업데이트: "결과물" 탭으로 자동 전환, 탭 이름 초기화
  setResultWorkingSheets: (sheets) =>
    set((state) => ({
      resultWorkingSheets: sheets,
      resultTabName: '결과물',
      activeTab: sheets.length > 0 ? '결과물' : (state.originalSheets[0]?.name ?? ''),
    })),

  addStreamingSheet: (sheet, sheetValue) =>
    set((state) => ({
      streamingSheets: [...state.streamingSheets, sheet],
      streamingSheetsValueOnly: [...state.streamingSheetsValueOnly, sheetValue],
      activeTab: state.streamingSheets.length === 0 ? sheet.name : state.activeTab,
    })),
  clearStreamingSheets: () =>
    set({ streamingSheets: [], streamingSheetsValueOnly: [] }),

  setShowOutputDialog: (value) => set({ showOutputDialog: value }),

  // 시트 이름 변경: 결과물 탭 또는 원본 시트
  renameSheet: (oldName, newName) =>
    set((state) => {
      const trimmed = newName.trim()
      if (!trimmed || trimmed === oldName) return {}
      // 결과물 탭 이름 변경
      if (oldName === state.resultTabName) {
        return {
          resultTabName: trimmed,
          activeTab: state.activeTab === oldName ? trimmed : state.activeTab,
        }
      }
      // 원본 시트 이름 변경
      return {
        originalSheets: state.originalSheets.map(s =>
          s.name === oldName ? { ...s, name: trimmed } : s
        ),
        activeTab: state.activeTab === oldName ? trimmed : state.activeTab,
      }
    }),

  // 시트 삭제: 결과물 탭 삭제 = resultWorkingSheets 초기화
  deleteSheet: (name) =>
    set((state) => {
      // 결과물 탭 삭제
      if (name === state.resultTabName) {
        return {
          resultWorkingSheets: [],
          resultTabName: '결과물',
          activeTab: state.originalSheets[0]?.name ?? '',
        }
      }
      // 원본 시트 삭제
      const newSheets = state.originalSheets.filter(s => s.name !== name)
      const nextActive =
        state.activeTab === name
          ? (newSheets[0]?.name ?? (state.resultWorkingSheets.length > 0 ? state.resultTabName : ''))
          : state.activeTab
      return { originalSheets: newSheets, activeTab: nextActive }
    }),

  reset: () =>
    set({
      fileInfo: null,
      originalSheets: [],
      claudeResult: null,
      streamingSheets: [],
      streamingSheetsValueOnly: [],
      resultWorkingSheets: [],
      resultTabName: '결과물',
      activeTab: '',
      isProcessing: false,
      logs: [],
      showOutputDialog: false,
    }),
}))
