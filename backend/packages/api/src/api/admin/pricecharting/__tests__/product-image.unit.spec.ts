import { extractPcImageUrl, resolvePcImageUrl } from '../product-image';

// Pull the card photo out of a PriceCharting offers-page body and normalize its
// size to /240.jpg (the size the ingest step's 240→1600 bump expects). The real
// page carries the product photo first, then marketplace-listing thumbnails —
// first-match must be the product photo, and any pixel size must normalize.
describe('extractPcImageUrl', () => {
  const IMG = (hash: string, size: string) =>
    `https://storage.googleapis.com/images.pricecharting.com/${hash}/${size}.jpg`;

  it('extracts the photo and normalizes the size to 240', () => {
    const html = `<div><img src="${IMG('hpgpcpsd42huitud', '120')}"></div>`;
    expect(extractPcImageUrl(html)).toBe(IMG('hpgpcpsd42huitud', '240'));
  });

  it('leaves an already-240 URL unchanged', () => {
    const html = `<img src="${IMG('abc123', '240')}">`;
    expect(extractPcImageUrl(html)).toBe(IMG('abc123', '240'));
  });

  it('normalizes a 1600 URL down to the 240 hand-off size', () => {
    const html = `<img src="${IMG('abc123', '1600')}">`;
    expect(extractPcImageUrl(html)).toBe(IMG('abc123', '240'));
  });

  it('returns the FIRST (product) photo, not a later listing thumbnail', () => {
    const html = `
      <img id="product-photo" src="${IMG('mainhash', '120')}">
      <div class="offers"><img src="${IMG('listinghash', '120')}"></div>`;
    expect(extractPcImageUrl(html)).toBe(IMG('mainhash', '240'));
  });

  it('handles a hex-style content hash', () => {
    const hash = '7f5a73ae1b86028a880208648facf9697fe87fda82d1fffb73f58a959ff40257';
    const html = `<img src="${IMG(hash, '120')}">`;
    expect(extractPcImageUrl(html)).toBe(IMG(hash, '240'));
  });

  it.each([
    ['no image on the page', '<div>no photo here</div>'],
    ['empty body', ''],
    [
      'a different googleapis bucket',
      '<img src="https://storage.googleapis.com/other-bucket/x/240.jpg">',
    ],
  ])('returns null for %s', (_label, html) => {
    expect(extractPcImageUrl(html)).toBeNull();
  });
});

// resolvePcImageUrl wraps extractPcImageUrl with an id guard, an HTTP fetch,
// and graceful failure. fetch is mocked so no network is hit.
describe('resolvePcImageUrl', () => {
  const IMG = 'https://storage.googleapis.com/images.pricecharting.com/abc/120.jpg';
  const NORMALIZED =
    'https://storage.googleapis.com/images.pricecharting.com/abc/240.jpg';
  const mockFetch = (impl: () => Promise<unknown>) =>
    jest.spyOn(global, 'fetch').mockImplementation(impl as typeof fetch);

  afterEach(() => jest.restoreAllMocks());

  it('fetches the offers page and returns the normalized photo', async () => {
    const spy = mockFetch(async () => ({
      ok: true,
      text: async () => `<img src="${IMG}">`,
    }));
    await expect(resolvePcImageUrl('630417')).resolves.toBe(NORMALIZED);
    // The scraped id must land in the offers URL, not anywhere else.
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('/offers?product=630417'),
      expect.anything(),
    );
  });

  it.each([
    ['non-numeric id', 'abc'],
    ['empty id', ''],
    ['id with path injection', '630417/../../etc'],
  ])('returns null without fetching for %s', async (_label, id) => {
    const spy = mockFetch(async () => {
      throw new Error('should not fetch');
    });
    await expect(resolvePcImageUrl(id)).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns null on a non-ok response', async () => {
    mockFetch(async () => ({ ok: false, text: async () => '' }));
    await expect(resolvePcImageUrl('630417')).resolves.toBeNull();
  });

  it('returns null when the fetch throws (timeout/network)', async () => {
    mockFetch(async () => {
      throw new Error('aborted');
    });
    await expect(resolvePcImageUrl('630417')).resolves.toBeNull();
  });

  it('returns null when the page has no matching image', async () => {
    mockFetch(async () => ({ ok: true, text: async () => '<div>no photo</div>' }));
    await expect(resolvePcImageUrl('630417')).resolves.toBeNull();
  });
});
