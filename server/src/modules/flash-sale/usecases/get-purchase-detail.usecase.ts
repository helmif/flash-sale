import type { FlashSaleRepository } from '../repositories/flash-sale.repository';

interface Dependencies {
    repository: Pick<FlashSaleRepository, 'findOrderByUser'>;
}

/** Whether a user secured an item, and where their order is: reserved or confirmed. */
export class GetPurchaseDetailUsecase {
    constructor(private readonly deps: Dependencies) {}

    async exec({ userId }: { userId: string }) {
        const order = await this.deps.repository.findOrderByUser(userId);
        return {
            user_id: userId,
            purchased: order !== null,
            order: order && {
                order_id: order.orderId,
                user_id: order.userId,
                status: order.status,
                reserved_at: new Date(order.reservedAt).toISOString(),
                confirmed_at: order.confirmedAt ? new Date(order.confirmedAt).toISOString() : null,
            },
        };
    }
}
