import { ArrowRight, LoaderCircle, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCountdown } from '@/lib/format'
import type { SaleStatus } from '../api'

interface PurchaseFormProps {
  status: SaleStatus
  msUntilStart: number
  userId: string
  onUserIdChange: (value: string) => void
  onBuy: () => void
  onCheckOrder: () => void
  pending: 'buy' | 'check' | null
}

const buyLabel = (status: SaleStatus, msUntilStart: number) => {
  if (status === 'upcoming') return `Starts in ${formatCountdown(msUntilStart)}`
  if (status === 'sold_out') return 'Sold out'
  if (status === 'ended') return 'Sale ended'
  return (
    <>
      Buy now <ArrowRight />
    </>
  )
}

export const PurchaseForm = ({
  status,
  msUntilStart,
  userId,
  onUserIdChange,
  onBuy,
  onCheckOrder,
  pending,
}: PurchaseFormProps) => {
  const hasUserId = userId.trim().length > 0

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        onBuy()
      }}
    >
      <label className="relative">
        <span className="sr-only">Username or email</span>
        <User className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-9"
          placeholder="Username or email"
          maxLength={100}
          autoComplete="username"
          value={userId}
          onChange={(e) => onUserIdChange(e.target.value)}
        />
      </label>

      <Button
        type="submit"
        size="lg"
        className="w-full rounded-xl tracking-wider uppercase"
        disabled={!hasUserId || status !== 'active' || pending !== null}
      >
        {pending === 'buy' ? <LoaderCircle className="animate-spin" /> : buyLabel(status, msUntilStart)}
      </Button>

      <Button type="button" variant="link" size="sm" disabled={!hasUserId || pending !== null} onClick={onCheckOrder}>
        {pending === 'check' && <LoaderCircle className="animate-spin" />}
        Already bought? Check my order
      </Button>
    </form>
  )
}
