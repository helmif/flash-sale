import { randomUUID } from 'node:crypto';
import { AppError } from '../../../shared/app-error';
import { getPhase } from '../flash-sale.rules';
import type { ReservedOrder, SaleDefinition } from '../flash-sale.types';
import type { FlashSaleRepository } from '../repositories/flash-sale.repository';

/**
 * What a purchase needs from the order pipeline. Owned here so this module doesn't depend on the
 * order module; index.ts plugs in OrderQueue.
 */
export interface OrderPublisher {
    enqueue(order: ReservedOrder): Promise<void>;
}

interface Dependencies {
    saleId: string;
    sale: SaleDefinition;
    repository: Pick<FlashSaleRepository, 'reserve'>;
    orders: OrderPublisher;
    now?: () => number;
}

/**
 * Reserves the one unit a user may buy. Winners get an order id right away; the order is saved to
 * MongoDB asynchronously by the worker, so the database only ever sees winners.
 *
 * One instance serves every request (it's created once in index.ts), so the sold-out flag below is
 * shared by all requests to this API process.
 */
export class CreatePurchaseUsecase {
    /** Once Redis says "sold out", stock can't come back within this sale, so later attempts skip Redis. */
    private soldOut = false;

    constructor(private readonly deps: Dependencies) {}

    async exec({ userId }: { userId: string }) {
        const { saleId, sale, repository, orders, now = Date.now } = this.deps;
        const at = now();

        // Cheap checks first: traffic outside the window or after sell-out never reaches Redis.
        const phase = getPhase(sale, at);
        if (phase === 'upcoming') throw new AppError('SALE_NOT_STARTED', 'The sale has not started yet.');
        if (phase === 'ended') throw new AppError('SALE_ENDED', 'The sale has ended.');
        if (this.soldOut) throw new AppError('OUT_OF_STOCK', 'Sorry, this item is sold out.');

        const result = await repository.reserve({ userId, orderId: randomUUID(), at });
        if (result.outcome === 'sold_out') {
            this.soldOut = true;
            throw new AppError('OUT_OF_STOCK', 'Sorry, this item is sold out.');
        }

        const order: ReservedOrder = { orderId: result.orderId, userId, saleId, reservedAt: result.reservedAt };
        // On a repeat attempt this is the self-heal: if an earlier attempt won the gate but crashed
        // before enqueueing, this enqueues it now. The job id is the order id, so it's a no-op when
        // the job already exists.
        await orders.enqueue(order);

        if (result.outcome === 'already_purchased') {
            throw new AppError('ALREADY_PURCHASED', 'You already purchased this item. Limit one per customer.');
        }
        return {
            order_id: order.orderId,
            user_id: userId,
            status: 'reserved' as const,
            reserved_at: new Date(order.reservedAt).toISOString(),
        };
    }
}
