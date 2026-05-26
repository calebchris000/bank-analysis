import { create } from 'zustand'
import type { ParsedStatement, AnalysisResult } from './types'

interface AppState {
  statements: ParsedStatement[]
  result: AnalysisResult | null
  entityName: string
  isDark: boolean

  setStatements: (s: ParsedStatement[]) => void
  setResult: (r: AnalysisResult) => void
  setEntityName: (name: string) => void
  setIsDark: (dark: boolean) => void
  reset: () => void
}

export const useAppStore = create<AppState>((set) => ({
  statements: [],
  result: null,
  entityName: '',
  isDark: true,

  setStatements: (statements) => set({ statements }),
  setResult: (result) => set({ result }),
  setEntityName: (entityName) => set({ entityName }),
  setIsDark: (isDark) => set({ isDark }),
  reset: () => set({ statements: [], result: null, entityName: '' }),
}))
