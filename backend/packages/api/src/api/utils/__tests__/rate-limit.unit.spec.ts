import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import {
  evaluateSlidingWindow,
  InMemorySlidingWindowStore,
  FailoverRateLimitStore,
  createRateLimitMiddleware,
  positiveIntFromEnv,
  type RateLimitRule,
  type RateLimitStore,
} from "../rate-limit";

const MINUTE = 60_000;
const T0 = 1_700_000_000_000; // fixed epoch-ms base so tests are deterministic

describe("evaluateSlidingWindow", () => {
  const rule = (limit: number, windowMs: number): RateLimitRule => ({
    limit,
    windowMs,
  });

  it("allows when there is no history", () => {
    const d = evaluateSlidingWindow([], T0, [rule(3, MINUTE)]);
    expect(d.allowed).toBe(true);
    expect(d.retryAfterMs).toBe(0);
  });

  it("allows while the window holds fewer events than the limit", () => {
    const d = evaluateSlidingWindow([T0 - 10, T0 - 5], T0, [rule(3, MINUTE)]);
    expect(d.allowed).toBe(true);
  });

  it("denies once the window is full and reports when the oldest event expires", () => {
    const ts = [T0 - 30_000, T0 - 20_000, T0 - 10_000];
    const d = evaluateSlidingWindow(ts, T0, [rule(3, MINUTE)]);
    expect(d.allowed).toBe(false);
    // Oldest in-window event (T0 - 30s) leaves the 60s window 30s from now.
    expect(d.retryAfterMs).toBe(30_000);
  });

  it("ignores events that have aged out of the window (strict boundary)", () => {
    // An event exactly windowMs old is OUT of the window.
    const ts = [T0 - MINUTE, T0 - MINUTE + 1, T0 - 10];
    const d = evaluateSlidingWindow(ts, T0, [rule(3, MINUTE)]);
    expect(d.allowed).toBe(true);
  });

  it("denies when any one of several rules is violated", () => {
    const burst = rule(2, 10_000);
    const sustained = rule(10, MINUTE);
    const ts = [T0 - 2_000, T0 - 1_000];
    const d = evaluateSlidingWindow(ts, T0, [burst, sustained]);
    expect(d.allowed).toBe(false);
    // Burst slot frees when T0-2s ages out of the 10s window.
    expect(d.retryAfterMs).toBe(8_000);
  });

  it("reports the longest wait when multiple rules are violated", () => {
    const burst = rule(1, 10_000);
    const sustained = rule(2, MINUTE);
    const ts = [T0 - 40_000, T0 - 1_000];
    const d = evaluateSlidingWindow(ts, T0, [burst, sustained]);
    expect(d.allowed).toBe(false);
    // burst frees in 9s; sustained frees when T0-40s exits the 60s window (20s).
    expect(d.retryAfterMs).toBe(20_000);
  });

  it("handles an unsorted history", () => {
    const ts = [T0 - 10_000, T0 - 30_000, T0 - 20_000];
    const d = evaluateSlidingWindow(ts, T0, [rule(3, MINUTE)]);
    expect(d.allowed).toBe(false);
    expect(d.retryAfterMs).toBe(30_000);
  });
});

describe("InMemorySlidingWindowStore", () => {
  const rules: RateLimitRule[] = [{ limit: 3, windowMs: MINUTE }];

  it("allows up to the limit then denies", async () => {
    const store = new InMemorySlidingWindowStore();
    for (let i = 0; i < 3; i++) {
      const d = await store.consume("k", rules, T0 + i);
      expect(d.allowed).toBe(true);
    }
    const denied = await store.consume("k", rules, T0 + 3);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
  });

  it("does not record denied attempts (all-or-nothing consumption)", async () => {
    const store = new InMemorySlidingWindowStore();
    await store.consume("k", rules, T0);
    await store.consume("k", rules, T0 + 1);
    await store.consume("k", rules, T0 + 2);
    // Hammer denied attempts; they must not extend the lockout.
    for (let i = 0; i < 5; i++) {
      const d = await store.consume("k", rules, T0 + 10 + i);
      expect(d.allowed).toBe(false);
    }
    // Just after the first event ages out, a slot must be free again.
    const d = await store.consume("k", rules, T0 + MINUTE + 1);
    expect(d.allowed).toBe(true);
  });

  it("tracks keys independently", async () => {
    const store = new InMemorySlidingWindowStore();
    for (let i = 0; i < 3; i++) await store.consume("a", rules, T0 + i);
    expect((await store.consume("a", rules, T0 + 5)).allowed).toBe(false);
    expect((await store.consume("b", rules, T0 + 5)).allowed).toBe(true);
  });

  it("evicts oldest keys beyond maxKeys instead of growing unbounded", async () => {
    const store = new InMemorySlidingWindowStore({ maxKeys: 2 });
    await store.consume("a", rules, T0);
    await store.consume("b", rules, T0 + 1);
    await store.consume("c", rules, T0 + 2); // evicts "a"
    // "a" was forgotten, so it gets a fresh window.
    for (let i = 0; i < 3; i++) {
      expect((await store.consume("a", rules, T0 + 10 + i)).allowed).toBe(true);
    }
  });
});

describe("FailoverRateLimitStore", () => {
  const rules: RateLimitRule[] = [{ limit: 1, windowMs: MINUTE }];
  const allowed = { allowed: true, retryAfterMs: 0 };

  it("uses the primary store when it works", async () => {
    const primary: RateLimitStore = {
      consume: jest.fn().mockResolvedValue(allowed),
    };
    const fallback: RateLimitStore = { consume: jest.fn() };
    const store = new FailoverRateLimitStore(primary, fallback);
    const d = await store.consume("k", rules, T0);
    expect(d.allowed).toBe(true);
    expect(primary.consume).toHaveBeenCalledTimes(1);
    expect(fallback.consume).not.toHaveBeenCalled();
  });

  it("falls back and reports the error when the primary throws", async () => {
    const boom = new Error("redis down");
    const primary: RateLimitStore = {
      consume: jest.fn().mockRejectedValue(boom),
    };
    const fallback: RateLimitStore = {
      consume: jest.fn().mockResolvedValue(allowed),
    };
    const onError = jest.fn();
    const store = new FailoverRateLimitStore(primary, fallback, onError);
    const d = await store.consume("k", rules, T0);
    expect(d.allowed).toBe(true);
    expect(fallback.consume).toHaveBeenCalledWith("k", rules, T0);
    expect(onError).toHaveBeenCalledWith(boom);
  });
});

describe("createRateLimitMiddleware", () => {
  const rules: RateLimitRule[] = [{ limit: 5, windowMs: MINUTE }];

  type FakeRes = {
    statusCode: number | undefined;
    headers: Record<string, string>;
    body: unknown;
  };

  const makeRes = (): { res: MedusaResponse; out: FakeRes } => {
    const out: FakeRes = { statusCode: undefined, headers: {}, body: undefined };
    const res = {
      status(code: number) {
        out.statusCode = code;
        return res;
      },
      set(name: string, value: string) {
        out.headers[name.toLowerCase()] = value;
        return res;
      },
      json(payload: unknown) {
        out.body = payload;
        return res;
      },
    };
    return { res: res as unknown as MedusaResponse, out };
  };

  const makeReq = (over: Record<string, unknown> = {}): MedusaRequest =>
    ({ ip: "10.0.0.1", ...over }) as unknown as MedusaRequest;

  const authedReq = (actorId: string): MedusaRequest =>
    makeReq({
      auth_context: { actor_id: actorId, actor_type: "customer" },
    });

  it("calls next() and writes nothing when allowed", async () => {
    const store: RateLimitStore = {
      consume: jest.fn().mockResolvedValue({ allowed: true, retryAfterMs: 0 }),
    };
    const mw = createRateLimitMiddleware({ store, rules, prefix: "rl:t:" });
    const next = jest.fn() as unknown as MedusaNextFunction;
    const { res, out } = makeRes();

    await mw(authedReq("cus_1"), res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(out.statusCode).toBeUndefined();
  });

  it("keys on auth_context.actor_id with the configured prefix", async () => {
    const store: RateLimitStore = {
      consume: jest.fn().mockResolvedValue({ allowed: true, retryAfterMs: 0 }),
    };
    const mw = createRateLimitMiddleware({ store, rules, prefix: "rl:t:" });
    await mw(authedReq("cus_42"), makeRes().res, jest.fn() as unknown as MedusaNextFunction);
    expect(store.consume).toHaveBeenCalledWith(
      "rl:t:cus_42",
      rules,
      expect.any(Number)
    );
  });

  it("falls back to the request IP when there is no auth context", async () => {
    const store: RateLimitStore = {
      consume: jest.fn().mockResolvedValue({ allowed: true, retryAfterMs: 0 }),
    };
    const mw = createRateLimitMiddleware({ store, rules, prefix: "rl:t:" });
    await mw(makeReq(), makeRes().res, jest.fn() as unknown as MedusaNextFunction);
    expect(store.consume).toHaveBeenCalledWith(
      "rl:t:ip:10.0.0.1",
      rules,
      expect.any(Number)
    );
  });

  it("responds 429 with a ceiled Retry-After and does not call next() when denied", async () => {
    const store: RateLimitStore = {
      consume: jest
        .fn()
        .mockResolvedValue({ allowed: false, retryAfterMs: 1_200 }),
    };
    const mw = createRateLimitMiddleware({ store, rules, prefix: "rl:t:" });
    const next = jest.fn() as unknown as MedusaNextFunction;
    const { res, out } = makeRes();

    await mw(authedReq("cus_1"), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(out.statusCode).toBe(429);
    expect(out.headers["retry-after"]).toBe("2"); // ceil(1200ms) = 2s
    expect(out.body).toMatchObject({ type: "rate_limit_exceeded" });
  });

  it("never sends Retry-After below 1 second", async () => {
    const store: RateLimitStore = {
      consume: jest.fn().mockResolvedValue({ allowed: false, retryAfterMs: 1 }),
    };
    const mw = createRateLimitMiddleware({ store, rules, prefix: "rl:t:" });
    const { res, out } = makeRes();
    await mw(authedReq("cus_1"), res, jest.fn() as unknown as MedusaNextFunction);
    expect(out.headers["retry-after"]).toBe("1");
  });

  it("rejects non-positive or fractional-to-zero rules at creation (boot-time failure)", () => {
    const store: RateLimitStore = {
      consume: jest.fn().mockResolvedValue({ allowed: true, retryAfterMs: 0 }),
    };
    for (const bad of [
      [{ limit: 0, windowMs: 1000 }],
      [{ limit: 5, windowMs: 0 }],
      [{ limit: -1, windowMs: 1000 }],
      [{ limit: 2.5, windowMs: 1000 }],
    ] as RateLimitRule[][]) {
      expect(() =>
        createRateLimitMiddleware({ store, rules: bad, prefix: "rl:t:" })
      ).toThrow(/positive integers/);
    }
  });

  it("fails open (next()) and reports the error if the store itself throws", async () => {
    const boom = new Error("store exploded");
    const store: RateLimitStore = {
      consume: jest.fn().mockRejectedValue(boom),
    };
    const onError = jest.fn();
    const mw = createRateLimitMiddleware({
      store,
      rules,
      prefix: "rl:t:",
      onError,
    });
    const next = jest.fn() as unknown as MedusaNextFunction;
    const { res, out } = makeRes();

    await mw(authedReq("cus_1"), res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(out.statusCode).toBeUndefined();
    expect(onError).toHaveBeenCalledWith(boom);
  });
});

describe("positiveIntFromEnv", () => {
  const NAME = "RL_TEST_ENV_VALUE";
  afterEach(() => {
    delete process.env[NAME];
  });

  const cases: Array<[string | undefined, number]> = [
    [undefined, 42], // unset → fallback
    ["", 42], // empty → fallback
    ["60", 60], // plain integer
    ["60.9", 60], // floors fractional part
    ["0.5", 42], // (0,1) floors to 0 → MUST fall back, not disable the rule
    ["1e-3", 42], // scientific notation in (0,1)
    ["0", 42],
    ["-5", 42],
    ["abc", 42],
    ["1e20", 42], // beyond safe integer range
  ];

  it.each(cases)("parses %p as %p (fallback 42)", (raw, expected) => {
    if (raw === undefined) delete process.env[NAME];
    else process.env[NAME] = raw;
    expect(positiveIntFromEnv(NAME, 42)).toBe(expected);
  });
});
