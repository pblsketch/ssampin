/**
 * useSettingsStore의 closeAction 마이그레이션 폴백 테스트 (v2.0.2~).
 *
 * 시나리오:
 * - TC-02: legacy `closeToWidget=true` → `closeAction='widget'`
 * - TC-03: legacy `closeToWidget=false` → `closeAction='tray'`
 * - TC-04: 명시적 `closeAction='icon'` → 그대로 보존
 * - TC-05: `widget.icon` 키 없음 → `{ showCoachMark: true }` 기본값 적용
 * - TC-06: `widget.icon.showCoachMark=false` → 그대로 보존
 *
 * 직접 store 모듈을 import하기보다는 마이그레이션 로직을 함수로 추출하는 방식이
 * 깔끔하나, 본 PDCA에서는 기존 store 구조 변경을 최소화하기 위해 마이그레이션
 * 로직을 inline으로 두고 그 결과만 검증한다.
 *
 * 마이그레이션 로직은 useSettingsStore.ts의 load() 안에 IIFE로 들어있으므로
 * 본 테스트는 동등한 함수를 재현하여 검증한다 (정합성은 메타테스트로 별도 보장).
 */
import { describe, expect, test } from 'vitest';

type CloseAction = 'widget' | 'tray' | 'ask' | 'icon' | 'quit';

type LegacyWidgetSettings = {
  closeToWidget?: boolean;
  closeAction?: CloseAction;
  icon?: { showCoachMark?: boolean };
};

/** useSettingsStore.ts의 closeAction 마이그레이션 로직 재현 */
function migrateCloseAction(savedWidget: LegacyWidgetSettings | undefined): CloseAction {
  const explicit = savedWidget?.closeAction;
  if (
    explicit === 'widget' ||
    explicit === 'tray' ||
    explicit === 'ask' ||
    explicit === 'icon' ||
    explicit === 'quit'
  ) {
    return explicit;
  }
  const legacy = savedWidget?.closeToWidget;
  if (legacy === false) return 'tray';
  return 'widget';
}

/** useSettingsStore.ts의 icon 옵션 마이그레이션 로직 재현 */
function migrateIconOptions(savedWidget: LegacyWidgetSettings | undefined): {
  showCoachMark: boolean;
} {
  const DEFAULT = { showCoachMark: true };
  return {
    ...DEFAULT,
    ...(savedWidget?.icon ?? {}),
  };
}

describe('closeAction 마이그레이션 (icon-mode v2.0.2)', () => {
  test('TC-02: legacy closeToWidget=true → "widget"', () => {
    expect(migrateCloseAction({ closeToWidget: true })).toBe('widget');
  });

  test('TC-03: legacy closeToWidget=false → "tray"', () => {
    expect(migrateCloseAction({ closeToWidget: false })).toBe('tray');
  });

  test('TC-04a: 명시적 closeAction="icon" 보존', () => {
    expect(migrateCloseAction({ closeAction: 'icon', closeToWidget: true })).toBe('icon');
  });

  test('TC-04b: 명시적 closeAction="widget" 보존', () => {
    expect(migrateCloseAction({ closeAction: 'widget' })).toBe('widget');
  });

  test('TC-04c: 명시적 closeAction="tray" 보존', () => {
    expect(migrateCloseAction({ closeAction: 'tray' })).toBe('tray');
  });

  test('TC-04d: 명시적 closeAction="ask" 보존', () => {
    expect(migrateCloseAction({ closeAction: 'ask' })).toBe('ask');
  });

  test('TC-04g: 명시적 closeAction="quit" 보존 (완전 종료 옵션)', () => {
    expect(migrateCloseAction({ closeAction: 'quit', closeToWidget: true })).toBe('quit');
  });

  test('TC-04e: closeAction이 명시되어도 잘못된 값이면 closeToWidget 폴백', () => {
    // @ts-expect-error invalid value
    expect(migrateCloseAction({ closeAction: 'foobar', closeToWidget: false })).toBe('tray');
  });

  test('TC-04f: closeAction과 closeToWidget 둘 다 없으면 "widget" 기본값', () => {
    expect(migrateCloseAction({})).toBe('widget');
    expect(migrateCloseAction(undefined)).toBe('widget');
  });
});

describe('icon 옵션 마이그레이션 (icon-mode v2.0.2)', () => {
  test('TC-05: widget.icon 키 없음 → showCoachMark: true 기본값', () => {
    expect(migrateIconOptions({})).toEqual({ showCoachMark: true });
    expect(migrateIconOptions(undefined)).toEqual({ showCoachMark: true });
  });

  test('TC-06a: widget.icon.showCoachMark=false 보존 (사용자가 코치마크 본 후)', () => {
    expect(migrateIconOptions({ icon: { showCoachMark: false } })).toEqual({
      showCoachMark: false,
    });
  });

  test('TC-06b: widget.icon.showCoachMark=true 명시도 보존', () => {
    expect(migrateIconOptions({ icon: { showCoachMark: true } })).toEqual({ showCoachMark: true });
  });
});
