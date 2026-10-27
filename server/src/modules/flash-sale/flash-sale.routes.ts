import { Router } from 'express';
import type { FlashSaleController } from './controllers/flash-sale.controller';

export const createFlashSaleRoutes = (controller: FlashSaleController) =>
    Router()
        .get('/', controller.getDetail)
        .post('/purchases', controller.createPurchase)
        .get('/purchases/:user_id', controller.getPurchaseDetail);
