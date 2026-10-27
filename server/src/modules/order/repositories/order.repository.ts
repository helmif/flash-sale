import { MongoServerError, type Collection, type Db } from 'mongodb';
import type { CreateOrderJob } from '../queues/order.queue';

interface OrderDocument {
    _id: string; // the order id issued at the Redis gate
    sale_id: string;
    user_id: string;
    status: 'confirmed';
    reserved_at: Date;
    created_at: Date;
}

const DUPLICATE_KEY = 11000;

/** Durable source of truth for orders. Written only by the worker, so only winners reach MongoDB. */
export class OrderRepository {
    private constructor(private readonly orders: Collection<OrderDocument>) {}

    static async create(db: Db): Promise<OrderRepository> {
        const orders = db.collection<OrderDocument>('orders');
        // The last safety net for "one per user", independent of Redis.
        await orders.createIndex({ sale_id: 1, user_id: 1 }, { unique: true });
        return new OrderRepository(orders);
    }

    /**
     * Saves the order. Saving the same order again (a job retry) is a no-op.
     *
     * @returns 'created', 'exists' for a retry of the same order, or 'conflict' when the user
     *   already has a *different* order for this sale, which the Redis gate should make impossible.
     */
    async save(job: CreateOrderJob): Promise<'created' | 'exists' | 'conflict'> {
        try {
            await this.orders.insertOne({
                _id: job.orderId,
                sale_id: job.saleId,
                user_id: job.userId,
                status: 'confirmed',
                reserved_at: new Date(job.reservedAt),
                created_at: new Date(),
            });
            return 'created';
        } catch (err) {
            if (!(err instanceof MongoServerError) || err.code !== DUPLICATE_KEY) throw err;
            const existing = await this.orders.findOne({ _id: job.orderId }, { projection: { _id: 1 } });
            return existing ? 'exists' : 'conflict';
        }
    }

    async countBySale(saleId: string): Promise<number> {
        return this.orders.countDocuments({ sale_id: saleId });
    }
}
