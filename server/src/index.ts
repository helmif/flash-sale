// API process. The composition root: the only place that knows every concrete class and wires them.
import { createApp } from './app';
import { SALE_ENV_VARS, env } from './config/env';
import { createRedis } from './config/redis';
import { FlashSaleRepository } from './modules/flash-sale/repositories/flash-sale.repository';
import { CreatePurchaseUsecase } from './modules/flash-sale/usecases/create-purchase.usecase';
import { GetFlashSaleDetailUsecase } from './modules/flash-sale/usecases/get-flash-sale-detail.usecase';
import { GetPurchaseDetailUsecase } from './modules/flash-sale/usecases/get-purchase-detail.usecase';
import { OrderQueue } from './modules/order/queues/order.queue';
import { logger } from './shared/logger';
import { onShutdown } from './shared/shutdown';

const main = async () => {
    const repository = new FlashSaleRepository(createRedis(env.redisUrl), env.saleId);
    const sale = await repository.initSale(env.sale);
    // First writer wins, so values set for an existing sale are ignored. Say so, loudly.
    const ignored = env.saleFieldsSet.filter((field) => env.sale[field] !== sale[field]).map((f) => SALE_ENV_VARS[f]);
    if (ignored.length > 0) {
        logger.warn(
            { sale_id: env.saleId, ignored },
            `sale "${env.saleId}" already exists, so ${ignored.join(', ')} were ignored; use a new SALE_ID for a new sale`
        );
    }
    const orders = new OrderQueue(createRedis(env.redisUrl), env.saleId);

    // Each usecase is created once and shared by every request (CreatePurchase keeps the sold-out flag).
    const { saleId } = env;
    const app = createApp({
        flashSale: {
            getFlashSaleDetail: new GetFlashSaleDetailUsecase({ saleId, sale, repository }),
            createPurchase: new CreatePurchaseUsecase({ saleId, sale, repository, orders }),
            getPurchaseDetail: new GetPurchaseDetailUsecase({ repository }),
        },
    });

    const server = app.listen(env.port, () => {
        logger.info(
            {
                port: env.port,
                sale_id: env.saleId,
                starts_at: new Date(sale.startsAt).toISOString(),
                ends_at: new Date(sale.endsAt).toISOString(),
                total_stock: sale.totalStock,
            },
            'api started'
        );
    });
    // Outlive the load balancer's idle timeout (nginx/ALB: 60s), otherwise it may reuse a
    // keep-alive socket Node has just closed and answer the client with a 502.
    server.keepAliveTimeout = 65_000;

    onShutdown(async () => {
        // Stop accepting connections and let in-flight requests finish, then release Redis.
        await new Promise<void>((resolve) => {
            server.close(() => resolve());
        });
        await Promise.allSettled([orders.close(), repository.close()]);
    });
};

main().catch((err) => {
    logger.fatal({ err }, 'api failed to start');
    process.exit(1);
});
