import type { ErrorRequestHandler, RequestHandler, Response } from 'express';
import { AppError, type ErrorCode } from '../app-error';
import { logger } from '../logger';

/** The one place error codes become HTTP statuses and titles. */
const PROBLEMS: Record<ErrorCode, { status: number; title: string }> = {
    VALIDATION_ERROR: { status: 400, title: 'Invalid request' },
    NOT_FOUND: { status: 404, title: 'Not found' },
    SALE_NOT_STARTED: { status: 403, title: 'Sale not started' },
    SALE_ENDED: { status: 403, title: 'Sale ended' },
    ALREADY_PURCHASED: { status: 409, title: 'Already purchased' },
    OUT_OF_STOCK: { status: 409, title: 'Out of stock' },
    SERVICE_UNAVAILABLE: { status: 503, title: 'Service unavailable' },
    INTERNAL_ERROR: { status: 500, title: 'Internal error' },
};

/**
 * Writes an RFC 9457 Problem Details response. `type` identifies the problem; `code` and, for
 * validation, `errors` are extension members so clients can branch without parsing URIs.
 */
const sendProblem = (res: Response, error: AppError) => {
    const { status, title } = PROBLEMS[error.code];
    res.status(status)
        .type('application/problem+json')
        .json({
            type: `urn:problem-type:flash-sale:${error.code.toLowerCase().replace(/_/g, '-')}`,
            title,
            status,
            detail: error.message,
            code: error.code,
            ...(error.errors && { errors: error.errors }),
        });
};

export const notFoundHandler: RequestHandler = (req, res) => {
    sendProblem(res, new AppError('NOT_FOUND', `No route for ${req.method} ${req.path}`));
};

/**
 * Express 5 forwards rejected promises from async handlers here, so controllers need no try/catch.
 * Expected errors (sold out, already purchased, ...) are the normal outcome for most flash-sale
 * traffic, so only unexpected ones are logged.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof AppError) {
        sendProblem(res, err);
        return;
    }
    // Raised by express.json() for malformed JSON or an oversized body.
    if (typeof err?.status === 'number' && err.status >= 400 && err.status < 500) {
        sendProblem(res, new AppError('VALIDATION_ERROR', 'The request body could not be read.'));
        return;
    }
    logger.error({ err }, 'unhandled error');
    sendProblem(res, new AppError('INTERNAL_ERROR', 'Something went wrong.'));
};
