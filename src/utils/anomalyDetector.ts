import type {
  Transaction,
  ParsedStatement,
  AnalysisResult,
  FlaggedTransaction,
  MonthlyTotal,
  WeeklyTotal,
  SameDayPair,
  MatchConfidence,
} from '../types'
import { parseNarration, namesMatch } from './narrationParser'

// ── Keyword lists ──────────────────────────────────────────────────────────────

const LOAN_KEYWORDS = [
  'loan', 'disbursement', 'principal', 'interest',
  'facility', 'credit line', 'overdraft', 'salary advance',
]

const STAMP_DUTY_PATTERNS = [
  'stamp duty', 'fgn stamp', 'stampduty', 'stamp_duty', 'nsdt',
]

const MAINTENANCE_PATTERNS = [
  'mtce', 'maintenance fee', 'maint fee', 'account maintenance',
  'monthly maintenance', 'sms fee', 'card maintenance',
  'management fee', 'admin charge', 'service charge', 'bank charge',
  'commission on turnover', 'cot fee', 'e-alert', 'monthly fee',
  'annual fee', 'account keeping', 'electronic alert', 'sms alert',
  'ussd', 'mtn charge', 'airtel charge', 'glo charge', '9mobile charge',
  'nibss charge', 'transfer charge', 'interswitch', 'remita charge',
]

// Word-boundary match for short patterns to avoid substring false positives
function matchesPattern(lower: string, pattern: string): boolean {
  if (pattern.length <= 4) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`\\b${escaped}\\b`).test(lower)
  }
  return lower.includes(pattern)
}

function isBankCharge(narration: string): boolean {
  const lower = narration.toLowerCase()
  return (
    STAMP_DUTY_PATTERNS.some(p => lower.includes(p)) ||
    MAINTENANCE_PATTERNS.some(p => matchesPattern(lower, p))
  )
}

// ── Date helpers ───────────────────────────────────────────────────────────────

function normDateStr(dateStr: string): string {
  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const parts = dateStr.split('/')
  if (parts.length === 3 && parts[2]!.length === 4) {
    // MM/DD/YYYY or DD/MM/YYYY — just return as-is for grouping
    return dateStr
  }
  return dateStr.slice(0, 10)
}

function getMonthKey(dateStr: string): string {
  const iso = dateStr.match(/^(\d{4})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}`
  const parts = dateStr.split('/')
  if (parts.length === 3) {
    const year = parts[2]!.length === 4 ? parts[2] : parts[0]
    const month = parts[2]!.length === 4 ? parts[0] : parts[1]
    return `${year}-${String(month).padStart(2, '0')}`
  }
  return dateStr.slice(0, 7)
}

/** ISO Monday-anchored week key: YYYY-MM-DD of Monday */
function getWeekKey(dateObj: Date): string {
  const d = new Date(dateObj)
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1 - day)
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]!
}

function getWeekLabel(mondayKey: string): string {
  const monday = new Date(mondayKey + 'T00:00:00')
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const yr = sunday.getFullYear()
  return `${fmt(monday)} – ${fmt(sunday)}, ${yr}`
}

// ── Statistics ─────────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]!
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo)
}

function logIQRUpperFence(values: number[]): number {
  const positives = values.filter(v => v > 0)
  if (positives.length < 5) return Infinity
  const logs = positives.map(v => Math.log(v)).sort((a, b) => a - b)
  const q1 = percentile(logs, 25)
  const q3 = percentile(logs, 75)
  const iqr = q3 - q1
  if (iqr === 0) return Infinity
  return Math.exp(q3 + 1.5 * iqr)
}

function buildMonthlyFences(transactions: Transaction[]): Map<string, number> {
  const byMonth = new Map<string, number[]>()
  for (const t of transactions) {
    if (t.credit <= 0) continue
    const m = getMonthKey(t.date)
    const arr = byMonth.get(m) ?? []
    arr.push(t.credit)
    byMonth.set(m, arr)
  }
  const months = Array.from(byMonth.keys()).sort()
  const globalFence = logIQRUpperFence(
    transactions.filter(t => t.credit > 0).map(t => t.credit),
  )
  const fences = new Map<string, number>()
  for (let i = 0; i < months.length; i++) {
    const month = months[i]!
    const prior = months.slice(Math.max(0, i - 3), i).flatMap(m => byMonth.get(m) ?? [])
    fences.set(month, prior.length >= 5 ? logIQRUpperFence(prior) : globalFence)
  }
  return fences
}

// ── Aggregate builders ─────────────────────────────────────────────────────────

function buildMonthlyTotals(transactions: Transaction[]): MonthlyTotal[] {
  const map = new Map<string, MonthlyTotal>()
  for (const t of transactions) {
    const month = getMonthKey(t.date)
    const e = map.get(month) ?? { month, totalCredit: 0, totalDebit: 0, netFlow: 0, transactionCount: 0 }
    e.totalCredit += t.credit
    e.totalDebit += t.debit
    e.netFlow = e.totalCredit - e.totalDebit
    e.transactionCount++
    map.set(month, e)
  }
  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month))
}

function buildWeeklyTotals(transactions: Transaction[]): WeeklyTotal[] {
  const map = new Map<string, WeeklyTotal>()
  for (const t of transactions) {
    if (!t.dateObj) continue
    const week = getWeekKey(t.dateObj)
    const e = map.get(week) ?? {
      week,
      weekLabel: getWeekLabel(week),
      totalCredit: 0,
      totalDebit: 0,
      netFlow: 0,
      transactionCount: 0,
    }
    e.totalCredit += t.credit
    e.totalDebit += t.debit
    e.netFlow = e.totalCredit - e.totalDebit
    e.transactionCount++
    map.set(week, e)
  }
  return Array.from(map.values()).sort((a, b) => a.week.localeCompare(b.week))
}

// ── Same-day in/out detection ─────────────────────────────────────────────────

function detectSameDayInOut(
  transactions: Transaction[],
  alreadyFlagged: Set<string>,
): SameDayPair[] {
  const byDate = new Map<string, { credits: Transaction[]; debits: Transaction[] }>()

  for (const t of transactions) {
    if (alreadyFlagged.has(t.id)) continue
    const day = normDateStr(t.date)
    const g = byDate.get(day) ?? { credits: [], debits: [] }
    if (t.credit > 0) g.credits.push(t)
    if (t.debit > 0) g.debits.push(t)
    byDate.set(day, g)
  }

  const pairs: SameDayPair[] = []

  for (const { credits, debits } of byDate.values()) {
    for (const credit of credits) {
      const match = debits.find(d => {
        const diff = Math.abs(credit.credit - d.debit) / credit.credit
        return diff <= 0.02
      })
      if (match) {
        pairs.push({
          credit,
          debit: match,
          amountDiff: Math.abs(credit.credit - match.debit) / credit.credit,
        })
      }
    }
  }

  return pairs
}

// ── Layer 2: Round-trip (amount-first, three-tier confidence) ─────────────────

interface RoundTripResult {
  flagged: Map<string, FlaggedTransaction>
  reviewCandidates: Map<string, FlaggedTransaction>
}

function detectRoundTrips(
  allTransactions: Transaction[],
  alreadyFlagged: Set<string>,
): RoundTripResult {
  const flagged = new Map<string, FlaggedTransaction>()
  const reviewCandidates = new Map<string, FlaggedTransaction>()

  const withFp = allTransactions.map(t => ({ t, fp: parseNarration(t.narration) }))
  const credits = withFp.filter(x => x.t.credit > 0 && !alreadyFlagged.has(x.t.id) && x.t.dateObj)
  const debits  = withFp.filter(x => x.t.debit > 0 && x.t.dateObj)

  for (const { t: credit, fp: cfp } of credits) {
    if (flagged.has(credit.id)) continue

    for (const { t: debit, fp: dfp } of debits) {
      const gapMs = debit.dateObj!.getTime() - credit.dateObj!.getTime()
      if (gapMs <= 0 || gapMs > 7 * 86400000) continue   // must be 1–7 days after

      const amountDiff = Math.abs(credit.credit - debit.debit) / credit.credit

      let confidence: MatchConfidence | null = null
      let matchDetail = ''

      if (amountDiff <= 0.001) {
        const sharedRef = cfp.referenceNumbers.find(
          r => r.length >= 9 && dfp.referenceNumbers.includes(r),
        )
        const sharedNuban = cfp.nubanNumbers.find(n => dfp.nubanNumbers.includes(n))
        if (sharedRef) {
          confidence = 'high'; matchDetail = `shared session ref ${sharedRef}`
        } else if (sharedNuban) {
          confidence = 'high'; matchDetail = `shared NUBAN ${sharedNuban}`
        } else if (cfp.counterpartyName && dfp.counterpartyName &&
                   namesMatch(cfp.counterpartyName, dfp.counterpartyName)) {
          confidence = 'medium'
          matchDetail = `counterparty match ("${cfp.counterpartyName}" ~ "${dfp.counterpartyName}")`
        }
      } else if (amountDiff <= 0.01) {
        if (cfp.counterpartyName && dfp.counterpartyName &&
            namesMatch(cfp.counterpartyName, dfp.counterpartyName)) {
          confidence = 'medium'
          matchDetail = `${(amountDiff * 100).toFixed(2)}% diff + name match "${cfp.counterpartyName}"`
        }
      } else if (amountDiff <= 0.02) {
        if (cfp.counterpartyName && dfp.counterpartyName &&
            namesMatch(cfp.counterpartyName, dfp.counterpartyName)) {
          confidence = 'low'
          matchDetail = `${(amountDiff * 100).toFixed(2)}% diff + name match "${cfp.counterpartyName}"`
        }
      }

      if (!confidence) continue

      const gap = (gapMs / 86400000).toFixed(1)
      const reason =
        `Round-trip [${confidence.toUpperCase()}]: ` +
        `credit ${credit.credit.toLocaleString('en-US', { minimumFractionDigits: 2 })} on ${credit.date} → ` +
        `debit ${debit.debit.toLocaleString('en-US', { minimumFractionDigits: 2 })} on ${debit.date} ` +
        `(${gap}d gap). Evidence: ${matchDetail}.`

      const entry: FlaggedTransaction = {
        transaction: credit, layer: 'layer2', reason,
        relatedTxnId: debit.id, confidence, autoExcluded: confidence !== 'low',
      }

      if (confidence === 'low') reviewCandidates.set(credit.id, entry)
      else flagged.set(credit.id, entry)
      break
    }
  }

  return { flagged, reviewCandidates }
}

// ── Main entry ─────────────────────────────────────────────────────────────────

export function analyzeStatements(
  statements: ParsedStatement[],
  entityName?: string,
): AnalysisResult {
  const allTransactions = statements.flatMap(s => s.transactions)
  const flagged = new Map<string, FlaggedTransaction>()
  const loanRepayments: Transaction[] = []
  const multipleStatements = statements.length > 1

  const rawMonthlyTotals = buildMonthlyTotals(allTransactions)

  // ── Layer 1: Internal Self-Transfers ────────────────────────────────────────
  if (multipleStatements && entityName) {
    const nameTokens = entityName
      .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 2)
    for (const txn of allTransactions) {
      if (txn.credit === 0) continue
      const norm = parseNarration(txn.narration).normalized
      const hits = nameTokens.filter(tok => norm.includes(tok)).length
      const ratio = nameTokens.length > 0 ? hits / nameTokens.length : 0
      if (ratio >= 0.6) {
        flagged.set(txn.id, {
          transaction: txn, layer: 'layer1', autoExcluded: true,
          reason: `Internal self-transfer: narration matches entity "${entityName}" (${Math.round(ratio * 100)}% token match).`,
        })
      }
    }
  }

  // ── Layer 3: Loan Disbursement ───────────────────────────────────────────────
  const loanCreditIds = new Set<string>()
  for (const txn of allTransactions) {
    if (txn.credit === 0 || flagged.has(txn.id)) continue
    const lower = txn.narration.toLowerCase()
    const kw = LOAN_KEYWORDS.find(k => lower.includes(k))
    if (kw) {
      flagged.set(txn.id, {
        transaction: txn, layer: 'layer3', autoExcluded: true,
        reason: `Loan disbursement: keyword "${kw}" in narration. Excluded from operational turnover.`,
      })
      loanCreditIds.add(txn.id)
    }
  }

  // Identify recurring debit installments (loan repayments)
  if (loanCreditIds.size > 0) {
    const debitGroups = new Map<string, Transaction[]>()
    for (const txn of allTransactions) {
      if (txn.debit === 0 || isBankCharge(txn.narration)) continue
      const key = txn.narration.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30)
      const g = debitGroups.get(key) ?? []
      g.push(txn)
      debitGroups.set(key, g)
    }
    for (const [, group] of debitGroups) {
      if (group.length >= 2) {
        const base = group[0]!.debit
        if (group.every(t => Math.abs(t.debit - base) / (base || 1) < 0.05)) {
          loanRepayments.push(...group)
        }
      }
    }
  }

  // ── Same-day in/out (before L2 — 0-day window is more specific) ─────────────
  const sameDayPairs = detectSameDayInOut(allTransactions, new Set(flagged.keys()))
  const sameDayCreditIds = new Set(sameDayPairs.map(p => p.credit.id))

  // ── Layer 2: Round-trip (1–7 day window) ────────────────────────────────────
  const preL2Flagged = new Set([...flagged.keys(), ...sameDayCreditIds])
  const { flagged: l2Flagged, reviewCandidates } = detectRoundTrips(allTransactions, preL2Flagged)
  for (const [id, entry] of l2Flagged) flagged.set(id, entry)

  // ── Layer 4: Log-IQR statistical outliers ────────────────────────────────────
  const unflaggedCredits = allTransactions.filter(
    t => t.credit > 0 && !flagged.has(t.id) && !sameDayCreditIds.has(t.id),
  )
  const monthlyFences = buildMonthlyFences(unflaggedCredits)
  for (const txn of unflaggedCredits) {
    const fence = monthlyFences.get(getMonthKey(txn.date)) ?? Infinity
    if (!isFinite(fence) || txn.credit <= fence) continue
    const month = getMonthKey(txn.date)
    const monthCredits = unflaggedCredits.filter(t => getMonthKey(t.date) === month).map(t => t.credit).sort((a, b) => a - b)
    const median = percentile(monthCredits, 50)
    flagged.set(txn.id, {
      transaction: txn, layer: 'layer4', autoExcluded: true,
      reason:
        `Statistical outlier [log-IQR, 3-month rolling]: ` +
        `${txn.credit.toLocaleString('en-US', { minimumFractionDigits: 2 })} ` +
        `exceeds ${month} fence of ${fence.toLocaleString('en-US', { minimumFractionDigits: 2 })} ` +
        `(month median: ${median.toLocaleString('en-US', { minimumFractionDigits: 2 })}). Manual review required.`,
    })
  }

  // ── Assemble cleaned set — bank charges live in their own buckets ─────────────
  const flaggedIds = new Set(flagged.keys())

  const stampDutyTransactions: Transaction[] = []
  const maintenanceFeeTransactions: Transaction[] = []
  const bankChargeIds = new Set<string>()

  for (const t of allTransactions) {
    if (flaggedIds.has(t.id) || sameDayCreditIds.has(t.id)) continue
    const lower = t.narration.toLowerCase()
    if (STAMP_DUTY_PATTERNS.some(p => lower.includes(p))) {
      stampDutyTransactions.push(t)
      bankChargeIds.add(t.id)
    } else if (MAINTENANCE_PATTERNS.some(p => matchesPattern(lower, p))) {
      maintenanceFeeTransactions.push(t)
      bankChargeIds.add(t.id)
    }
  }

  const cleanedTransactions = allTransactions.filter(
    t => !flaggedIds.has(t.id) && !sameDayCreditIds.has(t.id) && !bankChargeIds.has(t.id),
  )

  // ── Loan injection sub-list ────────────────────────────────────────────────
  const loanInjectionTransactions = Array.from(flagged.values()).filter(
    f => f.layer === 'layer3',
  )

  // ── Totals ─────────────────────────────────────────────────────────────────
  const flaggedTransactions = Array.from(flagged.values())
  const reviewList = Array.from(reviewCandidates.values())

  const totalCleanedCredit = cleanedTransactions.reduce((s, t) => s + t.credit, 0)
  const totalFlaggedCredit = flaggedTransactions.reduce((s, f) => s + f.transaction.credit, 0)
  const totalSameDayCredit = sameDayPairs.reduce((s, p) => s + p.credit.credit, 0)
  const totalOperationalDebit = cleanedTransactions.reduce((s, t) => s + t.debit, 0)
  const totalBankCharges =
    [...stampDutyTransactions, ...maintenanceFeeTransactions].reduce((s, t) => s + t.debit, 0)
  const totalDebit = totalOperationalDebit + totalBankCharges

  const monthlyTotals = buildMonthlyTotals(cleanedTransactions)
  const weeklyTotals = buildWeeklyTotals(cleanedTransactions)

  return {
    cleanedTransactions,
    flaggedTransactions,
    reviewCandidates: reviewList,
    sameDayInOut: sameDayPairs,
    stampDutyTransactions,
    maintenanceFeeTransactions,
    loanInjectionTransactions,
    loanRepayments,
    monthlyTotals,
    rawMonthlyTotals,
    weeklyTotals,
    totalCleanedCredit,
    totalFlaggedCredit,
    totalSameDayCredit,
    totalDebit,
    totalBankCharges,
    totalOperationalDebit,
  }
}
