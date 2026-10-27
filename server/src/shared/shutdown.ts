import { logger } from './logger';

const DEADLINE_MS = 10_000;

/**
 * Runs `close` once on SIGINT or SIGTERM, then exits. The deadline stops a stuck dependency from
 * keeping the process alive forever (the orchestrator would kill it anyway, without logs).
 */
export const onShutdown = (close: () => Promise<void>) => {
    const handle = async (signal: NodeJS.Signals) => {
        logger.info({ signal }, 'shutting down');
        setTimeout(() => {
            logger.error({ deadline_ms: DEADLINE_MS }, 'shutdown deadline exceeded');
            process.exit(1);
        }, DEADLINE_MS).unref();

        try {
            await close();
            process.exit(0);
        } catch (err) {
            logger.error({ err }, 'shutdown failed');
            process.exit(1);
        }
    };
    process.once('SIGINT', handle);
    process.once('SIGTERM', handle);
};
