import type { SaleDefinition } from '../flash-sale.types';
import { GetFlashSaleDetailUsecase } from '../usecases/get-flash-sale-detail.usecase';

const NOW = Date.parse('2026-11-11T12:00:00.000Z');
const activeSale: SaleDefinition = { startsAt: NOW - 60_000, endsAt: NOW + 60_000, totalStock: 100 };

const exec = (sale: SaleDefinition, remainingStock: number) => {
    const repository = { getRemainingStock: jest.fn().mockResolvedValue(remainingStock) };
    const usecase = new GetFlashSaleDetailUsecase({ saleId: 'launch', sale, repository, now: () => NOW });
    return usecase.exec();
};

describe('GetFlashSaleDetailUsecase', () => {
    it('returns the product, window, live stock and server time', async () => {
        await expect(exec(activeSale, 42)).resolves.toMatchObject({
            sale_id: 'launch',
            product: { name: 'Nova Pro Headphones', price: 499 },
            status: 'active',
            starts_at: new Date(activeSale.startsAt).toISOString(),
            ends_at: new Date(activeSale.endsAt).toISOString(),
            total_stock: 100,
            remaining_stock: 42,
            server_time: new Date(NOW).toISOString(),
        });
    });

    it.each([
        ['upcoming', { ...activeSale, startsAt: NOW + 1 }, 42],
        ['active', activeSale, 42],
        ['sold_out', activeSale, 0],
        ['ended', { ...activeSale, endsAt: NOW }, 0],
    ])('reports %s', async (status, sale, remaining) => {
        await expect(exec(sale, remaining)).resolves.toMatchObject({ status, remaining_stock: remaining });
    });
});
