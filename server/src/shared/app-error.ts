export type ErrorCode =
    | 'VALIDATION_ERROR'
    | 'NOT_FOUND'
    | 'SALE_NOT_STARTED'
    | 'SALE_ENDED'
    | 'ALREADY_PURCHASED'
    | 'OUT_OF_STOCK'
    | 'SERVICE_UNAVAILABLE'
    | 'INTERNAL_ERROR';

export interface FieldError {
    field: string;
    message: string;
}

/**
 * An expected failure whose code and message are safe to show the client.
 * It carries no HTTP status: the HTTP layer decides that (see http/error-handler.ts),
 * so business code stays transport-agnostic.
 */
export class AppError extends Error {
    constructor(
        readonly code: ErrorCode,
        message: string,
        /** Per-field details, for validation failures. */
        readonly errors?: FieldError[]
    ) {
        super(message);
        this.name = 'AppError';
    }
}
