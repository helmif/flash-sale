import type { Order } from '../flash-sale.types';
import { GetPurchaseDetailUsecase } from '../usecases/get-purchase-detail.usecase';

const NOW = Date.parse('2026-11-11T12:00:00.000Z');

const exec = (userId: string, order: Order | null) => {
    const repository = { findOrderByUser: jest.fn().mockResolvedValue(order) };
    const usecase = new GetPurchaseDetailUsecase({ repository });
    return usecase.exec({ userId });
};

describe('GetPurchaseDetailUsecase', () => {
    it('returns the order and its status for a buyer', async () => {
        const order: Order = {
            orderId: 'order-1',
            userId: 'alice',
            status: 'confirmed',
            reservedAt: NOW,
            confirmedAt: NOW + 50,
        };

        await expect(exec('alice', order)).resolves.toEqual({
            user_id: 'alice',
            purchased: true,
            order: {
                order_id: 'order-1',
                user_id: 'alice',
                status: 'confirmed',
                reserved_at: new Date(NOW).toISOString(),
                confirmed_at: new Date(NOW + 50).toISOString(),
            },
        });
    });

    it('reports no purchase for a user without an order', async () => {
        await expect(exec('bob', null)).resolves.toEqual({ user_id: 'bob', purchased: false, order: null });
    });
});
