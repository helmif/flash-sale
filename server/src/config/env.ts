import path from 'node:path';

// Read the repo-root .env (the same file docker compose reads) when running outside Docker.
// Variables already set in the environment win over the file; no file means defaults.
try {
    process.loadEnvFile(path.resolve(__dirname, '../../../.env'));
} catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
}

/** Which environment variable sets each field of the sale definition. */
export const SALE_ENV_VARS = { startsAt: 'SALE_START', endsAt: 'SALE_END', totalStock: 'STOCK' } as const;
type SaleField = keyof typeof SALE_ENV_VARS;

const UNIT_MS = { s: 1_000, m: 60_000, h: 3_600_000 } as const;

/** "30s", "5m", "2h" → milliseconds; null when the value isn't a relative duration. */
const parseDuration = (value: string): number | null => {
    const match = /^(\d+)([smh])$/.exec(value.trim());
    return match ? Number(match[1]) * UNIT_MS[match[2] as keyof typeof UNIT_MS] : null;
};

/** A relative duration from `base` ("30s"), or an absolute ISO-8601 time. */
const parseMoment = (name: string, value: string, base: number): number => {
    const duration = parseDuration(value);
    if (duration !== null) return base + duration;
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) {
        throw new Error(`${name} must be a duration like 30s / 5m / 2h, or an ISO-8601 time; got "${value}"`);
    }
    return ms;
};

// Empty counts as unset (docker compose passes unset variables through as "").
const read = (name: string) => process.env[name] || undefined;

const buildSale = (now: number) => {
    // SALE_START is relative to when the sale is first created; SALE_END is relative to the start.
    const startsAt = parseMoment('SALE_START', read('SALE_START') ?? '15s', now);
    const endsAt = parseMoment('SALE_END', read('SALE_END') ?? '30m', startsAt);
    const totalStock = Number(read('STOCK') ?? 100);

    if (endsAt <= startsAt) throw new Error('SALE_END must be after SALE_START');
    if (!Number.isInteger(totalStock) || totalStock < 0) throw new Error('STOCK must be a non-negative integer');

    return { startsAt, endsAt, totalStock };
};

/**
 * Sale fields set to a fixed value, so startup can warn when an existing sale ignores them.
 * Relative times are left out: they resolve differently on every boot, so they'd always "differ".
 */
const fixedSaleFields = (): SaleField[] =>
    (Object.keys(SALE_ENV_VARS) as SaleField[]).filter((field) => {
        const value = read(SALE_ENV_VARS[field]);
        return value !== undefined && (field === 'totalStock' || parseDuration(value) === null);
    });

export const env = {
    port: Number(read('PORT') ?? 3000),
    // 127.0.0.1 rather than localhost: on some machines localhost tries IPv6 first and stalls.
    redisUrl: read('REDIS_URL') ?? 'redis://127.0.0.1:6379',
    mongoUrl: read('MONGO_URL') ?? 'mongodb://127.0.0.1:27018/flash_sale',
    saleId: read('SALE_ID') ?? 'launch',
    sale: buildSale(Date.now()),
    saleFieldsSet: fixedSaleFields(),
};
