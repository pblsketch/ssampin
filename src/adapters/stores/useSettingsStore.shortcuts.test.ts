import { describe, expect, test } from 'vitest';
import { DEFAULT_SHORTCUTS, normalizeShortcutSettings } from './useSettingsStore';

describe('normalizeShortcutSettings', () => {
  test('기존 사용자 설정에 새 옆핀 단축키를 자동으로 보강한다', () => {
    const normalized = normalizeShortcutSettings({
      globalEnabled: false,
      migratedAutoEnableV2: true,
      bindings: {
        'quickAdd.todo': { combo: 'mod+shift+t', enabled: false },
      },
    });

    expect(normalized.globalEnabled).toBe(false);
    expect(normalized.bindings['quickAdd.todo']).toEqual({
      combo: 'mod+shift+t',
      enabled: false,
    });
    expect(normalized.bindings['sidePin:toggle']).toEqual(
      DEFAULT_SHORTCUTS.bindings['sidePin:toggle'],
    );
  });

  test('저장된 단축키가 없으면 일곱 개 기본 명령을 모두 제공한다', () => {
    const normalized = normalizeShortcutSettings(undefined);

    expect(Object.keys(normalized.bindings)).toHaveLength(7);
    expect(normalized.bindings['sticker-picker:toggle']).toBeDefined();
    expect(normalized.bindings['sidePin:toggle']).toBeDefined();
  });

  test('이전 자동 활성화 마이그레이션 규칙을 유지한다', () => {
    const normalized = normalizeShortcutSettings({
      globalEnabled: false,
      bindings: {},
    });

    expect(normalized.globalEnabled).toBe(true);
    expect(normalized.migratedAutoEnableV2).toBe(true);
  });
});
