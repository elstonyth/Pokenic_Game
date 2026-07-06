import { validateAvatarFrames, FRAME_LEVELS } from '../avatar-frames';

describe('validateAvatarFrames', () => {
  it('exposes the 10 milestone levels', () => {
    expect([...FRAME_LEVELS]).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });

  it('accepts milestone keys with path or http(s) URLs', () => {
    expect(
      validateAvatarFrames({
        frames: { '10': '/static/f10.webp', '100': 'https://cdn.example/f100.webp' },
      }),
    ).toEqual({ '10': '/static/f10.webp', '100': 'https://cdn.example/f100.webp' });
  });

  it('skips null values (cleared levels)', () => {
    expect(validateAvatarFrames({ frames: { '10': null, '20': '/f.webp' } })).toEqual({
      '20': '/f.webp',
    });
  });

  it('rejects non-milestone keys', () => {
    expect(() => validateAvatarFrames({ frames: { '15': '/f.webp' } })).toThrow(
      /not a milestone level/,
    );
  });

  it('rejects protocol-relative and junk URLs', () => {
    expect(() => validateAvatarFrames({ frames: { '10': '//evil.example/f' } })).toThrow();
    expect(() => validateAvatarFrames({ frames: { '10': 'javascript:alert(1)' } })).toThrow();
    expect(() => validateAvatarFrames({ frames: { '10': '' } })).toThrow();
  });

  it('rejects a missing/non-object frames body', () => {
    expect(() => validateAvatarFrames({})).toThrow(/frames must be an object/);
    expect(() => validateAvatarFrames({ frames: ['x'] })).toThrow(/frames must be an object/);
  });
});
