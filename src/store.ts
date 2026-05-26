import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ParsedStatement, AnalysisResult } from './types'

// JSON serialization strips Date objects — reparse them after rehydration
function reparseStatements(statements: ParsedStatement[]): ParsedStatement[] {
  return statements.map(s => ({
    ...s,
    transactions: s.transactions.map(t => ({
      ...t,
      dateObj: t.date ? new Date(t.date) : null,
    })),
  }))
}

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

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      statements: [],
      result: null,
      entityName: '',
      isDark: true,

      setStatements: (statements) => set({ statements }),
      setResult: (result) => set({ result }),
      setEntityName: (entityName) => set({ entityName }),
      setIsDark: (isDark) => set({ isDark }),
      reset: () => set({ statements: [], result: null, entityName: '' }),
    }),
    {
      name: 'banklens-session',
      storage: createJSONStorage(() => sessionStorage),
      onRehydrateStorage: () => (state) => {
        if (state?.statements.length) {
          state.statements = reparseStatements(state.statements)
        }
      },
    },
  ),
)
