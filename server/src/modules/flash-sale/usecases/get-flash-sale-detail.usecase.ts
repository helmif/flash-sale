import { getPhase } from '../flash-sale.rules';
import type { SaleDefinition, SaleStatus } from '../flash-sale.types';
import type { FlashSaleRepository } from '../repositories/flash-sale.repository';

/** The single product on sale. Display data only; stock and timing live in the sale definition. */
const PRODUCT = {
    name: 'Nova Pro Headphones',
    tagline: 'Immersive sound. A calmer you.',
    price: 499,
    currency: 'USD',
    image_url: '/images/nova-pro-headphones.webp',
} as const;

interface Dependencies {
    saleId: string;
    sale: SaleDefinition;
    repository: Pick<FlashSaleRepository, 'getRemainingStock'>;
    now?: () => number;
}

/** Product, sale window and live stock. */
export class GetFlashSaleDetailUsecase {
    constructor(private readonly deps: Dependencies) {}

    async exec() {
        const { saleId, sale, repository, now = Date.now } = this.deps;
        const at = now();
        const phase = getPhase(sale, at);
        const remainingStock = await repository.getRemainingStock();

        return {
            sale_id: saleId,
            product: PRODUCT,
            status: (phase === 'active' && remainingStock === 0 ? 'sold_out' : phase) as SaleStatus,
            starts_at: new Date(sale.startsAt).toISOString(),
            ends_at: new Date(sale.endsAt).toISOString(),
            total_stock: sale.totalStock,
            remaining_stock: remainingStock,
            // Lets clients correct their countdown for a wrong local clock.
            server_time: new Date(at).toISOString(),
        };
    }
}
