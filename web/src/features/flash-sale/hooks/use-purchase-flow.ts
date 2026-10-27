import { useEffect, useState } from 'react'
import { ApiError } from '@/lib/api'
import { getPurchase, purchase, type Order } from '../api'

export type Outcome =
  | { kind: 'order'; order: Order }
  | { kind: 'no-order'; userId: string }
  | { kind: 'error'; code: string; message: string; retryable: boolean }

type Action = 'buy' | 'check'

const RETRYABLE = new Set(['SERVICE_UNAVAILABLE', 'NETWORK_ERROR', 'INTERNAL_ERROR', 'UNKNOWN_ERROR'])
const TRACK_MS = 1_000

const toErrorOutcome = (error: unknown): Outcome => {
  const { code, message } =
    error instanceof ApiError ? error : { code: 'NETWORK_ERROR', message: 'Network error, please try again.' }
  return { kind: 'error', code, message, retryable: RETRYABLE.has(code) }
}

/**
 * Buy and check-order actions plus their outcome. A reserved order is tracked until the worker
 * confirms it, so the user sees reserved → confirmed without refreshing.
 */
export const usePurchaseFlow = ({ onSettled }: { onSettled: () => void }) => {
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [pending, setPending] = useState<Action | null>(null)
  const [lastAction, setLastAction] = useState<{ action: Action; userId: string } | null>(null)

  const run = async (action: Action, userId: string) => {
    // The previous outcome stays on screen until the new one replaces it, so the card doesn't
    // shrink and grow again on every click.
    setPending(action)
    setLastAction({ action, userId })
    try {
      if (action === 'buy') {
        setOutcome({ kind: 'order', order: await purchase(userId) })
      } else {
        const lookup = await getPurchase(userId)
        setOutcome(lookup.order ? { kind: 'order', order: lookup.order } : { kind: 'no-order', userId: lookup.user_id })
      }
    } catch (error) {
      setOutcome(toErrorOutcome(error))
    } finally {
      setPending(null)
      onSettled()
    }
  }

  const reservedOrder = outcome?.kind === 'order' && outcome.order.status === 'reserved' ? outcome.order : null

  useEffect(() => {
    if (!reservedOrder) return
    const track = setInterval(async () => {
      const lookup = await getPurchase(reservedOrder.user_id).catch(() => null)
      if (lookup?.order?.status === 'confirmed') setOutcome({ kind: 'order', order: lookup.order })
    }, TRACK_MS)
    return () => clearInterval(track)
  }, [reservedOrder?.order_id])

  return {
    outcome,
    pending,
    buy: (userId: string) => run('buy', userId),
    checkOrder: (userId: string) => run('check', userId),
    retry: () => lastAction && run(lastAction.action, lastAction.userId),
    dismiss: () => setOutcome(null),
  }
}
