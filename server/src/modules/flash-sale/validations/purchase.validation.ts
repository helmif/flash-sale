import { z } from 'zod';

// Trim + lowercase so "Alice@Mail.com " and "alice@mail.com" are one buyer.
const userId = z.string().trim().toLowerCase().min(1, 'is required').max(100);

/** POST /purchases body */
export const createPurchaseSchema = z.object({ user_id: userId });

/** GET /purchases/:user_id params */
export const getPurchaseDetailSchema = z.object({ user_id: userId });
