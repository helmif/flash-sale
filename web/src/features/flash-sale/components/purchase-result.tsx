import { CircleCheck, CircleX, Clock, Info, LoaderCircle, RotateCw, TriangleAlert, X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Order } from '../api'
import type { Outcome } from '../hooks/use-purchase-flow'

type Tone = 'success' | 'info' | 'warning' | 'danger'

const TONE: Record<Tone, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  info: 'border-indigo-200 bg-indigo-50 text-indigo-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  danger: 'border-rose-200 bg-rose-50 text-rose-900',
}

const ERROR_VIEW: Record<string, { tone: Tone; title: string; icon: ReactNode }> = {
  ALREADY_PURCHASED: { tone: 'info', title: 'You already have one', icon: <Info /> },
  OUT_OF_STOCK: { tone: 'danger', title: 'Sold out', icon: <CircleX /> },
  SALE_NOT_STARTED: { tone: 'info', title: 'Not yet!', icon: <Clock /> },
  SALE_ENDED: { tone: 'info', title: 'The sale has ended', icon: <Clock /> },
  VALIDATION_ERROR: { tone: 'warning', title: 'Check your details', icon: <TriangleAlert /> },
}

const BUSY_VIEW = { tone: 'warning' as const, title: "We're handling a lot of traffic", icon: <TriangleAlert /> }

/** Reserved → Confirmed, so the user sees the order being saved in the background. */
const OrderProgress = ({ order }: { order: Order }) => {
  const confirmed = order.status === 'confirmed'
  return (
    <ol className="mt-3 flex items-center gap-2 text-xs font-medium">
      <li className="inline-flex items-center gap-1 text-emerald-700">
        <CircleCheck className="size-4" /> Reserved
      </li>
      <li className="h-px flex-1 bg-emerald-300" />
      <li className={cn('inline-flex items-center gap-1', confirmed ? 'text-emerald-700' : 'text-slate-500')}>
        {confirmed ? <CircleCheck className="size-4" /> : <LoaderCircle className="size-4 animate-spin" />}
        {confirmed ? 'Confirmed' : 'Confirming…'}
      </li>
    </ol>
  )
}

interface PurchaseResultProps {
  outcome: Outcome
  productName: string
  /** A new request is in flight; this result is about to be replaced. */
  updating: boolean
  onRetry: () => void
  onDismiss: () => void
}

const toView = (outcome: Outcome, productName: string, onRetry: () => void) => {
  if (outcome.kind === 'order') {
    const { order } = outcome
    return {
      tone: 'success' as const,
      icon: <CircleCheck />,
      title: 'You got it!',
      body: (
        <>
          <p>
            {productName} is reserved for <b>{order.user_id}</b> at {formatTime(order.reserved_at)}.
          </p>
          <p className="mt-1 font-mono text-xs opacity-70">Order {order.order_id.slice(0, 8)}</p>
          <OrderProgress order={order} />
        </>
      ),
    }
  }
  if (outcome.kind === 'no-order') {
    return {
      tone: 'info' as const,
      icon: <Info />,
      title: 'No order found',
      body: <p>{outcome.userId} has not purchased this item.</p>,
    }
  }
  return {
    ...(ERROR_VIEW[outcome.code] ?? BUSY_VIEW),
    body: outcome.retryable ? (
      <>
        <p>Please try again. If your order already went through you'll keep it, and a retry never buys twice.</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={onRetry}>
          <RotateCw /> Try again
        </Button>
      </>
    ) : (
      <p>{outcome.message}</p>
    ),
  }
}

export const PurchaseResult = ({ outcome, productName, updating, onRetry, onDismiss }: PurchaseResultProps) => {
  const { tone, icon, title, body } = toView(outcome, productName, onRetry)
  const ref = useRef<HTMLDivElement>(null)

  // On short screens the result can land below the fold; bring a new one into view. Keyed on
  // which result it is, so the reserved → confirmed update doesn't scroll again, and
  // 'nearest' doesn't scroll at all when it's already visible.
  const resultKey =
    outcome.kind === 'order' ? outcome.order.order_id : outcome.kind === 'error' ? outcome.code : outcome.userId
  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ref.current?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [resultKey])

  return (
    <div
      ref={ref}
      role="status"
      aria-busy={updating}
      className={cn(
        'relative flex gap-3 rounded-xl border p-4 text-sm transition-opacity',
        TONE[tone],
        updating && 'opacity-60',
      )}
    >
      <span className="mt-0.5 [&_svg]:size-5">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <div className="mt-0.5 opacity-90">{body}</div>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="self-start opacity-50 hover:opacity-100"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
