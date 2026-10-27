import { UnrecoverableError, type Job } from 'bullmq';
import { logger } from '../../../shared/logger';
import type { CreateOrderJob } from '../queues/order.queue';
import type { OrderRepository } from '../repositories/order.repository';

/**
 * Where the worker reports that an order is saved. Owned here so this module doesn't depend on
 * the flash-sale module; worker.ts plugs in FlashSaleRepository.
 */
export interface OrderStatusWriter {
    markConfirmed(orderId: string, at: number): Promise<void>;
}

interface Dependencies {
    orderRepository: Pick<OrderRepository, 'save'>;
    statusWriter: OrderStatusWriter;
    now?: () => number;
}

/**
 * Saves a winner's order, then marks it confirmed. Safe to retry at any step: the insert is
 * idempotent by order id, and marking confirmed twice changes nothing.
 */
export const createOrderProcessor =
    ({ orderRepository, statusWriter, now = Date.now }: Dependencies) =>
    async (job: Pick<Job<CreateOrderJob>, 'data'>): Promise<void> => {
        const outcome = await orderRepository.save(job.data);
        if (outcome === 'conflict') {
            // A second order for the same user: retrying can't fix it, so stop and keep the job for review.
            logger.error(
                { order_id: job.data.orderId, user_id: job.data.userId },
                'duplicate buyer rejected by MongoDB'
            );
            throw new UnrecoverableError('User already has a different order for this sale');
        }
        await statusWriter.markConfirmed(job.data.orderId, now());
    };
