import { ModulesSdkUtils } from '@medusajs/framework/utils';
import {
  DEFAULT_DB_POOL_MAX,
  productionDatabaseDriverOptions,
  resolveDbPoolMax,
} from '../db-driver-options';

describe('resolveDbPoolMax', () => {
  it('falls back to the default when DB_POOL_MAX is unset', () => {
    expect(resolveDbPoolMax({})).toBe(DEFAULT_DB_POOL_MAX);
  });

  // The failure this test exists for: a DO env var declared with an empty value
  // parses to 0, and `max: 0` hangs every acquire for 60s — a full outage on the
  // deploy that adds the cap. Never let this become Number(env.DB_POOL_MAX ?? 5).
  it.each([
    ['blank', ''],
    ['whitespace', '   '],
    ['non-numeric', 'abc'],
    ['zero', '0'],
    ['negative', '-4'],
  ])('rejects a %s DB_POOL_MAX rather than capping the pool at 0', (_l, v) => {
    expect(resolveDbPoolMax({ DB_POOL_MAX: v })).toBeGreaterThan(0);
  });

  it('honours a usable override', () => {
    expect(resolveDbPoolMax({ DB_POOL_MAX: '3' })).toBe(3);
  });
});

describe('productionDatabaseDriverOptions', () => {
  it('caps the pool and keeps TLS relaxed for DO’s self-signed CA', () => {
    expect(productionDatabaseDriverOptions({})).toEqual({
      connection: { ssl: { rejectUnauthorized: false } },
      pool: { min: 0, max: DEFAULT_DB_POOL_MAX },
      idle_in_transaction_session_timeout: 30_000,
    });
  });

  // Shape regression: `pool` and `idle_in_transaction_session_timeout` are read
  // off the TOP level of driverOptions by pg-connection-loader /
  // create-pg-connection. Nesting either inside `connection` type-checks and
  // silently does nothing, so assert against the real resolution path rather
  // than against our own object.
  it('resolves through Medusa’s loader to a capped knex pool', () => {
    const driverOptions: Record<string, unknown> = {
      ...productionDatabaseDriverOptions({ DB_POOL_MAX: '4' }),
    };
    // pg-connection-loader.js:23-28 — lifts `pool` out, then forwards the rest.
    const pool = driverOptions.pool as { min: number; max: number };
    delete driverOptions.pool;

    const knex = ModulesSdkUtils.createPgConnection({
      clientUrl: 'postgres://u:p@127.0.0.1:5432/none',
      schema: 'public',
      driverOptions,
      pool: { min: pool.min, max: pool.max },
    }) as unknown as {
      client: {
        pool: { min: number; max: number };
        config: { connection: Record<string, unknown> };
      };
      destroy: () => Promise<void>;
    };

    try {
      expect(knex.client.pool.max).toBe(4);
      expect(knex.client.pool.min).toBe(0);
      expect(
        knex.client.config.connection.idle_in_transaction_session_timeout,
      ).toBe(30_000);
    } finally {
      void knex.destroy();
    }
  });
});
