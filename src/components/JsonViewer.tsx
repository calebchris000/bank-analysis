import { useState } from 'react'
import { Copy, Check, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { ParsedStatement } from '../types'

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2 })
}

export default function JsonViewer({ statements, onProceed }: {
  statements: ParsedStatement[]
  onProceed: () => void
}) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [pretty, setPretty] = useState(true)
  const [copied, setCopied] = useState(false)

  const stmt = statements[activeIdx]!
  const meta = stmt.accountMeta

  const json = JSON.stringify({
    ...(meta ? {
      account: {
        name: meta.name, nuban: meta.nuban, accountType: meta.accountType,
        accountCategory: meta.accountCategory, currency: meta.currency,
        period: meta.period,
        reportedTotalCredit: meta.reportedTotalCredit,
        reportedTotalDebit: meta.reportedTotalDebit,
      },
    } : { fileName: stmt.fileName }),
    totalTransactions: stmt.transactions.length,
    transactions: stmt.transactions.map(t => ({
      id: t.id, date: t.date, narration: t.narration,
      credit: t.credit, debit: t.debit, balance: t.balance,
    })),
  }, null, pretty ? 2 : 0)

  function copy() {
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }

  const totalCredit = stmt.transactions.reduce((s, t) => s + t.credit, 0)
  const totalDebit  = stmt.transactions.reduce((s, t) => s + t.debit, 0)

  return (
    <Card>
      <CardHeader className="pb-3 border-b border-border">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-semibold">Step 1 — Parsed JSON Preview</CardTitle>
          <Button size="sm" onClick={onProceed}>
            Proceed to Analysis <ChevronRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      </CardHeader>

      {/* Statement tabs (multi-file) */}
      {statements.length > 1 && (
        <div className="flex border-b border-border overflow-x-auto">
          {statements.map((s, i) => (
            <button
              key={i}
              onClick={() => setActiveIdx(i)}
              className={cn(
                'px-4 py-2 text-xs whitespace-nowrap border-b-2 transition-colors',
                i === activeIdx
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {s.accountMeta?.name ?? s.fileName}
            </button>
          ))}
        </div>
      )}

      {/* Account metadata grid */}
      {meta && (
        <div className="grid grid-cols-2 sm:grid-cols-3 border-b border-border">
          {[
            ['Account', meta.name],
            meta.nuban ? ['NUBAN', meta.nuban] : null,
            meta.accountType ? ['Type', `${meta.accountCategory} · ${meta.accountType}`] : null,
            meta.period ? ['Period', meta.period] : null,
            meta.currency ? ['Currency', meta.currency] : null,
            meta.reportedTotalCredit
              ? ['Reported Credit', parseFloat(meta.reportedTotalCredit).toLocaleString('en-US', { minimumFractionDigits: 2 })]
              : null,
          ].filter((x): x is string[] => x !== null).map(([k, v]) => (
            <div key={k} className="px-4 py-2.5 border-r border-b border-border last:border-r-0">
              <p className="text-[0.62rem] uppercase tracking-widest text-muted-foreground">{k}</p>
              <p className={cn('text-xs font-medium mt-0.5',
                k === 'Reported Credit' && 'text-emerald-600 dark:text-emerald-400',
              )}>{v}</p>
            </div>
          ))}
        </div>
      )}

      {/* Stat row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-border divide-x divide-border">
        {[
          { label: 'Source', value: stmt.fileName, cls: 'text-xs break-all' },
          { label: 'Transactions', value: stmt.transactions.length.toLocaleString(), cls: '' },
          { label: 'Parsed Credit', value: fmt(totalCredit), cls: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Parsed Debit',  value: fmt(totalDebit),  cls: 'text-red-600 dark:text-red-400' },
        ].map(s => (
          <div key={s.label} className="px-4 py-3">
            <p className="text-[0.62rem] uppercase tracking-widest text-muted-foreground">{s.label}</p>
            <p className={cn('text-sm font-bold mt-0.5 font-mono tabular-nums', s.cls)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
        <Tabs value={pretty ? 'pretty' : 'raw'} onValueChange={v => setPretty(v === 'pretty')}>
          <TabsList className="h-7">
            <TabsTrigger value="pretty" className="text-xs h-6 px-2.5">Pretty</TabsTrigger>
            <TabsTrigger value="raw"    className="text-xs h-6 px-2.5">Raw</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button variant="ghost" size="sm" onClick={copy} className="h-7 gap-1.5 text-xs">
          {copied ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
        </Button>
      </div>

      {/* JSON output */}
      <CardContent className="p-0">
        <pre className="overflow-auto max-h-[480px] p-4 text-[0.73rem] leading-relaxed text-foreground bg-muted/10 rounded-b-xl">
          <code>{json}</code>
        </pre>
      </CardContent>

      {/* Variance badge (JSON source only) */}
      {meta?.reportedTotalCredit && (() => {
        const variance = Math.abs(totalCredit - parseFloat(meta.reportedTotalCredit))
        return variance < 1 ? (
          <div className="px-4 pb-3">
            <Badge variant="secondary" className="gap-1 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10">
              <Check className="h-3 w-3" /> Zero credit variance — all transactions accounted for
            </Badge>
          </div>
        ) : (
          <div className="px-4 pb-3">
            <Badge variant="secondary" className="gap-1 text-amber-600 dark:text-amber-400 bg-amber-500/10">
              Credit variance: {variance.toLocaleString('en-US', { minimumFractionDigits: 2 })} — check for missing rows
            </Badge>
          </div>
        )
      })()}
    </Card>
  )
}
