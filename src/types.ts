export interface Transaction {
  id: string
  date: string
  dateObj: Date | null
  narration: string
  debit: number
  credit: number
  balance: number | null
  raw: Record<string, unknown>
}

export interface AccountMeta {
  name: string
  nuban?: string
  accountType?: string
  accountCategory?: string
  currency?: string
  period?: string
  availableBal?: string
  bookBal?: string
  reportedTotalCredit?: string
  reportedTotalDebit?: string
  address?: string
  signatories?: { Name: string; BVN?: string }[]
}

export interface ParsedStatement {
  fileName: string
  bankName?: string
  headers: string[]
  transactions: Transaction[]
  accountMeta?: AccountMeta
  detectedEntityName?: string
}

export type FilterLayer = 'layer1' | 'layer2' | 'layer3' | 'layer4'

export type MatchConfidence = 'high' | 'medium' | 'low'

export interface FlaggedTransaction {
  transaction: Transaction
  layer: FilterLayer
  reason: string
  relatedTxnId?: string
  confidence?: MatchConfidence
  autoExcluded: boolean
}

export interface SameDayPair {
  credit: Transaction
  debit: Transaction
  amountDiff: number
}

export interface MonthlyTotal {
  month: string
  totalCredit: number
  totalDebit: number
  netFlow: number
  transactionCount: number
}

export interface WeeklyTotal {
  week: string       // ISO Monday date "2025-05-12"
  weekLabel: string  // "May 12 – 18, 2025"
  totalCredit: number
  totalDebit: number
  netFlow: number
  transactionCount: number
}

export interface AnalysisResult {
  /** Operational transactions — all non-excluded transactions including bank charges */
  cleanedTransactions: Transaction[]

  /** Auto-excluded by filter layers */
  flaggedTransactions: FlaggedTransaction[]

  /** L2 low-confidence — kept in cleaned, surfaced for human review */
  reviewCandidates: FlaggedTransaction[]

  /** Credits excluded because a matching debit occurred the same calendar day */
  sameDayInOut: SameDayPair[]

  /** Stamp duty debits — subset of cleanedTransactions */
  stampDutyTransactions: Transaction[]

  /** Maintenance fee debits — subset of cleanedTransactions */
  maintenanceFeeTransactions: Transaction[]

  /** Loan injection credits (from flaggedTransactions layer3) */
  loanInjectionTransactions: FlaggedTransaction[]

  /** Recurring structured debit installments inferred as loan repayments */
  loanRepayments: Transaction[]

  monthlyTotals: MonthlyTotal[]
  rawMonthlyTotals: MonthlyTotal[]
  weeklyTotals: WeeklyTotal[]

  totalCleanedCredit: number
  totalFlaggedCredit: number
  totalSameDayCredit: number
  totalDebit: number
  totalBankCharges: number
  totalOperationalDebit: number
}

export type OutputFormat = 'json' | 'csv'

export type AppStep = 1 | 2 | 3
