import { Queue } from 'bullmq';
import type { Express } from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../../src/app';
import { createRedis } from '../../src/config/redis';
import { FlashSaleRepository } from '../../src/modules/flash-sale/repositories/flash-sale.repository';
import { CreatePurchaseUsecase } from '../../src/modules/flash-sale/usecases/create-purchase.usecase';
import { GetFlashSaleDetailUsecase } from '../../src/modules/flash-sale/usecases/get-flash-sale-detail.usecase';
import { GetPurchaseDetailUsecase } from '../../src/modules/flash-sale/usecases/get-purchase-detail.usecase';
import { OrderQueue, orderQueueName } from '../../src/modules/order/queues/order.queue';

// End to end through Express, the usecases, Redis and the BullMQ queue (no worker running).
const redisUrl = process.env.REDIS_URL;
const describeWithRedis = redisUrl ? describe : describe.skip;

describeWithRedis('Flash sale API', () => {
    const saleId = `api-test-${randomUUID()}`;
    let app: Express;
    let repository: FlashSaleRepository;
    let orders: OrderQueue;
    let inspector: Queue;
    const inspectorConnection = createRedis(redisUrl ?? 'redis://127.0.0.1:6379');

    beforeAll(async () => {
        repository = new FlashSaleRepository(createRedis(redisUrl!), saleId);
        orders = new OrderQueue(createRedis(redisUrl!), saleId);
        inspector = new Queue(orderQueueName(saleId), { connection: inspectorConnection });
        const now = Date.now();
        const sale = await repository.initSale({ startsAt: now - 60_000, endsAt: now + 60_000, totalStock: 1 });
        app = createApp({
            flashSale: {
                getFlashSaleDetail: new GetFlashSaleDetailUsecase({ saleId, sale, repository }),
                createPurchase: new CreatePurchaseUsecase({ saleId, sale, repository, orders }),
                getPurchaseDetail: new GetPurchaseDetailUsecase({ repository }),
            },
        });
    });

    afterAll(async () => {
        await inspector.obliterate({ force: true });
        await Promise.all([inspector.close(), orders.close(), repository.close()]);
        await inspectorConnection.quit();
    });

    const buy = (body: object) => request(app).post('/api/v1/flash-sale/purchases').send(body);

    it('GET /api/v1/flash-sale returns the product and live status', async () => {
        const res = await request(app).get('/api/v1/flash-sale');

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({
            sale_id: saleId,
            product: { name: 'Nova Pro Headphones' },
            status: 'active',
            total_stock: 1,
            remaining_stock: 1,
        });
    });

    it('walks 202 reserved → 409 ALREADY_PURCHASED → 409 OUT_OF_STOCK, enqueueing only the winner', async () => {
        const won = await buy({ user_id: ' Alice@Example.com' });
        expect(won.status).toBe(202);
        expect(won.body.data).toMatchObject({ user_id: 'alice@example.com', status: 'reserved' });
        const orderId = won.body.data.order_id;

        const again = await buy({ user_id: 'alice@example.com' });
        expect(again.status).toBe(409);
        expect(again.body.code).toBe('ALREADY_PURCHASED');

        const late = await buy({ user_id: 'bob' });
        expect(late.status).toBe(409);
        // RFC 9457 Problem Details, with `code` as an extension member.
        expect(late.headers['content-type']).toMatch(/^application\/problem\+json/);
        expect(late.body).toEqual({
            type: 'urn:problem-type:flash-sale:out-of-stock',
            title: 'Out of stock',
            status: 409,
            detail: 'Sorry, this item is sold out.',
            code: 'OUT_OF_STOCK',
        });

        // The retry re-enqueued the same job id, so there is still exactly one job.
        expect(await inspector.getJob(orderId)).toBeDefined();
        expect(await inspector.count()).toBe(1);
    });

    it('GET /purchases/:user_id returns the order with its status', async () => {
        const winner = await request(app).get('/api/v1/flash-sale/purchases/ALICE@example.com');
        expect(winner.body.data).toMatchObject({
            user_id: 'alice@example.com',
            purchased: true,
            order: { status: 'reserved' },
        });

        const loser = await request(app).get('/api/v1/flash-sale/purchases/bob');
        expect(loser.body.data).toEqual({ user_id: 'bob', purchased: false, order: null });
    });

    it.each([[{}], [{ user_id: '   ' }], [{ user_id: 42 }], [{ user_id: 'x'.repeat(101) }]])(
        'rejects body %j with 400 VALIDATION_ERROR',
        async (body) => {
            const res = await buy(body);
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('VALIDATION_ERROR');
        }
    );

    it('lists the failing fields in `errors` for a validation problem', async () => {
        const res = await buy({ user_id: '   ' });
        expect(res.body).toMatchObject({
            status: 400,
            code: 'VALIDATION_ERROR',
            errors: [{ field: 'user_id', message: 'is required' }],
        });
    });

    it('rejects malformed JSON with 400', async () => {
        const res = await request(app)
            .post('/api/v1/flash-sale/purchases')
            .set('content-type', 'application/json')
            .send('{"user_id":');
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 NOT_FOUND for an unknown route', async () => {
        const res = await request(app).get('/api/v1/nope');
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('NOT_FOUND');
    });
});
