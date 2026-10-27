import type { Redis } from 'ioredis';
import { AppError } from '../../../shared/app-error';
import { logger } from '../../../shared/logger';
import type { Order, OrderStatus, ReserveResult, SaleDefinition } from '../flash-sale.types';

// KEYS: meta, stock | ARGV: startsAt, endsAt, totalStock
const INIT_SALE = `
if redis.call('EXISTS', KEYS[1]) == 0 then
  redis.call('HSET', KEYS[1], 'starts_at', ARGV[1], 'ends_at', ARGV[2], 'total_stock', ARGV[3])
  redis.call('SET', KEYS[2], ARGV[3])
end
return redis.call('HMGET', KEYS[1], 'starts_at', 'ends_at', 'total_stock')
`;

// KEYS: stock, buyers, order | ARGV: userId, reservation ("<orderId>|<reservedAt>")
// The gate. Redis runs a script to completion before serving any other command, so the
// check-then-write below cannot interleave with another buyer: no oversell, no double buy,
// and buyers are served strictly in the order their requests reach Redis.
// A repeat buyer gets their original reservation back, so a retry can re-enqueue it faithfully.
const RESERVE = `
local existing = redis.call('HGET', KEYS[2], ARGV[1])
if existing then
  return {'already_purchased', existing}
end
if tonumber(redis.call('GET', KEYS[1]) or '0') <= 0 then
  return {'sold_out'}
end
redis.call('DECR', KEYS[1])
redis.call('HSET', KEYS[2], ARGV[1], ARGV[2])
redis.call('HSET', KEYS[3], 'user_id', ARGV[1], 'status', 'reserved')
return {'reserved', ARGV[2]}
`;

/** A buyer's entry in the buyers hash: the order id and when it was reserved. */
const encodeReservation = (orderId: string, reservedAt: number) => `${orderId}|${reservedAt}`;
const decodeReservation = (value: string) => {
    const [orderId, reservedAt] = value.split('|');
    return { orderId, reservedAt: Number(reservedAt) };
};

type ScriptedRedis = Redis & {
    initSale(
        meta: string,
        stock: string,
        startsAt: number,
        endsAt: number,
        totalStock: number
    ): Promise<Array<string | null>>;
    reserve(stock: string, buyers: string, order: string, userId: string, reservation: string): Promise<string[]>;
};

/** Hot-path sale state in Redis: stock counter, buyers (user → reservation) and order status. */
export class FlashSaleRepository {
    private readonly redis: ScriptedRedis;

    private readonly prefix: string;

    constructor(
        redis: Redis,
        private readonly saleId: string
    ) {
        this.redis = redis as ScriptedRedis;
        this.redis.defineCommand('initSale', { numberOfKeys: 2, lua: INIT_SALE });
        this.redis.defineCommand('reserve', { numberOfKeys: 3, lua: RESERVE });
        // The {hash tag} keeps every key of a sale in one Redis Cluster slot, which multi-key scripts require.
        this.prefix = `flashsale:{${saleId}}`;
    }

    /**
     * Creates the sale if it does not exist yet and returns what is stored. First writer wins:
     * a restarted or newly scaled instance never resets stock, and all instances share one window.
     *
     * @throws Error when a sale with this id exists but its stored definition can't be read
     *   (e.g. written by an older version), so startup fails loudly instead of running a broken sale.
     */
    async initSale(sale: SaleDefinition): Promise<SaleDefinition> {
        const stored = await this.run('init_sale', async () => {
            if (this.redis.status === 'wait') await this.redis.connect();
            return this.redis.initSale(
                this.key('meta'),
                this.key('stock'),
                sale.startsAt,
                sale.endsAt,
                sale.totalStock
            );
        });

        const [startsAt, endsAt, totalStock] = stored.map((value) => (value === null ? NaN : Number(value)));
        if ([startsAt, endsAt, totalStock].some(Number.isNaN)) {
            throw new Error(
                `Sale "${this.saleId}" already exists in Redis but its definition is unreadable. ` +
                    'Use a new SALE_ID, or delete the old keys.'
            );
        }
        return { startsAt, endsAt, totalStock };
    }

    async reserve(input: { userId: string; orderId: string; at: number }): Promise<ReserveResult> {
        return this.run('reserve', async () => {
            const [outcome, reservation] = await this.redis.reserve(
                this.key('stock'),
                this.key('buyers'),
                this.orderKey(input.orderId),
                input.userId,
                encodeReservation(input.orderId, input.at)
            );
            return outcome === 'sold_out'
                ? { outcome }
                : { outcome: outcome as 'reserved' | 'already_purchased', ...decodeReservation(reservation) };
        });
    }

    async getRemainingStock(): Promise<number> {
        return this.run('get_stock', async () => Number((await this.redis.get(this.key('stock'))) ?? 0));
    }

    async findOrderByUser(userId: string): Promise<Order | null> {
        return this.run('find_order', async () => {
            const reservation = await this.redis.hget(this.key('buyers'), userId);
            if (!reservation) return null;
            const { orderId, reservedAt } = decodeReservation(reservation);
            const fields = await this.redis.hgetall(this.orderKey(orderId));
            return {
                orderId,
                userId,
                status: (fields.status ?? 'reserved') as OrderStatus,
                reservedAt,
                confirmedAt: fields.confirmed_at ? Number(fields.confirmed_at) : null,
            };
        });
    }

    /** Called by the worker once the order is durably saved. */
    async markConfirmed(orderId: string, at: number): Promise<void> {
        await this.run('mark_confirmed', async () => {
            await this.redis.hset(this.orderKey(orderId), 'status', 'confirmed', 'confirmed_at', at);
        });
    }

    async close(): Promise<void> {
        await this.redis.quit();
    }

    private key(name: 'meta' | 'stock' | 'buyers'): string {
        return `${this.prefix}:${name}`;
    }

    private orderKey(orderId: string): string {
        return `${this.prefix}:order:${orderId}`;
    }

    /** Logs the real Redis failure and surfaces a client-safe 503. Purchases are idempotent per user, so retrying is safe. */
    private async run<T>(operation: string, fn: () => Promise<T>): Promise<T> {
        try {
            return await fn();
        } catch (err) {
            logger.error({ err, operation }, 'redis operation failed');
            throw new AppError('SERVICE_UNAVAILABLE', 'The sale is busy right now, please retry');
        }
    }
}
