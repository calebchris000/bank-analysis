import { useRef, useState, type DragEvent, type ChangeEvent } from 'react'
import { Upload, FileJson, FileSpreadsheet, X, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ParsedStatement } from '../types'
import { parseFileAll, parseJsonStatementAll } from '../utils/fileParser'

interface Props {
  onParsed: (statements: ParsedStatement[]) => void
  entityName: string
  onEntityNameChange: (name: string) => void
}

type InputMode = 'file' | 'json'

export default function FileUpload({ onParsed, entityName, onEntityNameChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<InputMode>('file')
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [queuedFiles, setQueuedFiles] = useState<File[]>([])
  const [jsonText, setJsonText] = useState('')
  const [jsonLabel, setJsonLabel] = useState('pasted.json')

  async function handleFiles(files: File[]) {
    setError(null)
    setLoading(true)
    try {
      const all: ParsedStatement[] = []
      for (const f of files) all.push(...await parseFileAll(f))
      autoFill(all)
      onParsed(all)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse file')
    } finally {
      setLoading(false)
    }
  }

  function autoFill(stmts: ParsedStatement[]) {
    if (entityName) return
    const name = stmts.find(s => s.detectedEntityName)?.detectedEntityName
    if (name) onEntityNameChange(name)
  }

  function handleJsonParse() {
    if (!jsonText.trim()) { setError('Paste a JSON object first.'); return }
    setError(null)
    setLoading(true)
    try {
      const stmts = parseJsonStatementAll(jsonText, jsonLabel || 'pasted.json')
      autoFill(stmts)
      onParsed(stmts)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse JSON')
    } finally {
      setLoading(false)
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files).filter(f =>
      /\.(csv|xlsx|xls|json)$/i.test(f.name),
    )
    if (!files.length) { setError('Please drop CSV, XLSX, or JSON files only.'); return }
    setQueuedFiles(files)
    handleFiles(files)
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    setQueuedFiles(files)
    handleFiles(files)
    e.target.value = ''
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Upload className="h-4 w-4" />
          Step 1 — Upload Bank Statement
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* Entity name */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Building2 className="h-3 w-3" />
            Company / Entity Name
          </label>
          <Input
            value={entityName}
            onChange={e => onEntityNameChange(e.target.value)}
            placeholder="e.g. Acme Trading Ltd — auto-filled from JSON"
            className="h-9 text-sm font-mono"
          />
          <p className="text-[0.65rem] text-muted-foreground">
            Required for Layer 1 self-transfer detection when multiple statements are uploaded
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1 w-fit">
          {(['file', 'json'] as InputMode[]).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(null) }}
              className={cn(
                'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                mode === m
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m === 'file' ? 'Upload File' : 'Paste JSON'}
            </button>
          ))}
        </div>

        {mode === 'file' && (
          <>
            <div
              role="button"
              tabIndex={0}
              className={cn(
                'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors',
                dragging
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/60 hover:bg-muted/30',
                loading && 'opacity-60 pointer-events-none',
              )}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
            >
              <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls,.json"
                multiple onChange={onChange} className="hidden" />
              {loading ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="h-8 w-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                  <p className="text-sm text-muted-foreground">
                    Parsing {queuedFiles.length} file{queuedFiles.length > 1 ? 's' : ''}…
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex gap-2 text-muted-foreground">
                    <FileSpreadsheet className="h-8 w-8" />
                    <FileJson className="h-8 w-8" />
                  </div>
                  <p className="text-sm text-foreground">
                    Drop CSV, XLSX, or JSON{' '}
                    <span className="text-primary underline underline-offset-2">or click to browse</span>
                  </p>
                  <p className="text-xs text-muted-foreground">Multiple files for multi-bank analysis</p>
                </div>
              )}
            </div>

            {queuedFiles.length > 0 && !loading && (
              <div className="flex flex-wrap gap-2">
                {queuedFiles.map((f, i) => (
                  <Badge key={i} variant="secondary" className="gap-1 text-xs font-mono">
                    <FileSpreadsheet className="h-3 w-3" />
                    {f.name}
                    <span className="text-muted-foreground ml-1">{(f.size / 1024).toFixed(1)} KB</span>
                  </Badge>
                ))}
              </div>
            )}
          </>
        )}

        {mode === 'json' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Label (optional)
              </label>
              <Input
                value={jsonLabel}
                onChange={e => setJsonLabel(e.target.value)}
                placeholder="e.g. GTBank-Jan2025.json"
                className="h-9 text-sm font-mono"
              />
            </div>
            <textarea
              value={jsonText}
              onChange={e => setJsonText(e.target.value)}
              className={cn(
                'min-h-56 w-full resize-y rounded-md border border-input bg-background px-3 py-2',
                'text-xs font-mono text-foreground placeholder:text-muted-foreground',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0',
                'transition-colors',
              )}
              placeholder={`Paste your bank API JSON response here…\n\nExpected shape:\n{\n  "statusCode": "200",\n  "data": [{\n    "response": {\n      "Name": "COMPANY NAME",\n      "Details": [\n        { "PTransactionDate": "…", "PNarration": "…", "PCredit": "…", "PDebit": "…" }\n      ]\n    }\n  }]\n}`}
              spellCheck={false}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {jsonText.length > 0 ? `${(jsonText.length / 1024).toFixed(1)} KB pasted` : ''}
              </span>
              <div className="flex gap-2">
                {jsonText && (
                  <Button variant="ghost" size="sm" onClick={() => { setJsonText(''); setError(null) }}>
                    <X className="h-3.5 w-3.5 mr-1" /> Clear
                  </Button>
                )}
                <Button size="sm" onClick={handleJsonParse} disabled={loading || !jsonText.trim()}>
                  {loading ? 'Parsing…' : 'Parse JSON →'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-destructive text-xs">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
