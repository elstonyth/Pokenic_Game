import type { NextConfig } from 'next';

// next/image refuses remote hosts unless allowlisted. Card/product art is
// served by the Medusa backend (POST /admin/media stores it; see
// medusa-config.ts). The origin depends on the backend's file provider:
//   - local provider → <NEXT_PUBLIC_MEDUSA_BACKEND_URL>/static/...  (dev AND
//     self-hosted prod). Deriving the pattern from that env var means it is
//     correct per-environment automatically — localhost:9000 in dev, the real
//     backend host in prod — with no separate dev/prod gating.
//   - S3/R2 provider → a dedicated media host; set NEXT_PUBLIC_MEDIA_HOST to it.
// Local /public paths (/cdn, /images, /home, ...) are localPatterns and need no
// entry. Patterns are scoped to /static/** so the optimizer can't be pointed at
// arbitrary paths on these hosts.
const backendUrl =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? 'http://localhost:9000';

let backend: URL;
try {
  backend = new URL(backendUrl);
} catch {
  // Fail loudly with guidance rather than letting `new URL` throw an opaque
  // TypeError that crashes the whole build.
  throw new Error(
    `NEXT_PUBLIC_MEDUSA_BACKEND_URL is not a valid URL: "${backendUrl}" — expected e.g. http://localhost:9000`,
  );
}
const protocol = backend.protocol.replace(':', '');
if (protocol !== 'http' && protocol !== 'https') {
  // Catches the schemeless case (e.g. "localhost:9000" parses with a bogus
  // "localhost:" protocol) before it silently produces a dead pattern.
  throw new Error(
    `NEXT_PUBLIC_MEDUSA_BACKEND_URL must start with http:// or https:// (got "${backendUrl}")`,
  );
}

const remotePatterns: NonNullable<
  NonNullable<NextConfig['images']>['remotePatterns']
> = [
  {
    protocol,
    hostname: backend.hostname,
    port: backend.port || undefined,
    pathname: '/static/**',
  },
];

// Optional dedicated S3/R2/CDN media host (prod). It is the bucket's own public
// host, so the whole host is media — scope to its served prefix if you use one.
const mediaHost = process.env.NEXT_PUBLIC_MEDIA_HOST;
if (mediaHost) {
  remotePatterns.push({
    protocol: 'https',
    hostname: mediaHost,
    pathname: '/**',
  });
}

const nextConfig: NextConfig = {
  images: { remotePatterns },
};

export default nextConfig;
