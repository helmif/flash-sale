import { Queue, Worker } from 'bullmq';
import { MongoClient } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { createRedis, createWorkerRedis } from '../../src/config/redis';
import { FlashSaleRepository } from '../../src/modules/flash-sale/repositories/flash-sale.repository';
import { CreatePurchaseUsecase } from '../../src/modules/flash-sale/usecases/create-purchase.usecase';
import { createOrderProcessor } from '../../src/modules/order/processors/create-order.processor';
import { OrderQueue, orderQueueName } from '../../src/modules/order/queues/order.queue';
import { OrderRepository } from '../../src/modules/order/repositories/order.repository';

// The whole winner pipeline against real services: usecase → BullMQ → worker → MongoDB → Redis.
const { REDIS_URL: redisUrl, MONGO_URL: mongoUrl } = process.env;
const describeWithServices = redisUrl && mongoUrl ? describe : describe.skip;

const waitFor = async (check: () => Promise<boolean>, timeoutMs = 10_000) => {
    const deadline = Date.now() + timeoutMs;
    while (!(await check())) {
        if (Date.now() > deadline) throw new Error('condition not met in time');
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
};

describeWithServices('Order pipeline (Redis + BullMQ + MongoDB)', () => {
    const saleId = `worker-test-${randomUUID()}`;
    const workerConnection = createWorkerRedis(redisUrl ?? '');
    let mongo: MongoClient;
    let repository: FlashSaleRepository;
    let orders: OrderQueue;
    let worker: Worker;
    let createPurchase: CreatePurchaseUsecase;

    const confirmed = (userId: string) => async () =>
        (await repository.findOrderByUser(userId))?.status === 'confirmed';
    const savedOrder = (orderId: string) =>
        mongo
            .db()
            .collection('orders')
            .findOne({ _id: orderId as never });

    beforeAll(async () => {
        mongo = await MongoClient.connect(mongoUrl!);
        repository = new FlashSaleRepository(createRedis(redisUrl!), saleId);
        orders = new OrderQueue(createRedis(redisUrl!), saleId);
        const sale = await repository.initSale({ startsAt: 0, endsAt: Date.now() + 60_000, totalStock: 5 });
        createPurchase = new CreatePurchaseUsecase({ saleId, sale, repository, orders });

        const orderRepository = await OrderRepository.create(mongo.db());
        worker = new Worker(
            orderQueueName(saleId),
            createOrderProcessor({ orderRepository, statusWriter: repository }),
            { connection: workerConnection }
        );
    });

    afterAll(async () => {
        await worker.close();
        const inspectorConnection = createRedis(redisUrl!);
        const inspector = new Queue(orderQueueName(saleId), { connection: inspectorConnection });
        await inspector.obliterate({ force: true });
        await inspector.close();
        await inspectorConnection.quit(); // BullMQ leaves connections it was handed open
        await mongo.db().collection('orders').deleteMany({ sale_id: saleId });
        await Promise.allSettled([orders.close(), repository.close(), mongo.close()]);
        await workerConnection.quit();
    });

    it("saves a winner's order to MongoDB and marks it confirmed", async () => {
        const order = await createPurchase.exec({ userId: 'alice' });

        await waitFor(confirmed('alice'));

        expect(await savedOrder(order.order_id)).toMatchObject({
            sale_id: saleId,
            user_id: 'alice',
            status: 'confirmed',
            reserved_at: new Date(order.reserved_at),
        });
    });

    it('repairs a reservation whose enqueue was lost when the user retries, keeping the original time', async () => {
        // Simulate an API crash between winning the gate and enqueueing: reserve, never enqueue.
        const reservedAt = Date.now() - 5_000;
        await repository.reserve({ userId: 'bob', orderId: 'lost-order', at: reservedAt });
        expect(await savedOrder('lost-order')).toBeNull();

        // The client never got a response, so it retries.
        await expect(createPurchase.exec({ userId: 'bob' })).rejects.toMatchObject({ code: 'ALREADY_PURCHASED' });

        await waitFor(confirmed('bob'));
        expect(await savedOrder('lost-order')).toMatchObject({ user_id: 'bob', reserved_at: new Date(reservedAt) });
    });
});
