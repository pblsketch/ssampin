import { describe, expect, it, vi } from 'vitest';

describe('FEATURE_FLAGS', () => {
  it('inlineAutosave는 기본 활성화된다', async () => {
    vi.unstubAllEnvs();
    vi.resetModules();

    const { FEATURE_FLAGS } = await import('./featureFlags');

    expect(FEATURE_FLAGS.inlineAutosave).toBe(true);
  });

  it('VITE_FEATURE_INLINE_AUTOSAVE=false이면 inlineAutosave를 끈다', async () => {
    vi.stubEnv('VITE_FEATURE_INLINE_AUTOSAVE', 'false');
    vi.resetModules();

    const { FEATURE_FLAGS } = await import('./featureFlags');

    expect(FEATURE_FLAGS.inlineAutosave).toBe(false);

    vi.unstubAllEnvs();
  });
});
