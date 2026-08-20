import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

  test('저장된 단축키가 없으면 아홉 개 기본 명령을 모두 제공한다', () => {
    // 2026-08-20에 옆핀 칸별 열기 두 개가 늘어 7 → 9가 됐다.
    const normalized = normalizeShortcutSettings(undefined);

    expect(Object.keys(normalized.bindings)).toHaveLength(9);
    expect(normalized.bindings['sticker-picker:toggle']).toBeDefined();
    expect(normalized.bindings['sidePin:toggle']).toBeDefined();
    expect(normalized.bindings['sidePin:openWidget']).toBeDefined();
    expect(normalized.bindings['sidePin:openMemo']).toBeDefined();
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

describe('옆핀 칸별 단축키 기본값', () => {
  /** 기본값 정의가 두 벌이라(신규 설치용·기존 사용자 병합용) 한쪽만 넣으면 절반만 생긴다 */
  function defaultsFromSource(): string[] {
    const src = readFileSync(resolve(__dirname, 'useSettingsStore.ts'), 'utf-8');
    return [...src.matchAll(/'sidePin:openWidget':/g)].map(() => 'found');
  }

  test('기본값 정의 두 곳 모두에 들어 있다', () => {
    expect(defaultsFromSource()).toHaveLength(2);
  });

  test('화살표 위·아래가 기본 조합이다 — 손잡이의 위/아래 버튼과 같은 배치', () => {
    expect(DEFAULT_SHORTCUTS.bindings['sidePin:openWidget']?.combo).toBe('mod+alt+arrowup');
    expect(DEFAULT_SHORTCUTS.bindings['sidePin:openMemo']?.combo).toBe('mod+alt+arrowdown');
  });

  test('기존 사용자가 바꾼 조합은 병합 후에도 그대로다', () => {
    const merged = normalizeShortcutSettings({
      globalEnabled: true,
      bindings: { 'sidePin:toggle': { combo: 'mod+shift+p', enabled: true } },
      migratedAutoEnableV2: true,
    });

    expect(merged.bindings['sidePin:toggle']?.combo).toBe('mod+shift+p');
    expect(merged.bindings['sidePin:openWidget']?.combo).toBe('mod+alt+arrowup');
  });
});
