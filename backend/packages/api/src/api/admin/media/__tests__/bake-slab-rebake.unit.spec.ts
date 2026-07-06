import type { MedusaContainer } from '@medusajs/framework/types';
import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils';
import sharp from 'sharp';
import { PACKS_MODULE } from '../../../../modules/packs';

// rebakeAllGradedCards drives the frame-swap trigger and the backfill
// script. This spec runs the REAL function (composeSlab/bakeSlabImage
// execute for real, via sharp) against a stubbed container; only the Medusa
// I/O boundary (core-flows workflows) is mocked. Separate from
// bake-slab.unit.spec.ts, which exercises composeSlab directly with real
// sharp and must NOT get a core-flows mock.
//
// Covers: the product-metadata mirror added for the "rebake/repull/delete
// leaves a stale mirror" finding, and the once-per-loop frame resolve added
// for the "mid-loop frame-fetch failure silently rebakes with the bundled
// default" finding.
jest.mock('@medusajs/medusa/core-flows', () => ({
  uploadFilesWorkflow: jest.fn(() => ({
    run: jest.fn().mockResolvedValue({
      result: [{ url: 'https://cdn.example/slab.webp', id: 'file_slab' }],
    }),
  })),
  deleteFilesWorkflow: jest.fn(() => ({ run: jest.fn().mockResolvedValue({}) })),
  updateProductsWorkflow: jest.fn(() => ({ run: jest.fn().mockResolvedValue({}) })),
}));

import {
  uploadFilesWorkflow,
  updateProductsWorkflow,
} from '@medusajs/medusa/core-flows';
import { rebakeAllGradedCards } from '../bake-slab';

type CardRow = {
  id: string;
  handle: string;
  grader: string;
  image: string;
  slab_image_key: string | null;
};

let TEST_PHOTO: Buffer;
let originalFetch: typeof global.fetch;

beforeAll(async () => {
  TEST_PHOTO = await sharp({
    create: {
      width: 12,
      height: 16,
      channels: 3,
      background: { r: 200, g: 40, b: 40 },
    },
  })
    .png()
    .toBuffer();
  originalFetch = global.fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

beforeEach(() => {
  jest.mocked(uploadFilesWorkflow).mockClear();
  jest.mocked(updateProductsWorkflow).mockClear();
  // Every fixture below has slab_frame_url: null, so resolveFrameBytes
  // returns the bundled default WITHOUT calling fetch — this mock only ever
  // serves the per-card photo fetch.
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: async () => TEST_PHOTO,
  }) as unknown as typeof fetch;
});

const buildContainer = (opts: {
  cards: CardRow[];
  products?: Array<{ id: string; handle: string; metadata: Record<string, unknown> }>;
  updateCards?: jest.Mock;
  siteSettings?: jest.Mock;
}) => {
  const products = opts.products ?? [];
  const listProducts = jest.fn(async (filter: { handle?: string } = {}) =>
    products.filter((p) => !filter.handle || p.handle === filter.handle),
  );
  const packs = {
    listCards: jest.fn().mockResolvedValue(opts.cards),
    updateCards: opts.updateCards ?? jest.fn().mockResolvedValue([]),
    siteSettings:
      opts.siteSettings ?? jest.fn().mockResolvedValue({ slab_frame_url: null }),
  };
  const modules: Record<string, unknown> = {
    [PACKS_MODULE]: packs,
    [Modules.PRODUCT]: { listProducts },
    [ContainerRegistrationKeys.LOGGER]: { warn: jest.fn(), info: jest.fn() },
  };
  const container = {
    resolve: (key: string) => {
      if (!(key in modules)) {
        throw new Error(`unit stub: unexpected container.resolve("${key}")`);
      }
      return modules[key];
    },
  } as unknown as MedusaContainer;
  return { container, packs, listProducts };
};

const uploadContentOf = (callIndex: number): string => {
  const value = jest.mocked(uploadFilesWorkflow).mock.results[callIndex]!.value as {
    run: jest.Mock;
  };
  return value.run.mock.calls[0][0].input.files[0].content;
};

describe('rebakeAllGradedCards', () => {
  const cardA: CardRow = {
    id: 'card_a',
    handle: 'card-a',
    grader: 'PSA',
    image: 'https://img.example/a.png',
    slab_image_key: 'old-a',
  };
  const cardB: CardRow = {
    id: 'card_b',
    handle: 'card-b',
    grader: 'CGC',
    image: 'https://img.example/a.png', // same bytes as A on purpose (see below)
    slab_image_key: 'old-b',
  };
  const ungraded: CardRow = {
    id: 'card_c',
    handle: 'card-c',
    grader: '',
    image: 'https://img.example/c.png',
    slab_image_key: null,
  };

  it('mirrors the new slab_image into product.metadata, merging (never the key)', async () => {
    const { container } = buildContainer({
      cards: [cardA],
      products: [{ id: 'prod_a', handle: 'card-a', metadata: { foo: 'bar' } }],
    });

    const result = await rebakeAllGradedCards(container);

    expect(result).toEqual({ ok: 1, failed: 0 });
    const run = jest.mocked(updateProductsWorkflow).mock.results.at(-1)!.value
      .run as jest.Mock;
    const { metadata } = run.mock.calls[0][0].input.products[0];
    expect(metadata).toMatchObject({
      foo: 'bar',
      slab_image: 'https://cdn.example/slab.webp',
    });
    expect(metadata).not.toHaveProperty('slab_image_key');
  });

  it('no product for the handle → mirror is a no-op, no throw', async () => {
    const { container } = buildContainer({ cards: [cardA], products: [] });

    await expect(rebakeAllGradedCards(container)).resolves.toEqual({
      ok: 1,
      failed: 0,
    });
    expect(updateProductsWorkflow).not.toHaveBeenCalled();
  });

  it('resolves the frame ONCE for N graded cards, and bakes them all with it', async () => {
    const siteSettings = jest.fn().mockResolvedValue({ slab_frame_url: null });
    const { container } = buildContainer({
      cards: [cardA, cardB, ungraded],
      siteSettings,
    });

    const result = await rebakeAllGradedCards(container);

    expect(result).toEqual({ ok: 2, failed: 0 });
    expect(siteSettings).toHaveBeenCalledTimes(1);
    // Same photo bytes + a single resolved frame ⇒ byte-identical composite:
    // proves both graded cards baked against the SAME frameBytes.
    expect(uploadContentOf(0)).toBe(uploadContentOf(1));
  });

  it('a per-card persist failure is isolated: failed++ and the loop continues', async () => {
    const updateCards = jest.fn(async (rows: Array<{ id: string }>) => {
      if (rows[0]!.id === cardA.id) throw new Error('db down');
      return rows;
    });
    const { container } = buildContainer({
      cards: [cardA, cardB],
      products: [{ id: 'prod_b', handle: 'card-b', metadata: {} }],
      updateCards,
    });

    const result = await rebakeAllGradedCards(container);

    expect(result).toEqual({ ok: 1, failed: 1 });
    // card-a's persist threw before the mirror step (never mirrored); card-b's
    // persist succeeded and the loop kept going (mirrored once).
    expect(updateProductsWorkflow).toHaveBeenCalledTimes(1);
  });
});
