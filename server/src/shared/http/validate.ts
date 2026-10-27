import type { z } from 'zod';
import { AppError } from '../app-error';

/** Parses untrusted input with a zod schema, returning the typed, normalised value. */
export const parse = <T extends z.ZodType>(schema: T, input: unknown): z.infer<T> => {
    const result = schema.safeParse(input);
    if (!result.success) {
        const errors = result.error.issues.map((issue) => ({
            field: issue.path.join('.') || 'body',
            message: issue.message,
        }));
        throw new AppError('VALIDATION_ERROR', 'The request is invalid.', errors);
    }
    return result.data;
};
