import { Flame } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/format'
import type { Sale, SaleStatus } from '../api'
import { ZoomableImage } from './zoomable-image'

const AVAILABILITY: Record<SaleStatus, { label: string; variant: 'success' | 'info' | 'danger' | 'muted' }> = {
  upcoming: { label: 'Coming soon', variant: 'info' },
  active: { label: 'Available', variant: 'success' },
  sold_out: { label: 'Sold out', variant: 'danger' },
  ended: { label: 'Sale ended', variant: 'muted' },
}

export const ProductSummary = ({ sale, status }: { sale: Sale; status: SaleStatus }) => {
  const { product, remaining_stock, total_stock } = sale
  const availability = AVAILABILITY[status]
  const soldPercent = total_stock > 0 ? Math.round(((total_stock - remaining_stock) / total_stock) * 100) : 100

  return (
    <section className="flex flex-col gap-4">
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200">
        <Badge variant="danger" className="absolute top-3 right-3 z-10 rounded-full">
          <Flame className="size-3.5" /> Hot New Product
        </Badge>
        {/* object-contain fits a photo of any shape inside the 4:3 box; multiply blends a white
            product-photo background into the box colour instead of showing a white rectangle. */}
        <ZoomableImage src={product.image_url} alt={product.name} className="object-contain p-5 mix-blend-multiply" />
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{product.name}</h1>
        <p className="text-slate-500">{product.tagline}</p>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-4xl font-extrabold tracking-tight">{formatPrice(product.price, product.currency)}</span>
        <Badge variant={availability.variant}>
          <span className="size-1.5 rounded-full bg-current" />
          {availability.label}
        </Badge>
      </div>

      {status !== 'ended' && (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-xs text-slate-500">
            <span>{remaining_stock > 0 ? `Only ${remaining_stock} left` : 'All units claimed'}</span>
            <span>{soldPercent}% sold</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-rose-500 transition-[width]" style={{ width: `${soldPercent}%` }} />
          </div>
        </div>
      )}
    </section>
  )
}
