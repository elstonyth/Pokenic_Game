import { isPcImageUrl } from '../ingest-pc-image';

// The SSRF allowlist for the server-side PriceCharting image fetch: ONLY
// https URLs on PC's public GCS bucket may be fetched. Everything else —
// other hosts, other buckets on the same host, http, internal addresses,
// garbage — must be rejected.
describe('isPcImageUrl', () => {
  it('accepts a PriceCharting GCS image URL', () => {
    expect(
      isPcImageUrl(
        'https://storage.googleapis.com/images.pricecharting.com/7f5a73ae1b86028a880208648facf9697fe87fda82d1fffb73f58a959ff40257/240.jpg',
      ),
    ).toBe(true);
  });

  it.each([
    [
      'other host',
      'https://evil.example.com/images.pricecharting.com/x/240.jpg',
    ],
    [
      'other bucket, same host',
      'https://storage.googleapis.com/other-bucket/x/240.jpg',
    ],
    [
      'bucket as prefix trick',
      'https://storage.googleapis.com/images.pricecharting.com.evil/x/240.jpg',
    ],
    [
      'plain http',
      'http://storage.googleapis.com/images.pricecharting.com/x/240.jpg',
    ],
    ['internal address', 'https://169.254.169.254/latest/meta-data'],
    ['not a URL', 'not a url'],
    ['empty', ''],
  ])('rejects %s', (_label, url) => {
    expect(isPcImageUrl(url)).toBe(false);
  });
});
