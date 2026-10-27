// Worker process. Saves winners' orders to MongoDB at a pace the database can handle.
// The composition root for the worker side.
import { Worker } from 'bullmq';
import { MongoClient } from 'mongodb';
import { env } from './config/env';
import { createRedis, createWorkerRedis } from './config/redis';
import { FlashSaleRepository } from './modules/flash-sale/repositories/flash-sale.repository';
import { createOrderProcessor } from './modules/order/processors/create-order.processor';
import { orderQueueName } from './modules/order/queues/order.queue';
import { OrderRepository } from './modules/order/repositories/order.repository';
import { logger } from './shared/logger';
import { onShutdown } from './shared/shutdown';

const main = async () => {
    const mongo = await MongoClient.connect(env.mongoUrl);
    const orderRepository = await OrderRepository.create(mongo.db());
    // The sale's Redis state is where order status lives, so it receives "confirmed".
    const statusWriter = new FlashSaleRepository(createRedis(env.redisUrl), env.saleId);

    const worker = new Worker(orderQueueName(env.saleId), createOrderProcessor({ orderRepository, statusWriter }), {
        connection: createWorkerRedis(env.redisUrl),
        concurrency: 20,
    });
    worker.on('failed', (job, err) => {
        logger.error({ err, order_id: job?.id, attempts: job?.attemptsMade }, 'order job failed');
    });
    logger.info({ queue: orderQueueName(env.saleId) }, 'worker started');

    onShutdown(async () => {
        // Finish in-flight jobs; unfinished ones stay in the queue for the next worker.
        await worker.close();
        await Promise.allSettled([statusWriter.close(), mongo.close()]);
    });
};

main().catch((err) => {
    logger.fatal({ err }, 'worker failed to start');
    process.exit(1);
});
