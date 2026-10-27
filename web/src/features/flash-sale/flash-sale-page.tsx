import { ShieldCheck, TriangleAlert, Zap } from 'lucide-react'
import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { ProductSummary } from './components/product-summary'
import { PurchaseForm } from './components/purchase-form'
import { PurchaseResult } from './components/purchase-result'
import { usePurchaseFlow } from './hooks/use-purchase-flow'
import { useSale } from './hooks/use-sale'

const USER_ID_KEY = 'flash-sale:user-id'

// Storage can throw in private mode; remembering the user id is only a convenience.
const loadUserId = () => {
  try {
    return localStorage.getItem(USER_ID_KEY) ?? ''
  } catch {
    return ''
  }
}
const saveUserId = (userId: string) => {
  try {
    localStorage.setItem(USER_ID_KEY, userId)
  } catch {
    // ignore
  }
}

const BrandHeader = () => (
  <header className="flex items-center justify-between">
    <p className="flex items-baseline gap-1.5">
      <span className="text-2xl font-extrabold tracking-tight text-brand-ink">Bookipi</span>
      <span className="text-slate-700">Marketplace</span>
    </p>
    <p className="text-right text-[10px] leading-tight text-slate-400">
      Better things
      <br />
      for a brighter you
    </p>
  </header>
)

const TrustBadges = () => (
  <footer className="flex items-center justify-center gap-3 text-xs text-slate-400">
    <span className="inline-flex items-center gap-1">
      <ShieldCheck className="size-3.5" /> Secure Checkout
    </span>
    <span className="h-3 w-px bg-slate-200" />
    <span className="inline-flex items-center gap-1">
      <Zap className="size-3.5" /> Fast &amp; Reliable
    </span>
  </footer>
)

export const FlashSalePage = () => {
  const { sale, status, serverNow, connectionLost, refresh } = useSale()
  const flow = usePurchaseFlow({ onSettled: refresh })
  const [userId, setUserId] = useState(loadUserId)

  const submit = (action: (id: string) => void) => () => {
    const id = userId.trim()
    saveUserId(id)
    action(id)
  }

  return (
    // Top-aligned rather than vertically centred: a centred card moves every time its height
    // changes, e.g. when a result appears.
    <main className="flex min-h-screen justify-center px-4 py-6 sm:py-12">
      <Card className="flex h-fit w-full max-w-sm flex-col gap-5 p-5">
        <BrandHeader />

        {connectionLost && (
          <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <TriangleAlert className="size-4" />
            {sale ? 'Connection lost. Showing the last known status.' : 'Could not load the sale. Retrying…'}
          </p>
        )}

        {!sale || !status ? (
          !connectionLost && <div className="aspect-square animate-pulse rounded-2xl bg-slate-100" />
        ) : (
          <>
            <ProductSummary sale={sale} status={status} />
            <PurchaseForm
              status={status}
              msUntilStart={Date.parse(sale.starts_at) - serverNow}
              userId={userId}
              onUserIdChange={setUserId}
              onBuy={submit(flow.buy)}
              onCheckOrder={submit(flow.checkOrder)}
              pending={flow.pending}
            />
            {/* Below the buttons, so showing a result never moves what the user just clicked. */}
            {flow.outcome && (
              <PurchaseResult
                outcome={flow.outcome}
                productName={sale.product.name}
                updating={flow.pending !== null}
                onRetry={flow.retry}
                onDismiss={flow.dismiss}
              />
            )}
            <TrustBadges />
          </>
        )}
      </Card>
    </main>
  )
}
