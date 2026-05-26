import { useLocation, useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '../store'
import type { AppStep } from '../types'

const STEPS: { id: AppStep; label: string; desc: string; path: string }[] = [
  { id: 1, label: 'Parse & Preview',  desc: 'Upload CSV / XLSX / JSON', path: '/preview' },
  { id: 2, label: 'Anomaly Analysis', desc: 'Detect & flag transactions',  path: '/analysis' },
  { id: 3, label: 'Clean Export',     desc: 'Download cleaned statement',  path: '/export' },
]

export default function StepIndicator({ currentStep }: { currentStep: AppStep }) {
  const { statements, result } = useAppStore()
  const navigate = useNavigate()
  const location = useLocation()

  // A step is "done" when its data exists and we're past it
  const isStepDone = (id: AppStep) => {
    if (id === 1) return statements.length > 0 && location.pathname !== '/' && location.pathname !== '/preview'
    if (id === 2) return result !== null && location.pathname === '/export'
    return false
  }

  // A step is navigable when its prerequisite data exists
  const canNavigate = (id: AppStep) => {
    if (id === 1) return statements.length > 0
    if (id === 2) return result !== null
    if (id === 3) return result !== null
    return false
  }

  return (
    <div className="flex items-center gap-0 rounded-xl border border-border bg-card px-5 py-4 overflow-x-auto">
      {STEPS.map((step, idx) => {
        const isActive = step.id === currentStep
        const isDone   = isStepDone(step.id)
        const clickable = canNavigate(step.id) && !isActive

        return (
          <div key={step.id} className="flex items-center gap-0 flex-1 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                onClick={() => clickable && navigate(step.path)}
                disabled={!clickable}
                className={cn(
                  'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors',
                  isDone   && 'bg-emerald-500 border-emerald-500 text-white cursor-pointer',
                  isActive && !isDone && 'border-primary text-primary cursor-default',
                  !isActive && !isDone && clickable && 'border-muted-foreground/40 text-muted-foreground hover:border-primary hover:text-primary cursor-pointer',
                  !isActive && !isDone && !clickable && 'border-muted-foreground/30 text-muted-foreground/40 cursor-not-allowed',
                )}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : step.id}
              </button>

              <div
                className={cn('flex flex-col min-w-0', clickable && 'cursor-pointer')}
                onClick={() => clickable && navigate(step.path)}
              >
                <span className={cn(
                  'text-xs font-semibold whitespace-nowrap',
                  isActive ? 'text-foreground' : 'text-muted-foreground',
                )}>
                  {step.label}
                </span>
                <span className="text-[0.65rem] text-muted-foreground whitespace-nowrap hidden sm:block">
                  {step.desc}
                </span>
              </div>
            </div>

            {idx < STEPS.length - 1 && (
              <div className={cn(
                'flex-1 h-px mx-3 min-w-4',
                isDone ? 'bg-emerald-500' : 'bg-border',
              )} />
            )}
          </div>
        )
      })}
    </div>
  )
}
