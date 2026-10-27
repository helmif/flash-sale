import { Redis } from 'ioredis';
import { logger } from '../shared/logger';

/**
 * Without an 'error' listener ioredis prints raw stack traces on every reconnect attempt.
 * Log one structured line instead. ioredis keeps reconnecting on its own, backing off from 50ms
 * to one attempt every 2s, so a long outage settles at one line per client every 2s.
 */
const logConnectionErrors = (client: Redis): Redis =>
    client.on('error', (err) => logger.warn({ err: err.message }, 'redis connection error'));

/**
 * For request-path calls: fail fast instead of queueing while Redis is unreachable, so the API
 * answers 503 and the client retries, rather than requests piling up in memory.
 */
export const createRedis = (url: string): Redis =>
    logConnectionErrors(
        new Redis(url, {
            lazyConnect: true,
            enableOfflineQueue: false,
            maxRetriesPerRequest: 1,
            commandTimeout: 1_000,
        })
    );

/** For the BullMQ worker, which blocks on Redis and must retry forever (BullMQ requires this). */
export const createWorkerRedis = (url: string): Redis =>
    logConnectionErrors(new Redis(url, { maxRetriesPerRequest: null }));
