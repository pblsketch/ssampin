// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { shouldShowCommandHint } from './CommandPaletteHint';

describe('shouldShowCommandHint', () => {
  const base = { loaded: true, isFirstRun: false, hintDismissed: false, recentCount: 0 };

  it('온보딩 완료 + 미사용 + 미닫음 → 노출', () => {
    expect(shouldShowCommandHint(base)).toBe(true);
  });

  it('설정 로드 전이면 숨김', () => {
    expect(shouldShowCommandHint({ ...base, loaded: false })).toBe(false);
  });

  it('첫 실행(온보딩 진행 중)이면 숨김', () => {
    expect(shouldShowCommandHint({ ...base, isFirstRun: true })).toBe(false);
  });

  it('이미 안내를 닫았으면 숨김', () => {
    expect(shouldShowCommandHint({ ...base, hintDismissed: true })).toBe(false);
  });

  it('팔레트를 한 번이라도 썼으면(recentCount>0) 숨김', () => {
    expect(shouldShowCommandHint({ ...base, recentCount: 2 })).toBe(false);
  });
});
