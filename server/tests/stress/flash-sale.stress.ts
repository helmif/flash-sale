/**
 * Stress test. Many concurrent connections hammer POST /purchases with user ids drawn from a fixed
 * pool (so the same user retries many times). Then it checks the invariants that matter: no
 * oversell, one unit per user, nothing sold before the opening, every winner's order confirmed by
 * the worker, and exactly one MongoDB order per winner.
 *
 * Without TARGET it boots the built API and worker (dist/) against REDIS_URL and MONGO_URL with a
 * fresh sale that opens START_DELAY_MS after boot, so the load is already running at the opening,
 * like a real crowd waiting for the countdown. Pass `--target <url>` (or set TARGET) to hit a running
 * deployment instead, e.g. `npm run stress:docker`.
 */
import autocannon from 'autocannon';
import { MongoClient } from 'mongodb';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

/** `--name <value>` or `--name=<value>` from the command line, so no shell-specific env syntax is needed. */
const argument = (name: string): string | undefined => {
    const args = process.argv.slice(2);
    const index = args.findIndex((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`));
    if (index === -1) return undefined;
    return args[index].includes('=') ? args[index].split('=')[1] : args[index + 1];
};

const { env } = process;
const STOCK = Number(env.STOCK ?? 1_000);
const USERS = Number(env.USERS ?? 20_000);
const CONNECTIONS = Number(argument('connections') ?? env.CONNECTIONS ?? 500);
const DURATION = Number(env.DURATION ?? 15);
const START_DELAY_MS = Number(env.START_DELAY_MS ?? 8_000);
const MONGO_URL = env.MONGO_URL || 'mongodb://127.0.0.1:27018/flash_sale';
const API = '/api/v1/flash-sale';

interface Sale {
    sale_id: string;
    status: string;
    starts_at: string;
    remaining_stock: number;
}
type OrderLookup = { order: { status: string; reserved_at: string } | null };
type Ctx = { userId: string };

/** The problem's `code`, or undefined for non-JSON bodies such as a proxy's 502 page. */
const errorCode = (body: string): string | undefined => {
    try {
        return JSON.parse(body).code; // RFC 9457 problem extension member
    } catch {
        return undefined;
    }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const startProcesses = (port: number): ChildProcess[] => {
    const now = Date.now();
    const processEnv = {
        ...env,
        PORT: String(port),
        MONGO_URL,
        LOG_LEVEL: 'warn',
        SALE_ID: `stress-${now}`, // fresh keys and queue on every run
        SALE_START: new Date(now + START_DELAY_MS).toISOString(),
        SALE_END: new Date(now + 3_600_000).toISOString(),
        STOCK: String(STOCK),
    };
    return ['index.js', 'worker.js'].map((entry) =>
        spawn(process.execPath, [path.join(__dirname, '../../dist', entry)], {
            stdio: ['ignore', 'ignore', 'inherit'],
            env: processEnv,
        })
    );
};

const getData = async <T>(url: string): Promise<T> => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    return (await res.json()).data as T;
};

const waitForHealthy = async (target: string) => {
    for (let i = 0; i < 50; i++) {
        try {
            if ((await fetch(`${target}/health`)).ok) return;
        } catch {
            // not listening yet
        }
        await sleep(200);
    }
    throw new Error('API did not become healthy');
};

/** Each user's order, fetched 100 at a time so the check itself doesn't flood the API. */
const fetchOrders = async (target: string, userIds: string[]) => {
    const orders: Array<OrderLookup['order']> = [];
    for (let i = 0; i < userIds.length; i += 100) {
        const batch = await Promise.all(
            userIds.slice(i, i + 100).map((id) => getData<OrderLookup>(`${target}${API}/purchases/${id}`))
        );
        orders.push(...batch.map((lookup) => lookup.order));
    }
    return orders;
};

/**
 * Polls each winner's order until the worker has confirmed all of them, or the deadline passes.
 * Also reports the earliest reservation time, to prove nothing was sold before the opening.
 */
const waitForConfirmed = async (target: string, userIds: string[], timeoutMs = 60_000) => {
    const startedAt = Date.now();
    let pending = userIds;
    let earliestReservedAt = Infinity;
    while (pending.length > 0 && Date.now() - startedAt < timeoutMs) {
        const orders = await fetchOrders(target, pending);
        for (const order of orders) {
            if (order) earliestReservedAt = Math.min(earliestReservedAt, Date.parse(order.reserved_at));
        }
        pending = pending.filter((_, i) => orders[i]?.status !== 'confirmed');
        if (pending.length > 0) await sleep(250);
    }
    return { unconfirmed: pending.length, ms: Date.now() - startedAt, earliestReservedAt };
};

const main = async () => {
    let children: ChildProcess[] = [];
    let target = argument('target') ?? env.TARGET;
    if (!target) {
        const port = 3100;
        target = `http://localhost:${port}`;
        children = startProcesses(port);
        await waitForHealthy(target);
    }

    try {
        const before = await getData<Sale>(`${target}${API}`);
        if (before.status !== 'active' && before.status !== 'upcoming') {
            throw new Error(`Sale must be upcoming or active, got ${before.status}`);
        }
        const opensDuringRun = before.status === 'upcoming';
        const startsAt = Date.parse(before.starts_at);
        const opensInMs = startsAt - Date.now();
        // A sale that opens after the load ends would prove nothing, so say so instead of "failing".
        if (opensDuringRun && opensInMs > (DURATION - 3) * 1000) {
            throw new Error(
                `The sale opens in ${Math.ceil(opensInMs / 1000)}s, but this run lasts ${DURATION}s. ` +
                    'Use a sale that opens sooner (SALE_START) or a longer run (DURATION).'
            );
        }
        console.log(
            `Target ${target} | sale ${before.sale_id} | stock ${before.remaining_stock} | ${USERS} users | ` +
                `${CONNECTIONS} connections | ${DURATION}s` +
                (opensDuringRun ? ` | opens ${(opensInMs / 1000).toFixed(1)}s into the run` : '') +
                '\n'
        );

        const outcomes: Record<string, number> = {};
        const wins = new Map<string, number>();

        const result = await autocannon({
            url: target,
            connections: CONNECTIONS,
            duration: DURATION,
            requests: [
                {
                    method: 'POST',
                    path: `${API}/purchases`,
                    headers: { 'content-type': 'application/json' },
                    // autocannon keeps one context per connection and sends one request at a time on it,
                    // so the userId stored here is the one the response belongs to.
                    setupRequest: (req, context) => {
                        const userId = `user-${Math.floor(Math.random() * USERS)}`;
                        (context as Ctx).userId = userId;
                        return { ...req, body: JSON.stringify({ user_id: userId }) };
                    },
                    onResponse: (status, body, context) => {
                        const outcome = status === 202 ? 'RESERVED' : errorCode(body) ?? `HTTP_${status}`;
                        outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
                        const { userId } = context as Ctx;
                        if (status === 202) wins.set(userId, (wins.get(userId) ?? 0) + 1);
                    },
                },
            ],
        });

        const after = await getData<Sale>(`${target}${API}`);
        const reserved = outcomes.RESERVED ?? 0;
        const sold = before.remaining_stock - after.remaining_stock;
        const doubleWinners = [...wins.values()].filter((n) => n > 1).length;
        const serverErrors = Object.entries(outcomes)
            .filter(
                ([outcome]) =>
                    ['SERVICE_UNAVAILABLE', 'INTERNAL_ERROR'].includes(outcome) || outcome.startsWith('HTTP_5')
            )
            .reduce((sum, [, n]) => sum + n, 0);
        // autocannon's `errors` already includes `timeouts`.
        const failedRequests = serverErrors + result.errors;

        const pipeline = await waitForConfirmed(target, [...wins.keys()]);
        const mongo = await MongoClient.connect(MONGO_URL);
        const mongoOrders = await mongo.db().collection('orders').countDocuments({ sale_id: before.sale_id });
        await mongo.close();

        console.log('Throughput');
        console.table({
            'requests total': result.requests.total,
            'requests/sec (avg)': Math.round(result.requests.average),
            'latency p50 (ms)': result.latency.p50,
            'latency p99 (ms)': result.latency.p99,
            'latency max (ms)': result.latency.max,
            'socket errors': result.errors,
            timeouts: result.timeouts,
        });
        console.log('Responses by outcome');
        console.table(outcomes);
        console.log(`Worker confirmed all winners ${pipeline.ms} ms after the load ended\n`);

        const checks: Array<[string, boolean]> = [
            [
                `no oversell: ${reserved} reserved <= ${before.remaining_stock} stock`,
                reserved <= before.remaining_stock,
            ],
            [`stock never negative: ${after.remaining_stock} remaining`, after.remaining_stock >= 0],
            [`every 202 took exactly one unit: ${reserved} == ${sold}`, reserved === sold],
            [`one unit per user: ${doubleWinners} users won twice`, doubleWinners === 0],
            [`every winner confirmed by the worker: ${pipeline.unconfirmed} unconfirmed`, pipeline.unconfirmed === 0],
            [`MongoDB has one order per winner: ${mongoOrders} == ${reserved}`, mongoOrders === reserved],
            [`no failed requests (5xx, socket errors, timeouts): ${failedRequests}`, failedRequests === 0],
        ];
        const rejectedEarly = outcomes.SALE_NOT_STARTED ?? 0;
        if (opensDuringRun) {
            const firstReservation = Number.isFinite(pipeline.earliestReservedAt)
                ? `first reservation ${pipeline.earliestReservedAt - startsAt} ms after it`
                : 'no reservations';
            checks.push(
                [`requests before the opening were turned away: ${rejectedEarly} SALE_NOT_STARTED`, rejectedEarly > 0],
                [`nothing reserved before the opening: ${firstReservation}`, pipeline.earliestReservedAt >= startsAt]
            );
        }
        // Only attempts made while the sale was open could have bought anything.
        if (result.requests.total - rejectedEarly > before.remaining_stock * 2) {
            checks.push([
                `demand exceeded supply, so stock sold out: ${after.remaining_stock} left`,
                after.remaining_stock === 0,
            ]);
        }

        console.log('Invariants');
        for (const [label, ok] of checks) console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
        process.exitCode = checks.every(([, ok]) => ok) ? 0 : 1;
    } finally {
        children.forEach((child) => child.kill());
    }
};

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
