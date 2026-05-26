import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import type { ParsedStatement, Transaction, AccountMeta } from '../types'

const COLUMN_ALIASES: Record<string, string[]> = {
  date: ['date', 'trans date', 'transaction date', 'value date', 'posting date', 'txn date', 'trans_date', 'value_date'],
  narration: ['narration', 'description', 'details', 'particulars', 'remarks', 'transaction description', 'ref', 'reference', 'memo', 'payment details'],
  debit: ['debit', 'debit amount', 'withdrawal', 'dr', 'payment', 'amount debit', 'debit (ngn)', 'debit(ngn)', 'withdrawals', 'debit amount (ngn)'],
  credit: ['credit', 'credit amount', 'deposit', 'cr', 'receipt', 'amount credit', 'credit (ngn)', 'credit(ngn)', 'deposits', 'credit amount (ngn)'],
  balance: ['balance', 'running balance', 'book balance', 'available balance', 'closing balance', 'bal', 'ledger balance'],
}

function normalizeHeader(raw: unknown): string {
  return String(raw).toLowerCase().trim().replace(/\s+/g, ' ')
}

function detectColumn(headers: string[], aliases: string[]): number {
  const norm = headers.map(normalizeHeader)
  for (const alias of aliases) {
    const idx = norm.indexOf(alias)
    if (idx !== -1) return idx
  }
  for (const alias of aliases) {
    const idx = norm.findIndex(h => h.includes(alias))
    if (idx !== -1) return idx
  }
  return -1
}

function parseAmount(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0
  const str = String(val).replace(/,/g, '').replace(/[^0-9.\-]/g, '')
  const n = parseFloat(str)
  return isNaN(n) ? 0 : n
}

function parseDate(val: unknown): Date | null {
  if (!val) return null
  if (typeof val === 'number') {
    // XLSX serial date
    const epoch = new Date(1899, 11, 30)
    const d = new Date(epoch.getTime() + val * 86400000)
    return isNaN(d.getTime()) ? null : d
  }
  const d = new Date(String(val))
  return isNaN(d.getTime()) ? null : d
}

function rowsToTransactions(rows: unknown[][], headers: string[]): Transaction[] {
  const colIdx = {
    date: detectColumn(headers, COLUMN_ALIASES.date!),
    narration: detectColumn(headers, COLUMN_ALIASES.narration!),
    debit: detectColumn(headers, COLUMN_ALIASES.debit!),
    credit: detectColumn(headers, COLUMN_ALIASES.credit!),
    balance: detectColumn(headers, COLUMN_ALIASES.balance!),
  }

  const transactions: Transaction[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    if (row.every(c => c === null || c === undefined || String(c).trim() === '')) continue

    const credit = colIdx.credit !== -1 ? parseAmount(row[colIdx.credit]) : 0
    const debit = colIdx.debit !== -1 ? parseAmount(row[colIdx.debit]) : 0
    const narration = colIdx.narration !== -1 ? String(row[colIdx.narration] ?? '').trim() : ''

    if (credit === 0 && debit === 0 && !narration) continue

    const rawDate = colIdx.date !== -1 ? row[colIdx.date] : null
    const parsedDate = parseDate(rawDate)

    transactions.push({
      id: `txn-${i}`,
      date: parsedDate
        ? parsedDate.toISOString().split('T')[0]!
        : rawDate
          ? String(rawDate)
          : '',
      dateObj: parsedDate,
      narration,
      debit,
      credit,
      balance: colIdx.balance !== -1 ? parseAmount(row[colIdx.balance]) : null,
      raw: Object.fromEntries(headers.map((h, idx) => [h, row[idx]])),
    })
  }

  return transactions
}

/** Parse a file and return ALL statements it contains (JSON may contain multiple accounts). */
export async function parseFileAll(file: File): Promise<ParsedStatement[]> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'json') {
    const text = await file.text()
    return parseJsonStatementAll(text, file.name)
  }
  const single = await parseFile(file)
  return [single]
}

export async function parseFile(file: File): Promise<ParsedStatement> {
  const ext = file.name.split('.').pop()?.toLowerCase()

  if (ext === 'csv') {
    return new Promise((resolve, reject) => {
      Papa.parse<string[]>(file, {
        skipEmptyLines: true,
        complete(results) {
          const [headers, ...rows] = results.data
          if (!headers) return reject(new Error('Empty CSV file'))
          resolve({
            fileName: file.name,
            headers,
            transactions: rowsToTransactions(rows as unknown[][], headers),
          })
        },
        error: reject,
      })
    })
  }

  if (ext === 'xlsx' || ext === 'xls') {
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array', cellDates: false })
    const ws = wb.Sheets[wb.SheetNames[0]!]
    if (!ws) throw new Error('No worksheet found')
    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
    const [headerRow, ...rows] = raw
    const headers = (headerRow as unknown[]).map(h => String(h))
    return {
      fileName: file.name,
      headers,
      transactions: rowsToTransactions(rows as unknown[][], headers),
    }
  }

  if (ext === 'json') {
    const text = await file.text()
    // returns first account; multi-account JSON is handled by parseFileAll
    return parseJsonStatement(text, file.name)
  }

  throw new Error(`Unsupported file format: .${ext}. Please upload a CSV, XLSX, or JSON file.`)
}

// ── JSON statement parser (bank API format) ─────────────────────────────────
// Expected shape: { statusCode, data: [{ response: { Name, Details: [...] } }] }
// Also accepts: a bare Details array, or a single response object.

interface RawDetail {
  PTransactionDate?: string
  PValueDate?: string
  PNarration?: string
  PCredit?: string | number
  PDebit?: string | number
  PBalance?: string | number
  [key: string]: unknown
}

interface RawResponse {
  Name?: string
  Nuban?: string
  AccountType?: string
  AccountCategory?: string
  Currency?: string
  Period?: string
  AvailableBal?: string
  BookBal?: string
  TotalCredit?: string
  TotalDebit?: string
  Address?: string
  Signatories?: { Name: string; BVN?: string }[]
  Details?: RawDetail[]
}

function detailsToTransactions(details: RawDetail[], prefix: string): Transaction[] {
  return details
    .filter(d => {
      const credit = parseAmount(d.PCredit)
      const debit = parseAmount(d.PDebit)
      const narration = String(d.PNarration ?? '').trim()
      // skip pure opening balance row with no movement
      if (credit === 0 && debit === 0 && narration.toLowerCase() === 'opening balance') return false
      return true
    })
    .map((d, i) => {
      const rawDate = d.PTransactionDate ?? d.PValueDate ?? ''
      const parsedDate = parseDate(rawDate)
      const credit = parseAmount(d.PCredit)
      const debit = parseAmount(d.PDebit)
      return {
        id: `${prefix}-${i}`,
        date: parsedDate
          ? parsedDate.toISOString().split('T')[0]!
          : rawDate,
        dateObj: parsedDate,
        narration: String(d.PNarration ?? '').trim(),
        credit,
        debit,
        balance: d.PBalance !== undefined ? parseAmount(d.PBalance) : null,
        raw: d as Record<string, unknown>,
      }
    })
}

function responseToStatement(response: RawResponse, fileName: string, idx: number): ParsedStatement {
  const details = response.Details ?? []
  const transactions = detailsToTransactions(details, `s${idx}`)
  const meta: AccountMeta = {
    name: response.Name ?? '',
    nuban: response.Nuban,
    accountType: response.AccountType,
    accountCategory: response.AccountCategory,
    currency: response.Currency,
    period: response.Period,
    availableBal: response.AvailableBal,
    bookBal: response.BookBal,
    reportedTotalCredit: response.TotalCredit,
    reportedTotalDebit: response.TotalDebit,
    address: response.Address,
    signatories: response.Signatories,
  }
  return {
    fileName: idx === 0 ? fileName : `${fileName} [${idx + 1}]`,
    bankName: response.Name,
    headers: ['PTransactionDate', 'PNarration', 'PCredit', 'PDebit', 'PBalance'],
    transactions,
    accountMeta: meta,
    detectedEntityName: response.Name,
  }
}

export function parseJsonStatement(jsonText: string, fileName = 'pasted.json'): ParsedStatement {
  let obj: unknown
  try {
    obj = JSON.parse(jsonText)
  } catch {
    throw new Error('Invalid JSON — please paste a valid JSON object.')
  }

  // Envelope format: { statusCode, data: [{ response: { ... } }] }
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    const root = obj as Record<string, unknown>

    if (Array.isArray(root.data)) {
      const items = root.data as { response?: RawResponse }[]
      if (items.length === 0) throw new Error('JSON data array is empty.')
      // Return the first account; caller can call for each item separately
      const first = items[0]
      if (!first?.response) throw new Error('Expected data[0].response to exist.')
      return responseToStatement(first.response, fileName, 0)
    }

    // Bare response object: { Name, Details, ... }
    if (Array.isArray((root as RawResponse).Details)) {
      return responseToStatement(root as RawResponse, fileName, 0)
    }
  }

  // Bare array of Detail rows
  if (Array.isArray(obj)) {
    const details = obj as RawDetail[]
    return {
      fileName,
      headers: ['PTransactionDate', 'PNarration', 'PCredit', 'PDebit', 'PBalance'],
      transactions: detailsToTransactions(details, 's0'),
    }
  }

  throw new Error('Unrecognised JSON structure. Expected { data: [{ response: { Details: [...] } }] }.')
}

/** Parse ALL accounts inside the envelope, returning one ParsedStatement per account. */
export function parseJsonStatementAll(jsonText: string, fileName = 'pasted.json'): ParsedStatement[] {
  let obj: unknown
  try {
    obj = JSON.parse(jsonText)
  } catch {
    throw new Error('Invalid JSON — please paste a valid JSON object.')
  }

  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    const root = obj as Record<string, unknown>
    if (Array.isArray(root.data)) {
      const items = root.data as { response?: RawResponse }[]
      return items
        .filter(item => item.response)
        .map((item, idx) => responseToStatement(item.response!, fileName, idx))
    }
  }

  // Fallback: treat as single statement
  return [parseJsonStatement(jsonText, fileName)]
}
