import { useState } from 'react'
import { Download, RotateCcw, FileSpreadsheet, BarChart3, CalendarDays, List, Landmark } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { AnalysisResult, OutputFormat } from '../types'
import { exportCleanedCSV, exportCleanedJSON, exportXLSX } from '../utils/exportUtils'

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function CleanedStatement({ result, onReset }: { result: AnalysisResult; onReset: () => void }) {
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('json')

  const netFlow = result.totalCleanedCredit - result.totalDebit

  function handleDownload() {
    if (outputFormat === 'csv') exportCleanedCSV(result)
    else exportCleanedJSON(result)
  }

  const plRows: { label: string; value: number; type: string; parens?: boolean; divider?: boolean; bold?: boolean; sub?: boolean }[] = [
    { label: 'Gross Operational Credit (Revenue)', value: result.totalCleanedCredit, type: 'credit' },
    { label: 'Total Operational Debit (Excl. Bank Charges)', value: result.totalOperationalDebit, type: 'debit', parens: true },
    { label: 'Bank Charges (Stamp Duty + Maintenance)', value: result.totalBankCharges, type: 'charge', parens: true },
    { label: 'Net Cash Flow', value: netFlow, type: netFlow >= 0 ? 'credit' : 'debit', divider: true, bold: true },
    { label: 'Excluded / Flagged Credit Removed', value: result.totalFlaggedCredit, type: 'flag', sub: true },
    { label: 'Same-Day In/Out Credit Removed', value: result.totalSameDayCredit, type: 'flag', sub: true },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* Header + P&L */}
      <Card>
        <CardHeader className="pb-3 border-b border-border">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm font-semibold">Step 3 — Cleaned Bank Statement</CardTitle>
            <Button variant="ghost" size="sm" onClick={onReset} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" /> Start Over
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-4">
          <p className="text-[0.65rem] uppercase tracking-widest text-muted-foreground mb-3 font-semibold">
            P&amp;L Summary — Operational Cash Flow
          </p>
          <div className="rounded-lg border border-border overflow-hidden">
            {plRows.map((row, i) => (
              <div key={i}>
                {row.divider && <div className="border-t-2 border-border" />}
                <div className={cn(
                  'flex items-center justify-between px-4 py-2.5',
                  row.sub && 'bg-muted/20',
                  row.bold && 'bg-muted/30',
                  !row.sub && !row.bold && i % 2 !== 0 && 'bg-muted/10',
                )}>
                  <span className={cn(
                    'text-xs',
                    row.sub && 'text-muted-foreground pl-3',
                    row.bold && 'font-semibold',
                  )}>
                    {row.sub && '· '}{row.label}
                  </span>
                  <span className={cn(
                    'text-xs font-mono tabular-nums font-bold',
                    row.type === 'credit' && 'text-emerald-600 dark:text-emerald-400',
                    row.type === 'debit' && 'text-red-600 dark:text-red-400',
                    row.type === 'charge' && 'text-orange-600 dark:text-orange-400',
                    row.type === 'flag' && 'text-amber-600 dark:text-amber-400',
                  )}>
                    {row.parens ? `(${fmt(row.value)})` : fmt(row.value)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 mt-3">
            <Badge variant="secondary" className="text-xs">
              {result.cleanedTransactions.length.toLocaleString()} cleaned txns
            </Badge>
            <Badge variant="secondary" className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10">
              {result.flaggedTransactions.length.toLocaleString()} excluded
            </Badge>
            {result.sameDayInOut.length > 0 && (
              <Badge variant="secondary" className="text-xs text-orange-600 dark:text-orange-400 bg-orange-500/10">
                {result.sameDayInOut.length} same-day pairs removed
              </Badge>
            )}
            {result.reviewCandidates.length > 0 && (
              <Badge variant="secondary" className="text-xs text-blue-600 dark:text-blue-400 bg-blue-500/10">
                {result.reviewCandidates.length} pending review
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Breakdown tabs */}
      <Card>
        <CardContent className="pt-4">
          <Tabs defaultValue="monthly">
            <TabsList className="h-8 mb-4 flex-wrap">
              <TabsTrigger value="monthly" className="text-xs h-7 gap-1.5">
                <BarChart3 className="h-3 w-3" /> Monthly
              </TabsTrigger>
              <TabsTrigger value="weekly" className="text-xs h-7 gap-1.5">
                <CalendarDays className="h-3 w-3" /> Weekly
              </TabsTrigger>
              <TabsTrigger value="ledger" className="text-xs h-7 gap-1.5">
                <List className="h-3 w-3" /> Ledger
              </TabsTrigger>
              {result.loanRepayments.length > 0 && (
                <TabsTrigger value="loans" className="text-xs h-7 gap-1.5">
                  <Landmark className="h-3 w-3" /> Loan Repayments
                </TabsTrigger>
              )}
            </TabsList>

            {/* Monthly */}
            <TabsContent value="monthly">
              <ScrollArea className="h-[420px]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card z-10">
                    <tr className="border-b border-border">
                      {['Month', 'Operational Credit', 'Debit', 'Net Flow', 'Count'].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-[0.65rem] uppercase tracking-widest text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.monthlyTotals.map((m, i) => (
                      <tr key={m.month} className={cn('border-b border-border/50', i % 2 !== 0 && 'bg-muted/20')}>
                        <td className="px-3 py-2 font-medium whitespace-nowrap">{m.month}</td>
                        <td className="px-3 py-2 font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{fmt(m.totalCredit)}</td>
                        <td className="px-3 py-2 font-mono tabular-nums text-red-600 dark:text-red-400">{fmt(m.totalDebit)}</td>
                        <td className={cn('px-3 py-2 font-mono tabular-nums font-semibold', m.netFlow >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>{fmt(m.netFlow)}</td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">{m.transactionCount}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border bg-muted/30 font-bold">
                      <td className="px-3 py-2.5">TOTAL</td>
                      <td className="px-3 py-2.5 font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{fmt(result.totalCleanedCredit)}</td>
                      <td className="px-3 py-2.5 font-mono tabular-nums text-red-600 dark:text-red-400">{fmt(result.totalDebit)}</td>
                      <td className={cn('px-3 py-2.5 font-mono tabular-nums', netFlow >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>{fmt(netFlow)}</td>
                      <td className="px-3 py-2.5">{result.cleanedTransactions.length}</td>
                    </tr>
                  </tbody>
                </table>
              </ScrollArea>
            </TabsContent>

            {/* Weekly */}
            <TabsContent value="weekly">
              <ScrollArea className="h-[420px]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card z-10">
                    <tr className="border-b border-border">
                      {['Week', 'Credit', 'Debit', 'Net Flow', 'Count'].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-[0.65rem] uppercase tracking-widest text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.weeklyTotals.map((w, i) => (
                      <tr key={w.week} className={cn('border-b border-border/50', i % 2 !== 0 && 'bg-muted/20')}>
                        <td className="px-3 py-2 font-medium whitespace-nowrap">{w.weekLabel}</td>
                        <td className="px-3 py-2 font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{fmt(w.totalCredit)}</td>
                        <td className="px-3 py-2 font-mono tabular-nums text-red-600 dark:text-red-400">{fmt(w.totalDebit)}</td>
                        <td className={cn('px-3 py-2 font-mono tabular-nums font-semibold', w.netFlow >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>{fmt(w.netFlow)}</td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">{w.transactionCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </TabsContent>

            {/* Ledger */}
            <TabsContent value="ledger">
              <ScrollArea className="h-[420px]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card z-10">
                    <tr className="border-b border-border">
                      {['Date', 'Narration', 'Credit', 'Debit', 'Balance'].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-[0.65rem] uppercase tracking-widest text-muted-foreground font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.cleanedTransactions.slice(0, 200).map((t, i) => (
                      <tr key={t.id} className={cn('border-b border-border/50', i % 2 !== 0 && 'bg-muted/20')}>
                        <td className="px-3 py-2 whitespace-nowrap">{t.date}</td>
                        <td className="px-3 py-2 max-w-[280px] truncate text-muted-foreground" title={t.narration}>{t.narration}</td>
                        <td className="px-3 py-2 font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{t.credit > 0 ? fmt(t.credit) : ''}</td>
                        <td className="px-3 py-2 font-mono tabular-nums text-red-600 dark:text-red-400">{t.debit > 0 ? fmt(t.debit) : ''}</td>
                        <td className="px-3 py-2 font-mono tabular-nums text-muted-foreground">{t.balance !== null ? fmt(t.balance) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result.cleanedTransactions.length > 200 && (
                  <p className="text-xs text-muted-foreground text-center py-3">
                    Showing 200 of {result.cleanedTransactions.length.toLocaleString()} — download for full ledger
                  </p>
                )}
              </ScrollArea>
            </TabsContent>

            {/* Loan Repayments */}
            {result.loanRepayments.length > 0 && (
              <TabsContent value="loans">
                <ScrollArea className="h-[420px]">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-card z-10">
                      <tr className="border-b border-border">
                        {['Date', 'Narration', 'Debit Amount'].map(h => (
                          <th key={h} className="text-left px-3 py-2 text-[0.65rem] uppercase tracking-widest text-muted-foreground font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.loanRepayments.map((t, i) => (
                        <tr key={t.id} className={cn('border-b border-border/50', i % 2 !== 0 && 'bg-muted/20')}>
                          <td className="px-3 py-2 whitespace-nowrap">{t.date}</td>
                          <td className="px-3 py-2 max-w-[320px] truncate text-muted-foreground" title={t.narration}>{t.narration}</td>
                          <td className="px-3 py-2 font-mono tabular-nums text-red-600 dark:text-red-400 font-semibold">{fmt(t.debit)}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-border bg-muted/30 font-bold">
                        <td className="px-3 py-2.5" colSpan={2}>TOTAL REPAYMENTS</td>
                        <td className="px-3 py-2.5 font-mono tabular-nums text-red-600 dark:text-red-400">
                          {fmt(result.loanRepayments.reduce((s, t) => s + t.debit, 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </ScrollArea>
              </TabsContent>
            )}
          </Tabs>
        </CardContent>
      </Card>

      {/* Download bar */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Format:</span>
              <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
                {(['json', 'csv'] as OutputFormat[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setOutputFormat(f)}
                    className={cn(
                      'px-3 py-1 rounded-md text-xs font-medium uppercase transition-colors',
                      outputFormat === f ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={handleDownload} className="gap-1.5">
                <Download className="h-3.5 w-3.5" />
                Cleaned Statement ({outputFormat.toUpperCase()})
              </Button>
              <Button size="sm" variant="secondary" onClick={() => exportXLSX(result)} className="gap-1.5">
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Full Report (XLSX)
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
