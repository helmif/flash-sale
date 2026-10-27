import { randomUUID } from 'node:crypto';
import { createRedis } from '../../src/config/redis';
import { FlashSaleRepository } from '../../src/modules/flash-sale/repositories/flash-sale.repository';

// Needs a real Redis: the atomicity under concurrency is exactly what these tests prove.
const redisUrl = process.env.REDIS_URL;
const describeWithRedis = redisUrl ? describe : describe.skip;

describeWithRedis('FlashSaleRepository (Redis)', () => {
    const opened: FlashSaleRepository[] = [];
    afterAll(() => Promise.all(opened.map((repository) => repository.close())));

    const createSale = async (totalStock: number) => {
        const repository = new FlashSaleRepository(createRedis(redisUrl!), `test-${randomUUID()}`);
        opened.push(repository);
        await repository.initSale({ startsAt: 0, endsAt: 1, totalStock });
        return repository;
    };
    const reserve = (repository: FlashSaleRepository, userId: string) =>
        repository.reserve({ userId, orderId: randomUUID(), at: 1 });

    it('never oversells when many distinct users race for limited stock', async () => {
        const repository = await createSale(50);
        const results = await Promise.all(Array.from({ length: 1_000 }, (_, i) => reserve(repository, `user-${i}`)));

        expect(results.filter((r) => r.outcome === 'reserved')).toHaveLength(50);
        expect(results.filter((r) => r.outcome === 'sold_out')).toHaveLength(950);
        expect(await repository.getRemainingStock()).toBe(0);
    });

    it('sells at most one unit when one user fires many concurrent requests', async () => {
        const repository = await createSale(10);
        const results = await Promise.all(Array.from({ length: 200 }, () => reserve(repository, 'greedy')));

        const winners = results.filter((r) => r.outcome === 'reserved');
        expect(winners).toHaveLength(1);
        // Every loser is pointed at the winning order, so retries can heal a lost enqueue.
        const winningOrderId = (winners[0] as { orderId: string }).orderId;
        expect(results.filter((r) => r.outcome === 'already_purchased' && r.orderId === winningOrderId)).toHaveLength(
            199
        );
        expect(await repository.getRemainingStock()).toBe(9);
    });

    it('answers already_purchased, not sold_out, to an existing buyer after sell-out', async () => {
        const repository = await createSale(1);
        await reserve(repository, 'alice');
        expect((await reserve(repository, 'alice')).outcome).toBe('already_purchased');
    });

    it('tracks the order from reserved to confirmed', async () => {
        const repository = await createSale(1);
        expect(await repository.findOrderByUser('alice')).toBeNull();

        await repository.reserve({ userId: 'alice', orderId: 'order-1', at: 1234 });
        expect(await repository.findOrderByUser('alice')).toEqual({
            orderId: 'order-1',
            userId: 'alice',
            status: 'reserved',
            reservedAt: 1234,
            confirmedAt: null,
        });

        await repository.markConfirmed('order-1', 5678);
        expect(await repository.findOrderByUser('alice')).toMatchObject({ status: 'confirmed', confirmedAt: 5678 });
    });

    it('refuses to start on a stored sale it cannot read, instead of running a broken sale', async () => {
        const saleId = `test-${randomUUID()}`;
        const client = createRedis(redisUrl!);
        const repository = new FlashSaleRepository(client, saleId);
        opened.push(repository);
        // A definition written by an older version, with different field names.
        await client.connect();
        await client.hset(`flashsale:{${saleId}}:meta`, 'startsAt', 1, 'endsAt', 2, 'totalStock', 3);

        await expect(repository.initSale({ startsAt: 0, endsAt: 1, totalStock: 5 })).rejects.toThrow(
            `Sale "${saleId}" already exists in Redis but its definition is unreadable`
        );
    });

    it('keeps the first definition on re-init, so a restart does not reset stock', async () => {
        const repository = await createSale(5);
        await reserve(repository, 'alice');

        const sale = await repository.initSale({ startsAt: 99, endsAt: 100, totalStock: 500 });

        expect(sale).toEqual({ startsAt: 0, endsAt: 1, totalStock: 5 });
        expect(await repository.getRemainingStock()).toBe(4);
    });
});

describe('FlashSaleRepository (Redis unreachable)', () => {
    it('fails fast with a client-safe SERVICE_UNAVAILABLE instead of hanging', async () => {
        const client = createRedis('redis://127.0.0.1:1');
        const repository = new FlashSaleRepository(client, 'unreachable');
        const startedAt = Date.now();
        try {
            await expect(repository.reserve({ userId: 'alice', orderId: 'o', at: 1 })).rejects.toMatchObject({
                code: 'SERVICE_UNAVAILABLE',
                message: 'The sale is busy right now, please retry',
            });
            expect(Date.now() - startedAt).toBeLessThan(1_000);
        } finally {
            client.disconnect(); // stop the background reconnect loop
        }
    });
});
