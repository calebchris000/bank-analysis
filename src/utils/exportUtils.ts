import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import type { AnalysisResult, Transaction, OutputFormat } from '../types'

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function txnRows(transactions: Transaction[]) {
  return transactions.map(t => ({
    Date: t.date,
    Narration: t.narration,
    Credit: fmt(t.credit),
    Debit: fmt(t.debit),
    Balance: t.balance !== null ? fmt(t.balance) : '',
  }))
}

export function exportCleanedCSV(result: AnalysisResult): void {
  const netFlow = result.totalCleanedCredit - result.totalDebit

  const csvData = [
    ...txnRows(result.cleanedTransactions),
    {},
    { Date: '--- SUMMARY ---' },
    { Date: 'Total Operational Credit', Narration: fmt(result.totalCleanedCredit) },
    { Date: 'Total Operational Debit', Narration: fmt(result.totalOperationalDebit) },
    { Date: 'Total Bank Charges', Narration: fmt(result.totalBankCharges) },
    { Date: 'Net Cash Flow', Narration: fmt(netFlow) },
    { Date: 'Excluded Credit Removed', Narration: fmt(result.totalFlaggedCredit) },
    { Date: 'Same-Day Credit Removed', Narration: fmt(result.totalSameDayCredit) },
    { Date: 'Cleaned Transactions', Narration: String(result.cleanedTransactions.length) },
    { Date: 'Excluded Transactions', Narration: String(result.flaggedTransactions.length) },
    {},
    { Date: '--- MONTHLY BREAKDOWN ---' },
    { Date: 'Month', Narration: 'Operational Credit', Credit: 'Debit', Debit: 'Net Flow', Balance: 'Transactions' },
    ...result.monthlyTotals.map(m => ({
      Date: m.month,
      Narration: fmt(m.totalCredit),
      Credit: fmt(m.totalDebit),
      Debit: fmt(m.netFlow),
      Balance: String(m.transactionCount),
    })),
    {},
    { Date: '--- WEEKLY BREAKDOWN ---' },
    { Date: 'Week', Narration: 'Credit', Credit: 'Debit', Debit: 'Net Flow', Balance: 'Transactions' },
    ...result.weeklyTotals.map(w => ({
      Date: w.weekLabel,
      Narration: fmt(w.totalCredit),
      Credit: fmt(w.totalDebit),
      Debit: fmt(w.netFlow),
      Balance: String(w.transactionCount),
    })),
  ]

  downloadBlob(Papa.unparse(csvData), 'cleaned-bank-statement.csv', 'text/csv')
}

export function exportCleanedJSON(result: AnalysisResult): void {
  const netFlow = result.totalCleanedCredit - result.totalDebit

  const payload = {
    metadata: {
      exportedAt: new Date().toISOString(),
      totalOperationalCredit: result.totalCleanedCredit,
      totalOperationalDebit: result.totalOperationalDebit,
      totalBankCharges: result.totalBankCharges,
      netCashFlow: netFlow,
      totalFlaggedCreditRemoved: result.totalFlaggedCredit,
      totalSameDayCreditRemoved: result.totalSameDayCredit,
      cleanedTransactionCount: result.cleanedTransactions.length,
      autoExcludedCount: result.flaggedTransactions.length,
      sameDayPairsRemoved: result.sameDayInOut.length,
      reviewQueueCount: result.reviewCandidates.length,
    },
    monthlyTotals: result.monthlyTotals,
    weeklyTotals: result.weeklyTotals,
    transactions: result.cleanedTransactions.map(t => ({
      id: t.id, date: t.date, narration: t.narration,
      credit: t.credit, debit: t.debit, balance: t.balance,
    })),
    exclusionLog: result.flaggedTransactions.map(f => ({
      id: f.transaction.id, date: f.transaction.date, narration: f.transaction.narration,
      creditAmount: f.transaction.credit, layer: f.layer,
      confidence: f.confidence ?? null, reason: f.reason,
    })),
    sameDayPairs: result.sameDayInOut.map(p => ({
      creditDate: p.credit.date, creditNarration: p.credit.narration, creditAmount: p.credit.credit,
      debitDate: p.debit.date, debitNarration: p.debit.narration, debitAmount: p.debit.debit,
      amountDiff: p.amountDiff,
    })),
    reviewQueue: result.reviewCandidates.map(f => ({
      id: f.transaction.id, date: f.transaction.date, narration: f.transaction.narration,
      creditAmount: f.transaction.credit, layer: f.layer, confidence: 'low', reason: f.reason,
    })),
    stampDuty: result.stampDutyTransactions.map(t => ({
      date: t.date, narration: t.narration, debit: t.debit,
    })),
    maintenanceFees: result.maintenanceFeeTransactions.map(t => ({
      date: t.date, narration: t.narration, debit: t.debit,
    })),
    loanInjections: result.loanInjectionTransactions.map(f => ({
      date: f.transaction.date, narration: f.transaction.narration,
      credit: f.transaction.credit, reason: f.reason,
    })),
    loanRepayments: result.loanRepayments.map(t => ({
      date: t.date, narration: t.narration, debit: t.debit,
    })),
  }

  downloadBlob(JSON.stringify(payload, null, 2), 'cleaned-bank-statement.json', 'application/json')
}

export function exportAnalysisCSV(result: AnalysisResult): void {
  const cleanedRows = result.cleanedTransactions.map(t => ({
    Status: 'CLEAN', Date: t.date, Narration: t.narration,
    Credit: fmt(t.credit), Debit: fmt(t.debit), Layer: '', Confidence: '', Reason: '',
  }))
  const flaggedRows = result.flaggedTransactions.map(f => ({
    Status: 'EXCLUDED', Date: f.transaction.date, Narration: f.transaction.narration,
    Credit: fmt(f.transaction.credit), Debit: fmt(f.transaction.debit),
    Layer: f.layer.toUpperCase(), Confidence: (f.confidence ?? '').toUpperCase(), Reason: f.reason,
  }))
  const reviewRows = result.reviewCandidates.map(f => ({
    Status: 'REVIEW', Date: f.transaction.date, Narration: f.transaction.narration,
    Credit: fmt(f.transaction.credit), Debit: fmt(f.transaction.debit),
    Layer: f.layer.toUpperCase(), Confidence: 'LOW', Reason: f.reason,
  }))
  downloadBlob(Papa.unparse([...cleanedRows, ...flaggedRows, ...reviewRows]), 'analysis-report.csv', 'text/csv')
}

export function exportAnalysisJSON(result: AnalysisResult): object {
  return {
    summary: {
      totalCleanedCredit: result.totalCleanedCredit,
      totalOperationalDebit: result.totalOperationalDebit,
      totalBankCharges: result.totalBankCharges,
      totalFlaggedCredit: result.totalFlaggedCredit,
      totalSameDayCredit: result.totalSameDayCredit,
      totalDebit: result.totalDebit,
      cleanedCount: result.cleanedTransactions.length,
      autoExcludedCount: result.flaggedTransactions.length,
      sameDayPairsCount: result.sameDayInOut.length,
      reviewQueueCount: result.reviewCandidates.length,
    },
    monthlyTotals: result.monthlyTotals,
    rawMonthlyTotals: result.rawMonthlyTotals,
    weeklyTotals: result.weeklyTotals,
    cleanedTransactions: result.cleanedTransactions,
    exclusionLog: result.flaggedTransactions.map(f => ({
      ...f.transaction, layer: f.layer, confidence: f.confidence ?? null, reason: f.reason,
    })),
    reviewQueue: result.reviewCandidates.map(f => ({
      ...f.transaction, layer: f.layer, confidence: 'low', reason: f.reason,
    })),
    loanRepayments: result.loanRepayments,
  }
}

export function exportXLSX(result: AnalysisResult): void {
  const wb = XLSX.utils.book_new()
  const netFlow = result.totalCleanedCredit - result.totalDebit

  // Cleaned Statement
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Date', 'Narration', 'Credit', 'Debit', 'Balance'],
    ...result.cleanedTransactions.map(t => [t.date, t.narration, t.credit, t.debit, t.balance ?? '']),
    [],
    ['TOTAL', '', result.totalCleanedCredit, result.totalDebit, ''],
  ]), 'Cleaned Statement')

  // Summary
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Metric', 'Value'],
    ['Total Operational Credit', result.totalCleanedCredit],
    ['Total Operational Debit', result.totalOperationalDebit],
    ['Total Bank Charges', result.totalBankCharges],
    ['Net Cash Flow', netFlow],
    ['Flagged Credit Removed', result.totalFlaggedCredit],
    ['Same-Day Credit Removed', result.totalSameDayCredit],
    ['Cleaned Transactions', result.cleanedTransactions.length],
    ['Excluded Transactions', result.flaggedTransactions.length],
    ['Same-Day Pairs Removed', result.sameDayInOut.length],
    ['Review Queue', result.reviewCandidates.length],
  ]), 'Summary')

  // Monthly Totals
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Month', 'Operational Credit', 'Debit', 'Net Flow', 'Transactions'],
    ...result.monthlyTotals.map(m => [m.month, m.totalCredit, m.totalDebit, m.netFlow, m.transactionCount]),
  ]), 'Monthly Totals')

  // Weekly Totals
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Week', 'Credit', 'Debit', 'Net Flow', 'Transactions'],
    ...result.weeklyTotals.map(w => [w.weekLabel, w.totalCredit, w.totalDebit, w.netFlow, w.transactionCount]),
  ]), 'Weekly Totals')

  // Exclusion Log
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Date', 'Narration', 'Credit', 'Debit', 'Layer', 'Confidence', 'Reason'],
    ...result.flaggedTransactions.map(f => [
      f.transaction.date, f.transaction.narration, f.transaction.credit,
      f.transaction.debit, f.layer, (f.confidence ?? '').toUpperCase(), f.reason,
    ]),
  ]), 'Exclusion Log')

  // Same-Day Pairs
  if (result.sameDayInOut.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Credit Date', 'Credit Narration', 'Credit Amount', 'Debit Date', 'Debit Narration', 'Debit Amount', 'Amount Diff'],
      ...result.sameDayInOut.map(p => [
        p.credit.date, p.credit.narration, p.credit.credit,
        p.debit.date, p.debit.narration, p.debit.debit, p.amountDiff,
      ]),
    ]), 'Same-Day Pairs')
  }

  // Stamp Duty
  if (result.stampDutyTransactions.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Date', 'Narration', 'Debit Amount'],
      ...result.stampDutyTransactions.map(t => [t.date, t.narration, t.debit]),
    ]), 'Stamp Duty')
  }

  // Maintenance Fees
  if (result.maintenanceFeeTransactions.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Date', 'Narration', 'Debit Amount'],
      ...result.maintenanceFeeTransactions.map(t => [t.date, t.narration, t.debit]),
    ]), 'Maintenance Fees')
  }

  // Loan Injections
  if (result.loanInjectionTransactions.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Date', 'Narration', 'Credit Amount', 'Reason'],
      ...result.loanInjectionTransactions.map(f => [f.transaction.date, f.transaction.narration, f.transaction.credit, f.reason]),
    ]), 'Loan Injections')
  }

  // Loan Repayments
  if (result.loanRepayments.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Date', 'Narration', 'Debit Amount'],
      ...result.loanRepayments.map(t => [t.date, t.narration, t.debit]),
    ]), 'Loan Repayments')
  }

  // Review Queue
  if (result.reviewCandidates.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Date', 'Narration', 'Credit', 'Debit', 'Confidence', 'Reason'],
      ...result.reviewCandidates.map(f => [
        f.transaction.date, f.transaction.narration, f.transaction.credit,
        f.transaction.debit, 'LOW', f.reason,
      ]),
    ]), 'Review Queue')
  }

  XLSX.writeFile(wb, 'bank-analysis.xlsx')
}

function downloadBlob(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export type { OutputFormat }
