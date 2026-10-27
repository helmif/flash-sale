import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { AppError } from '../../../shared/app-error';
import { logger } from '../../../shared/logger';

export interface CreateOrderJob {
    orderId: string;
    userId: string;
    saleId: string;
    reservedAt: number;
}

/** One queue per sale, so a worker never picks up another sale's orders. */
export const orderQueueName = (saleId: string) => `orders-${saleId}`;

/** Producer side: the API hands winners to the worker. Only winners ever enter this queue. */
export class OrderQueue {
    private readonly queue: Queue<CreateOrderJob>;

    constructor(
        private readonly connection: Redis,
        saleId: string
    ) {
        this.queue = new Queue<CreateOrderJob>(orderQueueName(saleId), {
            connection,
            defaultJobOptions: {
                attempts: 10,
                backoff: { type: 'exponential', delay: 500 },
                removeOnComplete: { age: 24 * 3600 },
                removeOnFail: false, // keep for inspection; a failed order needs a human
            },
        });
    }

    /** Idempotent: the order id is the job id, so enqueueing the same order twice creates one job. */
    async enqueue(job: CreateOrderJob): Promise<void> {
        try {
            await this.queue.add('create-order', job, { jobId: job.orderId });
        } catch (err) {
            logger.error({ err, order_id: job.orderId }, 'enqueue failed');
            throw new AppError('SERVICE_UNAVAILABLE', 'The sale is busy right now, please retry');
        }
    }

    async close(): Promise<void> {
        await this.queue.close();
        // BullMQ leaves connections it was handed open; this queue owns its connection.
        await this.connection.quit();
    }
}
