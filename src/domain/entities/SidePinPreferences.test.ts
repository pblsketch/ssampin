import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SIDE_PIN_PREFERENCES,
  SIDE_PIN_MAX_WIDGETS,
  SIDE_PIN_PREFERENCES_SCHEMA_VERSION,
  normalizeSidePinPreferences,
  normalizeSidePinWidgetIds,
} from './SidePinPreferences';

describe('normalizeSidePinWidgetIds', () => {
  it('문자열 배열을 순서 그대로 보존한다', () => {
    expect(normalizeSidePinWidgetIds(['today-class', 'memo'])).toEqual(['today-class', 'memo']);
  });

  it('중복된 위젯 id를 제거한다 — 같은 카드가 두 번 보이면 안 된다', () => {
    expect(normalizeSidePinWidgetIds(['memo', 'memo', 'todo'])).toEqual(['memo', 'todo']);
  });

  it(`최대 ${SIDE_PIN_MAX_WIDGETS}개까지만 남긴다`, () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(normalizeSidePinWidgetIds(ids)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('중복 제거 후에 개수를 세므로, 중복 때문에 유효한 위젯이 밀려나지 않는다', () => {
    expect(normalizeSidePinWidgetIds(['a', 'a', 'a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('앞뒤 공백을 제거한다', () => {
    expect(normalizeSidePinWidgetIds(['  memo  '])).toEqual(['memo']);
  });

  it('빈 문자열과 공백뿐인 값은 버린다', () => {
    expect(normalizeSidePinWidgetIds(['', '   ', 'memo'])).toEqual(['memo']);
  });

  it('문자열이 아닌 항목은 건너뛴다', () => {
    expect(normalizeSidePinWidgetIds([1, null, undefined, {}, 'memo'])).toEqual(['memo']);
  });

  it('배열이 아니면 빈 배열', () => {
    expect(normalizeSidePinWidgetIds(undefined)).toEqual([]);
    expect(normalizeSidePinWidgetIds(null)).toEqual([]);
    expect(normalizeSidePinWidgetIds('memo')).toEqual([]);
    expect(normalizeSidePinWidgetIds({ 0: 'memo' })).toEqual([]);
  });
});

describe('normalizeSidePinPreferences', () => {
  describe('기본값', () => {
    it('enabled 기본값은 false — 성능 게이트 통과 전에는 켜지 않는다', () => {
      expect(DEFAULT_SIDE_PIN_PREFERENCES.enabled).toBe(false);
    });

    it('값이 없으면 기본 설정을 돌려준다', () => {
      expect(normalizeSidePinPreferences(undefined)).toEqual(DEFAULT_SIDE_PIN_PREFERENCES);
      expect(normalizeSidePinPreferences(null)).toEqual(DEFAULT_SIDE_PIN_PREFERENCES);
    });

    it('객체가 아닌 값이 와도 예외를 던지지 않는다', () => {
      expect(() => normalizeSidePinPreferences('깨진 값')).not.toThrow();
      expect(normalizeSidePinPreferences('깨진 값')).toEqual(DEFAULT_SIDE_PIN_PREFERENCES);
      expect(normalizeSidePinPreferences(42)).toEqual(DEFAULT_SIDE_PIN_PREFERENCES);
    });
  });

  describe('정상 값 보존', () => {
    it('사용자가 켠 설정과 위젯 선택을 보존한다', () => {
      const result = normalizeSidePinPreferences({
        enabled: true,
        widgetItemIds: ['today-class', 'memo', 'todo'],
        memoSort: 'recent',
        schemaVersion: 1,
      });
      expect(result.enabled).toBe(true);
      expect(result.widgetItemIds).toEqual(['today-class', 'memo', 'todo']);
      expect(result.memoSort).toBe('recent');
    });
  });

  describe('손상·구버전 값 복구', () => {
    it('enabled가 boolean이 아니면 false로 되돌린다', () => {
      expect(normalizeSidePinPreferences({ enabled: 'true' }).enabled).toBe(false);
      expect(normalizeSidePinPreferences({ enabled: 1 }).enabled).toBe(false);
    });

    it('알 수 없는 memoSort는 recent로 되돌린다 (pinned-first는 후속 기능)', () => {
      expect(normalizeSidePinPreferences({ memoSort: 'pinned-first' }).memoSort).toBe('recent');
      expect(normalizeSidePinPreferences({ memoSort: 999 }).memoSort).toBe('recent');
    });

    it('widgetItemIds가 손상돼도 나머지 설정은 살린다', () => {
      const result = normalizeSidePinPreferences({ enabled: true, widgetItemIds: '망가짐' });
      expect(result.enabled).toBe(true);
      expect(result.widgetItemIds).toEqual([]);
    });

    it('schemaVersion은 항상 현재 버전으로 맞춘다', () => {
      expect(normalizeSidePinPreferences({ schemaVersion: 0 }).schemaVersion).toBe(
        SIDE_PIN_PREFERENCES_SCHEMA_VERSION,
      );
      expect(normalizeSidePinPreferences({ schemaVersion: 'x' }).schemaVersion).toBe(
        SIDE_PIN_PREFERENCES_SCHEMA_VERSION,
      );
    });

    it('모르는 필드가 섞여 있어도 무시한다', () => {
      const result = normalizeSidePinPreferences({
        enabled: true,
        displayId: 'monitor-1',
        panelWidth: 400,
      });
      expect(result).toEqual({
        enabled: true,
        widgetItemIds: [],
        memoSort: 'recent',
        schemaVersion: SIDE_PIN_PREFERENCES_SCHEMA_VERSION,
      });
    });
  });
});
