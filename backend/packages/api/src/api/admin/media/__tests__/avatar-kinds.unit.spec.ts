import { validateImage } from '../validate';

const base = {
  bytes: 1000,
  mimeType: 'image/png',
  detectedFormat: 'png',
  frames: 1,
};

describe("image kind 'avatar' (customer profile photo)", () => {
  it('accepts a square photo ≥ 64px', () => {
    expect(validateImage({ ...base, width: 512, height: 512 }, 'avatar')).toEqual(
      { ok: true },
    );
  });
  it('accepts a 3:4 portrait photo', () => {
    expect(validateImage({ ...base, width: 600, height: 800 }, 'avatar')).toEqual(
      { ok: true },
    );
  });
  it('rejects a wider-than-2:1 strip', () => {
    const v = validateImage({ ...base, width: 900, height: 300 }, 'avatar');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.code).toBe('bad_aspect');
  });
  it('rejects tiny images', () => {
    const v = validateImage({ ...base, width: 32, height: 32 }, 'avatar');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.code).toBe('too_small');
  });
});

describe("image kind 'avatar-frame' (admin milestone frame)", () => {
  it('accepts a square frame ≥ 256px', () => {
    expect(
      validateImage({ ...base, width: 512, height: 512 }, 'avatar-frame'),
    ).toEqual({ ok: true });
  });
  it('rejects a non-square frame', () => {
    const v = validateImage({ ...base, width: 512, height: 768 }, 'avatar-frame');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.code).toBe('bad_aspect');
  });
  it('rejects frames under 256px', () => {
    const v = validateImage({ ...base, width: 128, height: 128 }, 'avatar-frame');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.code).toBe('too_small');
  });
});
