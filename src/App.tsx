import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Moon, Sun, Hexagon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from './store'
import { analyzeStatements } from './utils/anomalyDetector'
import type { ParsedStatement } from './types'
import StepIndicator from './components/StepIndicator'
import FileUpload from './components/FileUpload'
import JsonViewer from './components/JsonViewer'
import AnomalyAnalysis from './components/AnomalyAnalysis'
import CleanedStatement from './components/CleanedStatement'

function RequireStatements() {
  const statements = useAppStore(s => s.statements)
  return statements.length > 0 ? <Outlet /> : <Navigate to="/" replace />
}

function RequireResult() {
  const result = useAppStore(s => s.result)
  return result !== null ? <Outlet /> : <Navigate to="/" replace />
}

function Layout() {
  const { isDark, setIsDark } = useAppStore()
  const location = useLocation()

  useEffect(() => {
    const root = document.documentElement
    if (isDark) root.classList.add('dark')
    else root.classList.remove('dark')
  }, [isDark])

  const stepFromPath: Record<string, 1 | 2 | 3> = {
    '/': 1, '/preview': 1, '/analysis': 2, '/export': 3,
  }
  const currentStep = stepFromPath[location.pathname] ?? 1

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-mono">
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Hexagon className="h-5 w-5 text-primary" strokeWidth={1.5} />
            <span className="font-bold text-base tracking-tight">BankLens</span>
          </div>
          <span className="text-muted-foreground text-xs hidden sm:block">
            Financial Turnover Extraction &amp; Anomaly Detection
          </span>
          <div className="ml-auto">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsDark(!isDark)}
              aria-label="Toggle theme"
              className="h-8 w-8"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto w-full px-4 py-5 flex flex-col gap-4 flex-1">
        <StepIndicator currentStep={currentStep} />
        <Outlet />
      </main>

      <footer className="border-t border-border py-3 text-center text-muted-foreground text-xs">
        BankLens · 4-Layer Anomaly Detection · Underwriting Risk Assessment
      </footer>
    </div>
  )
}

function UploadPage() {
  const { setStatements, entityName, setEntityName } = useAppStore()
  const navigate = useNavigate()

  function handleParsed(parsed: ParsedStatement[]) {
    setStatements(parsed)
    if (!entityName) {
      const detected = parsed.find(s => s.detectedEntityName)?.detectedEntityName
      if (detected) setEntityName(detected)
    }
    navigate('/preview')
  }

  return (
    <FileUpload
      onParsed={handleParsed}
      entityName={entityName}
      onEntityNameChange={setEntityName}
    />
  )
}

function PreviewPage() {
  const { statements, entityName, setResult } = useAppStore()
  const navigate = useNavigate()

  function handleProceed() {
    const result = analyzeStatements(statements, entityName || undefined)
    setResult(result)
    navigate('/analysis')
  }

  return <JsonViewer statements={statements} onProceed={handleProceed} />
}

function AnalysisPage() {
  const result = useAppStore(s => s.result)!
  const navigate = useNavigate()
  return <AnomalyAnalysis result={result} onProceed={() => navigate('/export')} />
}

function ExportPage() {
  const { result, reset } = useAppStore()
  const navigate = useNavigate()

  function handleReset() {
    reset()
    navigate('/')
  }

  return <CleanedStatement result={result!} onReset={handleReset} />
}

export default function App() {
  useEffect(() => {
    document.documentElement.classList.add('dark')
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<UploadPage />} />
          <Route element={<RequireStatements />}>
            <Route path="/preview" element={<PreviewPage />} />
          </Route>
          <Route element={<RequireResult />}>
            <Route path="/analysis" element={<AnalysisPage />} />
            <Route path="/export" element={<ExportPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
