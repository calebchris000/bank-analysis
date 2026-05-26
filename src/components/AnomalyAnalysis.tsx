import { useState, useMemo } from 'react'
import {
  AlertTriangle, CheckCircle, ChevronDown, ChevronUp,
  Download, Filter, Calendar, ArrowRightLeft,
  Stamp, Wrench, Landmark, Eye, TrendingUp, BarChart3,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { AnalysisResult, FlaggedTransaction, OutputFormat, Transaction, SameDayPair } from '../types'
import { exportAnalysisCSV, exportAnalysisJSON } from '../utils/exportUtils'

const LAYER_META: Record<string, { label: string; color: string }> = {
  layer1: { label: 'L1 Self-Transfer', color: 'text-amber-500' },
  layer2: { label: 'L2 Round-Trip',    color: 'text-red-500'   },
  layer3: { label: 'L3 Loan',          color: 'text-violet-500'},
  layer4: { label: 'L4 Outlier',       color: 'text-blue-500'  },
}
const CONF_STYLE: Record<string, string> = {
  high:   'text-red-500   bg-red-500/10   border-red-500/20',
  medium: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
  low:    'text-zinc-500  bg-zinc-500/10  border-zinc-500/20',
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function pct(n: number) { return `${(n * 100).toFixed(2)}%` }

function StatCard({ label, value, sub, cls = '' }: { label: string; value: string; sub?: string; cls?: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 border-r last:border-r-0 border-border">
      <p className="text-[0.62rem] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={cn('text-sm font-bold font-mono tabular-nums', cls)}>{value}</p>
      {sub && <p className="text-[0.62rem] text-muted-foreground">{sub}</p>}
    </div>
  )
}

function FlagRow({ f, dimmed = false }: { f: FlaggedTransaction; dimmed?: boolean }) {
  const [open, setOpen] = useState(false)
  const meta = LAYER_META[f.layer] ?? { label: f.layer, color: 'text-muted-foreground' }
  return (
    <div
      className={cn('border-b border-border cursor-pointer', dimmed && 'opacity-65',
        f.layer === 'layer2' ? 'border-l-2 border-l-red-500/60' : '')}
      onClick={() => setOpen(o => !o)}
    >
      <div className="flex items-center gap-2 px-3 py-2 flex-wrap hover:bg-muted/30 transition-colors">
        <span className="text-[0.7rem] text-muted-foreground w-24 flex-shrink-0 font-mono">{f.transaction.date}</span>
        <span className="flex-1 text-xs min-w-0 truncate">{f.transaction.narration || '—'}</span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {f.transaction.credit > 0 &&
            <span className="text-xs font-mono amt-credit">+{fmt(f.transaction.credit)}</span>}
          {f.transaction.debit > 0 &&
            <span className="text-xs font-mono amt-debit">-{fmt(f.transaction.debit)}</span>}
          <Badge variant="outline" className={cn('text-[0.6rem] px-1.5 py-0', meta.color)}>
            {meta.label}
          </Badge>
          {f.confidence && (
            <Badge variant="outline" className={cn('text-[0.6rem] px-1.5 py-0 font-bold border', CONF_STYLE[f.confidence])}>
              {f.confidence.toUpperCase()}
            </Badge>
          )}
          {open ? <ChevronUp className="h-3 w-3 text-muted-foreground" />
                : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
        </div>
      </div>
      {open && (
        <div className="px-3 pb-2.5 text-xs text-muted-foreground bg-muted/20 leading-relaxed">
          <strong className="text-foreground">Reason: </strong>{f.reason}
        </div>
      )}
    </div>
  )
}

function TxnRow({ t }: { t: Transaction }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border hover:bg-muted/30 transition-colors flex-wrap">
      <span className="text-[0.7rem] text-muted-foreground w-24 flex-shrink-0 font-mono">{t.date}</span>
      <span className="flex-1 text-xs min-w-0 truncate">{t.narration || '—'}</span>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {t.credit > 0 && <span className="text-xs font-mono amt-credit">+{fmt(t.credit)}</span>}
        {t.debit > 0  && <span className="text-xs font-mono amt-debit">-{fmt(t.debit)}</span>}
      </div>
    </div>
  )
}

function SameDayRow({ pair }: { pair: SameDayPair }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-border border-l-2 border-l-orange-500/60 cursor-pointer"
      onClick={() => setOpen(o => !o)}>
      <div className="flex items-center gap-2 px-3 py-2 hover:bg-muted/30 transition-colors flex-wrap">
        <span className="text-[0.7rem] text-muted-foreground w-24 flex-shrink-0 font-mono">{pair.credit.date}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs truncate">{pair.credit.narration || '—'}</p>
          <p className="text-[0.65rem] text-muted-foreground truncate">
            ↳ {pair.debit.narration || 'debit same day'}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xs font-mono amt-credit">+{fmt(pair.credit.credit)}</span>
          <ArrowRightLeft className="h-3 w-3 text-orange-500" />
          <span className="text-xs font-mono amt-debit">-{fmt(pair.debit.debit)}</span>
          <Badge variant="outline" className="text-[0.6rem] px-1.5 text-orange-500 border-orange-500/20">
            Same-day
          </Badge>
          {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </div>
      </div>
      {open && (
        <div className="px-3 pb-2.5 text-xs text-muted-foreground bg-muted/20">
          Amount diff: {pct(pair.amountDiff)} · Credit excluded from operational turnover.
        </div>
      )}
    </div>
  )
}

function WeeklyTable({ totals }: { totals: { week: string; weekLabel: string; totalCredit: number; totalDebit: number; netFlow: number; transactionCount: number }[] }) {
  const grandCredit = totals.reduce((s, r) => s + r.totalCredit, 0)
  const grandDebit  = totals.reduce((s, r) => s + r.totalDebit, 0)
  const grandNet    = grandCredit - grandDebit
  return (
    <div className="overflow-x-auto">
      <table className="txn-table">
        <thead>
          <tr>
            <th>Week</th><th>Period</th>
            <th className="text-right">Credit</th>
            <th className="text-right">Debit</th>
            <th className="text-right">Net Flow</th>
            <th className="text-right">Txns</th>
          </tr>
        </thead>
        <tbody>
          {totals.map(r => (
            <tr key={r.week}>
              <td className="font-mono text-xs">{r.week}</td>
              <td className="text-muted-foreground">{r.weekLabel}</td>
              <td className="text-right amt-credit">{fmt(r.totalCredit)}</td>
              <td className="text-right amt-debit">{fmt(r.totalDebit)}</td>
              <td className={cn('text-right font-mono tabular-nums',
                r.netFlow >= 0 ? 'amt-credit' : 'amt-debit')}>{fmt(r.netFlow)}</td>
              <td className="text-right text-muted-foreground">{r.transactionCount}</td>
            </tr>
          ))}
          <tr className="total-row">
            <td colSpan={2}><strong>TOTAL</strong></td>
            <td className="text-right amt-credit"><strong>{fmt(grandCredit)}</strong></td>
            <td className="text-right amt-debit"><strong>{fmt(grandDebit)}</strong></td>
            <td className={cn('text-right', grandNet >= 0 ? 'amt-credit' : 'amt-debit')}>
              <strong>{fmt(grandNet)}</strong></td>
            <td className="text-right text-muted-foreground">
              <strong>{totals.reduce((s, r) => s + r.transactionCount, 0)}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function MonthlyTable({ totals }: { totals: AnalysisResult['monthlyTotals'] }) {
  const gC = totals.reduce((s, r) => s + r.totalCredit, 0)
  const gD = totals.reduce((s, r) => s + r.totalDebit,  0)
  return (
    <div className="overflow-x-auto">
      <table className="txn-table">
        <thead>
          <tr>
            <th>Month</th>
            <th className="text-right">Operational Credit</th>
            <th className="text-right">Debit</th>
            <th className="text-right">Net Flow</th>
            <th className="text-right">Txns</th>
          </tr>
        </thead>
        <tbody>
          {totals.map(m => (
            <tr key={m.month}>
              <td className="font-mono">{m.month}</td>
              <td className="text-right amt-credit">{fmt(m.totalCredit)}</td>
              <td className="text-right amt-debit">{fmt(m.totalDebit)}</td>
              <td className={cn('text-right', m.netFlow >= 0 ? 'amt-credit' : 'amt-debit')}>{fmt(m.netFlow)}</td>
              <td className="text-right text-muted-foreground">{m.transactionCount}</td>
            </tr>
          ))}
          <tr className="total-row">
            <td><strong>TOTAL</strong></td>
            <td className="text-right amt-credit"><strong>{fmt(gC)}</strong></td>
            <td className="text-right amt-debit"><strong>{fmt(gD)}</strong></td>
            <td className={cn('text-right', gC - gD >= 0 ? 'amt-credit' : 'amt-debit')}>
              <strong>{fmt(gC - gD)}</strong></td>
            <td className="text-right text-muted-foreground">
              <strong>{totals.reduce((s, r) => s + r.transactionCount, 0)}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export default function AnomalyAnalysis({ result, onProceed }: {
  result: AnalysisResult
  onProceed: () => void
}) {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [fmt_, setFmt] = useState<OutputFormat>('json')

  // Apply date filter to cleaned transactions
  const filtered = useMemo(() => {
    let txns = result.cleanedTransactions
    if (dateFrom) txns = txns.filter(t => t.date >= dateFrom)
    if (dateTo)   txns = txns.filter(t => t.date <= dateTo)
    return txns
  }, [result.cleanedTransactions, dateFrom, dateTo])

  const filteredWeekly = useMemo(() => {
    if (!dateFrom && !dateTo) return result.weeklyTotals
    return result.weeklyTotals.filter(w =>
      (!dateFrom || w.week >= dateFrom.slice(0, 10)) &&
      (!dateTo   || w.week <= dateTo.slice(0, 10)),
    )
  }, [result.weeklyTotals, dateFrom, dateTo])

  const filteredMonthly = useMemo(() => {
    if (!dateFrom && !dateTo) return result.monthlyTotals
    const from = dateFrom.slice(0, 7)
    const to   = dateTo.slice(0, 7)
    return result.monthlyTotals.filter(m =>
      (!from || m.month >= from) && (!to || m.month <= to),
    )
  }, [result.monthlyTotals, dateFrom, dateTo])

  function handleExport() {
    if (fmt_ === 'csv') exportAnalysisCSV(result)
    else {
      const data = exportAnalysisJSON(result)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(blob), download: 'analysis-report.json',
      })
      a.click(); URL.revokeObjectURL(a.href)
    }
  }

  const netFlow = result.totalCleanedCredit - result.totalDebit

  return (
    <Card>
      <CardHeader className="pb-3 border-b border-border">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Step 2 — Anomaly Analysis
          </CardTitle>
          <Button size="sm" onClick={onProceed}>
            View Clean Export <ChevronRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      </CardHeader>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 border-b border-border divide-x divide-border">
        <StatCard label="Operational Credit" value={fmt(result.totalCleanedCredit)} cls="amt-credit" />
        <StatCard label="Operational Debit"  value={fmt(result.totalOperationalDebit)} cls="amt-debit" />
        <StatCard label="Bank Charges"       value={fmt(result.totalBankCharges)}
          sub={`${result.stampDutyTransactions.length} stamp · ${result.maintenanceFeeTransactions.length} maint`}
          cls="text-amber-600 dark:text-amber-400" />
        <StatCard label="Excluded Credit"    value={fmt(result.totalFlaggedCredit + result.totalSameDayCredit)}
          sub={`${result.flaggedTransactions.length} txns`} cls="amt-flag" />
        <StatCard label="Same-Day Removed"   value={fmt(result.totalSameDayCredit)}
          sub={`${result.sameDayInOut.length} pairs`} cls="text-orange-600 dark:text-orange-400" />
        <StatCard label="Net Cash Flow"      value={fmt(netFlow)}
          cls={netFlow >= 0 ? 'amt-credit' : 'amt-debit'} />
      </div>

      {/* ── Date range filter ── */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border bg-muted/20">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          <span>Date Range</span>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="h-7 w-36 text-xs" />
          <span className="text-muted-foreground text-xs">to</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="h-7 w-36 text-xs" />
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" className="h-7 text-xs"
              onClick={() => { setDateFrom(''); setDateTo('') }}>
              Clear
            </Button>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex gap-1 rounded-lg border border-border bg-background p-0.5">
            {(['json', 'csv'] as OutputFormat[]).map(f => (
              <button key={f} onClick={() => setFmt(f)}
                className={cn('px-2.5 py-0.5 rounded-md text-xs font-medium transition-colors',
                  fmt_ === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
                {f.toUpperCase()}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={handleExport} className="h-7 gap-1.5 text-xs">
            <Download className="h-3 w-3" /> Export
          </Button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="weekly">
        <div className="border-b border-border overflow-x-auto">
          <TabsList className="h-auto rounded-none bg-transparent p-0 border-0">
            {[
              { value: 'weekly',      label: 'Weekly',        icon: TrendingUp,     count: filteredWeekly.length },
              { value: 'monthly',     label: 'Monthly',       icon: BarChart3,      count: filteredMonthly.length },
              { value: 'cleaned',     label: 'Cleaned',       icon: CheckCircle,    count: filtered.length },
              { value: 'excluded',    label: 'Auto-Excluded', icon: AlertTriangle,  count: result.flaggedTransactions.length },
              { value: 'sameday',     label: 'Same-Day',      icon: ArrowRightLeft, count: result.sameDayInOut.length },
              { value: 'stampduty',   label: 'Stamp Duty',    icon: Stamp,          count: result.stampDutyTransactions.length },
              { value: 'maintenance', label: 'Maintenance',   icon: Wrench,         count: result.maintenanceFeeTransactions.length },
              { value: 'loans',       label: 'Loans',         icon: Landmark,       count: result.loanInjectionTransactions.length },
              { value: 'review',      label: 'Review Queue',  icon: Eye,            count: result.reviewCandidates.length },
            ].map(({ value, label, icon: Icon, count }) => (
              <TabsTrigger key={value} value={value}
                className={cn(
                  'rounded-none border-b-2 border-transparent px-4 py-2.5 text-xs',
                  'data-[state=active]:border-primary data-[state=active]:bg-transparent',
                  'data-[state=active]:text-foreground text-muted-foreground',
                  'hover:text-foreground transition-colors gap-1.5 whitespace-nowrap',
                )}>
                <Icon className="h-3 w-3" />
                {label}
                {count > 0 && (
                  <span className="ml-1 rounded-full bg-muted text-muted-foreground text-[0.6rem] px-1.5 py-0.5 font-medium">
                    {count}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* Weekly */}
        <TabsContent value="weekly" className="mt-0 p-4">
          {filteredWeekly.length === 0
            ? <p className="text-center text-muted-foreground text-sm py-8">No data in selected date range.</p>
            : <WeeklyTable totals={filteredWeekly} />}
        </TabsContent>

        {/* Monthly */}
        <TabsContent value="monthly" className="mt-0 p-4">
          {filteredMonthly.length === 0
            ? <p className="text-center text-muted-foreground text-sm py-8">No data in selected date range.</p>
            : <MonthlyTable totals={filteredMonthly} />}
        </TabsContent>

        {/* Cleaned */}
        <TabsContent value="cleaned" className="mt-0">
          <ScrollArea className="h-[520px]">
            {filtered.length === 0
              ? <p className="text-center text-muted-foreground text-sm py-8">No transactions in range.</p>
              : filtered.slice(0, 300).map(t => <TxnRow key={t.id} t={t} />)}
            {filtered.length > 300 && (
              <p className="text-center text-muted-foreground text-xs py-3">
                Showing 300 of {filtered.length} — download for full list
              </p>
            )}
          </ScrollArea>
        </TabsContent>

        {/* Auto-excluded */}
        <TabsContent value="excluded" className="mt-0">
          <ScrollArea className="h-[520px]">
            {result.flaggedTransactions.length === 0
              ? <p className="text-center text-muted-foreground text-sm py-8">No transactions auto-excluded.</p>
              : result.flaggedTransactions.map(f => <FlagRow key={f.transaction.id} f={f} />)}
          </ScrollArea>
        </TabsContent>

        {/* Same-day */}
        <TabsContent value="sameday" className="mt-0">
          <div className="px-4 py-2.5 border-b border-border bg-orange-500/5 text-xs text-orange-600 dark:text-orange-400">
            Credits with a matching debit on the same calendar day (within 2%). Excluded from operational turnover.
          </div>
          <ScrollArea className="h-[480px]">
            {result.sameDayInOut.length === 0
              ? <p className="text-center text-muted-foreground text-sm py-8">No same-day pairs detected.</p>
              : result.sameDayInOut.map(p => <SameDayRow key={p.credit.id} pair={p} />)}
          </ScrollArea>
        </TabsContent>

        {/* Stamp duty */}
        <TabsContent value="stampduty" className="mt-0">
          <div className="px-4 py-2.5 border-b border-border bg-amber-500/5 text-xs text-amber-600 dark:text-amber-400 flex items-center justify-between">
            <span>Stamp duty & government levy debits — shown separately from operational expenditure.</span>
            <span className="font-mono font-bold">
              Total: {fmt(result.stampDutyTransactions.reduce((s, t) => s + t.debit, 0))}
            </span>
          </div>
          <ScrollArea className="h-[480px]">
            {result.stampDutyTransactions.length === 0
              ? <p className="text-center text-muted-foreground text-sm py-8">No stamp duty transactions detected.</p>
              : result.stampDutyTransactions.map(t => <TxnRow key={t.id} t={t} />)}
          </ScrollArea>
        </TabsContent>

        {/* Maintenance */}
        <TabsContent value="maintenance" className="mt-0">
          <div className="px-4 py-2.5 border-b border-border bg-muted/30 text-xs text-muted-foreground flex items-center justify-between">
            <span>Bank maintenance, SMS, COT, and service charge debits.</span>
            <span className="font-mono font-bold text-foreground">
              Total: {fmt(result.maintenanceFeeTransactions.reduce((s, t) => s + t.debit, 0))}
            </span>
          </div>
          <ScrollArea className="h-[480px]">
            {result.maintenanceFeeTransactions.length === 0
              ? <p className="text-center text-muted-foreground text-sm py-8">No maintenance fee transactions detected.</p>
              : result.maintenanceFeeTransactions.map(t => <TxnRow key={t.id} t={t} />)}
          </ScrollArea>
        </TabsContent>

        {/* Loans */}
        <TabsContent value="loans" className="mt-0">
          <div className="px-4 py-2.5 border-b border-border bg-violet-500/5 text-xs text-violet-600 dark:text-violet-400">
            Loan injections are excluded from operational credit. Recurring debit installments are identified as repayments.
          </div>
          {result.loanInjectionTransactions.length > 0 && (
            <>
              <div className="px-4 py-2 bg-muted/30 text-xs font-semibold text-muted-foreground border-b border-border">
                LOAN INJECTIONS (excluded from turnover)
              </div>
              <ScrollArea className="h-52">
                {result.loanInjectionTransactions.map(f => (
                  <FlagRow key={f.transaction.id} f={f} />
                ))}
              </ScrollArea>
            </>
          )}
          {result.loanRepayments.length > 0 && (
            <>
              <div className="px-4 py-2 bg-muted/30 text-xs font-semibold text-muted-foreground border-b border-border border-t border-t-border mt-0">
                LOAN REPAYMENTS (recurring installments)
              </div>
              <ScrollArea className="h-52">
                {result.loanRepayments.map(t => <TxnRow key={t.id} t={t} />)}
              </ScrollArea>
            </>
          )}
          {result.loanInjectionTransactions.length === 0 && result.loanRepayments.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-8">No loan transactions detected.</p>
          )}
        </TabsContent>

        {/* Review queue */}
        <TabsContent value="review" className="mt-0">
          {result.reviewCandidates.length > 0 && (
            <div className="px-4 py-2.5 border-b border-border bg-muted/20 text-xs text-muted-foreground">
              Low-confidence round-trip candidates. Kept in cleaned set — human auditor should verify.
            </div>
          )}
          <ScrollArea className="h-[500px]">
            {result.reviewCandidates.length === 0
              ? <p className="text-center text-muted-foreground text-sm py-8">No low-confidence candidates.</p>
              : result.reviewCandidates.map(f => <FlagRow key={f.transaction.id} f={f} dimmed />)}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </Card>
  )
}
