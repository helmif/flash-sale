export interface SaleDefinition {
    startsAt: number; // epoch ms, inclusive
    endsAt: number; // epoch ms, exclusive
    totalStock: number;
}

export type SalePhase = 'upcoming' | 'active' | 'ended';
export type SaleStatus = SalePhase | 'sold_out';

/** reserved: won the Redis gate, order not saved yet. confirmed: the worker saved it to MongoDB. */
export type OrderStatus = 'reserved' | 'confirmed';

export interface Order {
    orderId: string;
    userId: string;
    status: OrderStatus;
    reservedAt: number;
    confirmedAt: number | null;
}

/** Outcome of the atomic gate in Redis. For a repeat buyer it carries the original reservation. */
export type ReserveResult =
    | { outcome: 'reserved' | 'already_purchased'; orderId: string; reservedAt: number }
    | { outcome: 'sold_out' };

/** A unit won at the gate, handed to the order pipeline to be saved. */
export interface ReservedOrder {
    orderId: string;
    userId: string;
    saleId: string;
    reservedAt: number;
}
