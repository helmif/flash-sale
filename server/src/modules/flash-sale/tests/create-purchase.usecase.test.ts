import { AppError } from '../../../shared/app-error';
import type { ReserveResult, SaleDefinition } from '../flash-sale.types';
import { CreatePurchaseUsecase } from '../usecases/create-purchase.usecase';

const NOW = Date.parse('2026-11-11T12:00:00.000Z');
const activeSale: SaleDefinition = { startsAt: NOW - 60_000, endsAt: NOW + 60_000, totalStock: 100 };
const won: ReserveResult = { outcome: 'reserved', orderId: 'order-1', reservedAt: NOW };

const setup = ({ sale = activeSale, reserve = won }: { sale?: SaleDefinition; reserve?: ReserveResult } = {}) => {
    const repository = { reserve: jest.fn().mockResolvedValue(reserve) };
    const orders = { enqueue: jest.fn().mockResolvedValue(undefined) };
    const usecase = new CreatePurchaseUsecase({ saleId: 'launch', sale, repository, orders, now: () => NOW });
    return { usecase, repository, orders };
};

const expectCode = (promise: Promise<unknown>, code: string) =>
    expect(promise).rejects.toEqual(expect.objectContaining({ name: 'AppError', code }));

describe('CreatePurchaseUsecase', () => {
    it('reserves a unit, enqueues the order and returns it as reserved', async () => {
        const { usecase, repository, orders } = setup();

        const order = await usecase.exec({ userId: 'alice' });

        expect(order).toEqual({
            order_id: 'order-1',
            user_id: 'alice',
            status: 'reserved',
            reserved_at: new Date(NOW).toISOString(),
        });
        expect(repository.reserve).toHaveBeenCalledWith({ userId: 'alice', orderId: expect.any(String), at: NOW });
        expect(orders.enqueue).toHaveBeenCalledWith({
            orderId: 'order-1',
            userId: 'alice',
            saleId: 'launch',
            reservedAt: NOW,
        });
    });

    it('rejects before the start without touching Redis', async () => {
        const { usecase, repository } = setup({ sale: { ...activeSale, startsAt: NOW + 1 } });
        await expectCode(usecase.exec({ userId: 'alice' }), 'SALE_NOT_STARTED');
        expect(repository.reserve).not.toHaveBeenCalled();
    });

    it('accepts a purchase exactly at the start time', async () => {
        const { usecase } = setup({ sale: { ...activeSale, startsAt: NOW } });
        await expect(usecase.exec({ userId: 'alice' })).resolves.toMatchObject({ status: 'reserved' });
    });

    it('rejects at the end time without touching Redis', async () => {
        const { usecase, repository } = setup({ sale: { ...activeSale, endsAt: NOW } });
        await expectCode(usecase.exec({ userId: 'alice' }), 'SALE_ENDED');
        expect(repository.reserve).not.toHaveBeenCalled();
    });

    it('rejects a second purchase and re-enqueues the original order, with its original time', async () => {
        const reservedEarlier = NOW - 5_000;
        const { usecase, orders } = setup({
            reserve: { outcome: 'already_purchased', orderId: 'order-0', reservedAt: reservedEarlier },
        });

        await expectCode(usecase.exec({ userId: 'alice' }), 'ALREADY_PURCHASED');

        // If the first attempt crashed before enqueueing, this job is the one that gets saved.
        expect(orders.enqueue).toHaveBeenCalledWith({
            orderId: 'order-0',
            userId: 'alice',
            saleId: 'launch',
            reservedAt: reservedEarlier,
        });
    });

    it('answers later attempts from the local sold-out flag once Redis reports sold out', async () => {
        const { usecase, repository, orders } = setup({ reserve: { outcome: 'sold_out' } });

        await expectCode(usecase.exec({ userId: 'alice' }), 'OUT_OF_STOCK');
        await expectCode(usecase.exec({ userId: 'bob' }), 'OUT_OF_STOCK');

        expect(repository.reserve).toHaveBeenCalledTimes(1);
        expect(orders.enqueue).not.toHaveBeenCalled();
    });

    it('propagates SERVICE_UNAVAILABLE when the queue is down after winning the gate', async () => {
        const { usecase, orders } = setup();
        orders.enqueue.mockRejectedValue(new AppError('SERVICE_UNAVAILABLE', 'busy'));
        await expectCode(usecase.exec({ userId: 'alice' }), 'SERVICE_UNAVAILABLE');
    });
});
