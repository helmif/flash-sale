import { request } from '@/lib/api'

export type SaleStatus = 'upcoming' | 'active' | 'sold_out' | 'ended'
export type OrderStatus = 'reserved' | 'confirmed'

export interface Sale {
  sale_id: string
  product: { name: string; tagline: string; price: number; currency: string; image_url: string }
  status: SaleStatus
  starts_at: string
  ends_at: string
  total_stock: number
  remaining_stock: number
  server_time: string
}

export interface Order {
  order_id: string
  user_id: string
  status: OrderStatus
  reserved_at: string
  confirmed_at?: string | null
}

export interface PurchaseLookup {
  user_id: string
  purchased: boolean
  order: Order | null
}

export const getSale = () => request<Sale>('/v1/flash-sale')

export const purchase = (userId: string) =>
  request<Order>('/v1/flash-sale/purchases', { method: 'POST', body: JSON.stringify({ user_id: userId }) })

export const getPurchase = (userId: string) =>
  request<PurchaseLookup>(`/v1/flash-sale/purchases/${encodeURIComponent(userId)}`)
