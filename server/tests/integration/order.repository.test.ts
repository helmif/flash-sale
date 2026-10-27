import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { OrderRepository } from '../../src/modules/order/repositories/order.repository';

// Needs a real MongoDB: the unique index is the guarantee under test.
const mongoUrl = process.env.MONGO_URL;
const describeWithMongo = mongoUrl ? describe : describe.skip;

describeWithMongo('OrderRepository (MongoDB)', () => {
    let client: MongoClient;
    let repository: OrderRepository;
    const saleId = `test-${randomUUID()}`;
    const job = (userId: string, orderId = randomUUID()) => ({ orderId, userId, saleId, reservedAt: Date.now() });

    beforeAll(async () => {
        client = await MongoClient.connect(mongoUrl!);
        repository = await OrderRepository.create(client.db());
    });

    afterAll(async () => {
        await client.db().collection('orders').deleteMany({ sale_id: saleId });
        await client.close();
    });

    it('saves an order once; saving the same order again is a no-op', async () => {
        const order = job('alice');
        expect(await repository.save(order)).toBe('created');
        expect(await repository.save(order)).toBe('exists');
        expect(await repository.countBySale(saleId)).toBe(1);
    });

    it('rejects a different order for a user who already has one', async () => {
        expect(await repository.save(job('bob'))).toBe('created');
        expect(await repository.save(job('bob'))).toBe('conflict');
        expect(await repository.countBySale(saleId)).toBe(2);
    });
});
