/**
 * 학생 빠른 기록 단축키 — 등록 회귀.
 *
 * ★막으려는 것 1: 기본 조합이 다른 명령과 겹치는 것. 겹치면 설정 화면이 중복으로 표시하고
 *   둘 중 하나는 동작하지 않는다.
 * ★막으려는 것 2: 두 기본 표(`DEFAULT_SETTINGS.shortcuts` 와 `DEFAULT_SHORTCUTS`)가 어긋나는 것.
 *   실제로 한쪽에만 넣어 같은 키를 두 번 적는 사고가 있었다.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SHORTCUTS, normalizeShortcutSettings } from './useSettingsStore';

describe('학생 빠른 기록 단축키', () => {
  it('기본 단축키 표에 들어 있고 켜져 있다', () => {
    expect(DEFAULT_SHORTCUTS.bindings['quickAdd.studentRecord']).toEqual({
      combo: 'mod+alt+r',
      enabled: true,
    });
  });

  it('기본 조합이 다른 명령과 겹치지 않는다', () => {
    const combos = Object.values(DEFAULT_SHORTCUTS.bindings).map((b) => b.combo);
    expect(new Set(combos).size).toBe(combos.length);
  });

  it('사용자가 바꾼 조합은 보존하면서 새 명령만 보강한다', () => {
    const saved = normalizeShortcutSettings({
      globalEnabled: true,
      bindings: { 'quickAdd.todo': { combo: 'mod+shift+t', enabled: false } },
      migratedAutoEnableV2: true,
    });
    expect(saved.bindings['quickAdd.todo']).toEqual({ combo: 'mod+shift+t', enabled: false });
    expect(saved.bindings['quickAdd.studentRecord']?.combo).toBe('mod+alt+r');
  });

  it('사용자가 끈 학생 기록 단축키는 다시 켜지지 않는다', () => {
    const saved = normalizeShortcutSettings({
      globalEnabled: true,
      bindings: { 'quickAdd.studentRecord': { combo: 'mod+alt+r', enabled: false } },
      migratedAutoEnableV2: true,
    });
    expect(saved.bindings['quickAdd.studentRecord']?.enabled).toBe(false);
  });
});
