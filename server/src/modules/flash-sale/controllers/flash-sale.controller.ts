import type { Request, Response } from 'express';
import { parse } from '../../../shared/http/validate';
import type { CreatePurchaseUsecase } from '../usecases/create-purchase.usecase';
import type { GetFlashSaleDetailUsecase } from '../usecases/get-flash-sale-detail.usecase';
import type { GetPurchaseDetailUsecase } from '../usecases/get-purchase-detail.usecase';
import { createPurchaseSchema, getPurchaseDetailSchema } from '../validations/purchase.validation';

export interface FlashSaleUsecases {
    getFlashSaleDetail: GetFlashSaleDetailUsecase;
    createPurchase: CreatePurchaseUsecase;
    getPurchaseDetail: GetPurchaseDetailUsecase;
}

/**
 * HTTP in, HTTP out: validate input, call the usecase, write `{ data }`.
 * Errors propagate to the error handler, which writes RFC 9457 Problem Details.
 */
export const createFlashSaleController = (usecases: FlashSaleUsecases) => ({
    getDetail: async (_req: Request, res: Response) => {
        res.json({ data: await usecases.getFlashSaleDetail.exec() });
    },

    createPurchase: async (req: Request, res: Response) => {
        const { user_id } = parse(createPurchaseSchema, req.body);
        // 202: the unit is reserved now; the order is saved asynchronously.
        res.status(202).json({ data: await usecases.createPurchase.exec({ userId: user_id }) });
    },

    getPurchaseDetail: async (req: Request, res: Response) => {
        const { user_id } = parse(getPurchaseDetailSchema, req.params);
        res.json({ data: await usecases.getPurchaseDetail.exec({ userId: user_id }) });
    },
});

export type FlashSaleController = ReturnType<typeof createFlashSaleController>;
