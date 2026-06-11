// Redis-store contract tests for the pack-open rate limiter: drives the REAL
// SLIDING_WINDOW_LUA on a live Redis and asserts exact parity with the pure
// JS twin (evaluateSlidingWindow via InMemorySlidingWindowStore). This is the
// enforcement of the "keep them in sync" contract in rate-limit.ts — without
// it, FailoverRateLimitStore would mask any Lua regression from the HTTP
// integration suite (the fallback produces identical policy decisions).
//
// Deliberately FAILS (no silent skip) when Redis is unreachable: pokenic-redis
// is part of this stack, and skipping would recreate the blind spot.
import Redis from "ioredis";
import {
  RedisSlidingWindowStore,
  InMemorySlidingWindowStore,
  type RateLimitRule,
  type RateLimitDecision,
} from "../../src/api/utils/rate-limit";

jest.setTimeout(30 * 1000);

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const T0 = 1_700_000_000_000;
const RUN = `test:rl-parity:${Date.now().toString(36)}`;

let client: Redis;
const usedKeys: string[] = [];

const key = (name: string): string => {
  const k = `${RUN}:${name}`;
  usedKeys.push(k);
  return k;
};

beforeAll(async () => {
  client = new Redis(REDIS_URL, {
    lazyConnect: true,
    connectTimeout: 2_000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
  client.on("error", () => {
    /* assertions surface failures; avoid unhandled 'error' events */
  });
  try {
    await client.connect();
  } catch (err) {
    throw new Error(
      `Redis unreachable at ${REDIS_URL} — this suite must run against real Redis ` +
        `(it guards the Lua/JS parity contract). Start it: docker start pokenic-redis. (${err})`
    );
  }
});

afterAll(async () => {
  if (client?.status === "ready" && usedKeys.length) await client.del(...usedKeys);
  client?.disconnect();
});

/**
 * Runs the same (offsetMs) consume sequence through the real Redis/Lua store
 * and the in-memory twin, asserting exact {allowed, retryAfterMs} parity at
 * every step. Returns the shared decisions.
 */
const runParity = async (
  k: string,
  rules: RateLimitRule[],
  offsetsMs: number[]
) => {
  const redisStore = new RedisSlidingWindowStore(client);
  const memStore = new InMemorySlidingWindowStore();
  const decisions: RateLimitDecision[] = [];
  for (const at of offsetsMs) {
    const fromRedis = await redisStore.consume(k, rules, T0 + at);
    const fromMemory = await memStore.consume(k, rules, T0 + at);
    expect({ at, ...fromRedis }).toEqual({ at, ...fromMemory });
    decisions.push(fromRedis);
  }
  return decisions;
};

describe("RedisSlidingWindowStore ↔ evaluateSlidingWindow parity (real Lua)", () => {
  const MINUTE = 60_000;

  it("computes the exact deny + Retry-After of the JS twin (single rule)", async () => {
    const k = key("single");
    const d = await runParity(k, [{ limit: 3, windowMs: MINUTE }], [
      0, 1_000, 2_000, 3_000,
    ]);
    expect(d.map((x) => x.allowed)).toEqual([true, true, true, false]);
    // Oldest event (T0+0) leaves the 60s window 57s after the denied attempt.
    expect(d[3].retryAfterMs).toBe(57_000);
  });

  it("records nothing on denial (all-or-nothing, asserted on the actual ZSET)", async () => {
    const k = key("all-or-nothing");
    await runParity(k, [{ limit: 3, windowMs: MINUTE }], [
      0, 1_000, 2_000, 3_000, 4_000, 5_000,
    ]);
    // 3 allowed + 3 denied → exactly 3 members; denied attempts added none.
    expect(await client.zcard(k)).toBe(3);
  });

  it("honours the strict window boundary exactly", async () => {
    const k = key("boundary");
    const d = await runParity(k, [{ limit: 1, windowMs: MINUTE }], [
      0,
      MINUTE - 1, // event at 0 still in window → denied, frees in 1ms
      MINUTE, // event at 0 exactly windowMs old → out → allowed
    ]);
    expect(d.map((x) => x.allowed)).toEqual([true, false, true]);
    expect(d[1].retryAfterMs).toBe(1);
  });

  it("multi-rule: denies on burst alone, then on both, with max retry-after", async () => {
    const k = key("multi");
    const burst = { limit: 2, windowMs: 10_000 };
    const sustained = { limit: 4, windowMs: MINUTE };
    const d = await runParity(k, [burst, sustained], [
      0, // allowed (1st)
      1_000, // allowed (2nd)
      2_000, // burst full → denied; slot frees at 0+10s → retry 8000
      12_000, // burst window empty again → allowed (3rd)
      13_000, // allowed (4th)
      13_500, // burst full (12s,13s) AND sustained full (4 events) → denied
    ]);
    expect(d.map((x) => x.allowed)).toEqual([
      true,
      true,
      false,
      true,
      true,
      false,
    ]);
    expect(d[2].retryAfterMs).toBe(8_000);
    // burst frees at 12_000+10_000-13_500 = 8_500; sustained frees when the
    // T0+0 event exits the 60s window: 60_000-13_500 = 46_500 → max wins.
    expect(d[5].retryAfterMs).toBe(46_500);
  });

  it("keeps independent keys independent in Redis", async () => {
    const rules = [{ limit: 1, windowMs: MINUTE }];
    const a = key("indep-a");
    const b = key("indep-b");
    const redisStore = new RedisSlidingWindowStore(client);
    expect((await redisStore.consume(a, rules, T0)).allowed).toBe(true);
    expect((await redisStore.consume(a, rules, T0 + 1)).allowed).toBe(false);
    expect((await redisStore.consume(b, rules, T0 + 2)).allowed).toBe(true);
  });

  it("sets a TTL so abandoned keys expire", async () => {
    const k = key("ttl");
    const redisStore = new RedisSlidingWindowStore(client);
    await redisStore.consume(k, [{ limit: 5, windowMs: 30_000 }], T0);
    const pttl = await client.pttl(k);
    expect(pttl).toBeGreaterThan(0);
    expect(pttl).toBeLessThanOrEqual(30_000);
  });
});
