import express from 'express';
import {
    createFlashSaleController,
    type FlashSaleUsecases,
} from './modules/flash-sale/controllers/flash-sale.controller';
import { createFlashSaleRoutes } from './modules/flash-sale/flash-sale.routes';
import { errorHandler, notFoundHandler } from './shared/http/error-handler';

export const createApp = ({ flashSale }: { flashSale: FlashSaleUsecases }) => {
    const app = express();
    app.disable('x-powered-by');
    app.disable('etag'); // responses change constantly during a sale; hashing them is wasted CPU
    app.use(express.json({ limit: '1kb' }));

    app.get('/health', (_req, res) => {
        res.json({ data: { ok: true } });
    });
    app.use('/api/v1/flash-sale', createFlashSaleRoutes(createFlashSaleController(flashSale)));

    app.use(notFoundHandler);
    app.use(errorHandler);
    return app;
};
