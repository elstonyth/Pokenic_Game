import { describe, it, expect, beforeEach } from 'vitest';
import { buildCsp } from '../csp';

describe('buildCsp', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL = 'http://localhost:9000';
    delete process.env.NEXT_PUBLIC_MEDIA_HOST;
  });

  it('pins scripts to the nonce with strict-dynamic', () => {
    const csp = buildCsp('abc123');
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
  });

  it('allows the backend origin in connect-src and img-src', () => {
    const csp = buildCsp('n');
    expect(csp).toContain('http://localhost:9000');
    expect(csp).toMatch(/connect-src[^;]*http:\/\/localhost:9000/);
    expect(csp).toMatch(/img-src[^;]*http:\/\/localhost:9000/);
  });

  it('includes the media CDN host when set', () => {
    process.env.NEXT_PUBLIC_MEDIA_HOST = 'cdn.example.com';
    const csp = buildCsp('n');
    expect(csp).toContain('https://cdn.example.com');
  });

  it('forbids framing and inline object/base hijacking', () => {
    const csp = buildCsp('n');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });
});
