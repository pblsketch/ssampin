/**
 * 앱을 켤 때의 모습 판정 규칙.
 *
 * 이 규칙이 갈리면 **설정 화면과 실제 뜨는 창이 서로 다른 말을 한다**. 그래서 판정을
 * 도메인에 한 벌만 두고(`resolveStartupMode`), electron 쪽 미러는
 * `electron/startupMode.mirror.test.ts` 가 목록 일치를 강제한다.
 */
import { describe, expect, it } from 'vitest';
import { resolveStartupMode, WINDOW_STARTUP_MODES } from './Settings';

describe('resolveStartupMode', () => {
  it('정식 값은 그대로 쓴다', () => {
    for (const mode of WINDOW_STARTUP_MODES) {
      expect(resolveStartupMode({ startupMode: mode })).toBe(mode);
    }
  });

  it('예전 설정 파일(startupMode 없음) 은 transparent 로 승계한다 — 위젯으로 시작하던 사람은 그대로', () => {
    expect(resolveStartupMode({ transparent: true })).toBe('widget');
  });

  it('예전 설정 파일에서 transparent 가 꺼져 있으면 전체 화면', () => {
    expect(resolveStartupMode({ transparent: false })).toBe('main');
  });

  it('설정 자체가 없으면 전체 화면 (새 설치·읽기 실패)', () => {
    expect(resolveStartupMode(undefined)).toBe('main');
    expect(resolveStartupMode(null)).toBe('main');
    expect(resolveStartupMode({})).toBe('main');
  });

  it('모르는 값은 전체 화면으로 떨어진다 — 다만 legacy 가 켜져 있으면 그쪽을 존중한다', () => {
    expect(resolveStartupMode({ startupMode: 'icon' })).toBe('main');
    expect(resolveStartupMode({ startupMode: 'icon', transparent: true })).toBe('widget');
  });

  it('새 값이 있으면 legacy 보다 우선한다 — 옆핀을 골랐는데 위젯으로 뜨면 안 된다', () => {
    expect(resolveStartupMode({ startupMode: 'sidePin', transparent: true })).toBe('sidePin');
    expect(resolveStartupMode({ startupMode: 'main', transparent: true })).toBe('main');
  });
});
