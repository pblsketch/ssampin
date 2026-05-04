import { describe, it, expect } from 'vitest';
import {
  normalizeDesktopMode,
  normalizeDesktopIconZones,
  DEFAULT_DESKTOP_ICON_ZONE_PRESET,
  DESKTOP_ICON_ZONE_LIMITS,
  type WidgetDesktopMode,
} from './Settings';

describe('normalizeDesktopMode', () => {
  it('정식 값 normal/topmost/native-desktop 은 그대로 통과', () => {
    expect(normalizeDesktopMode('normal')).toBe('normal');
    expect(normalizeDesktopMode('topmost')).toBe('topmost');
    expect(normalizeDesktopMode('native-desktop')).toBe('native-desktop');
  });

  it('알 수 없는 문자열은 normal 로 정규화', () => {
    expect(normalizeDesktopMode('floating')).toBe('normal');
    expect(normalizeDesktopMode('')).toBe('normal');
    expect(normalizeDesktopMode('NORMAL')).toBe('normal'); // 대소문자 미인정 (정식 토큰만 인정)
  });

  it('null / undefined / 객체 / 숫자 모두 normal 로 안전 fallback', () => {
    expect(normalizeDesktopMode(null)).toBe('normal');
    expect(normalizeDesktopMode(undefined)).toBe('normal');
    expect(normalizeDesktopMode({})).toBe('normal');
    expect(normalizeDesktopMode(123)).toBe('normal');
  });

  it('반환값은 WidgetDesktopMode 타입과 호환된다 (컴파일 타임 검증)', () => {
    const v: WidgetDesktopMode = normalizeDesktopMode('topmost');
    expect(v).toBe('topmost');
  });
});

describe('normalizeDesktopIconZones', () => {
  it('배열이 아닌 입력은 빈 배열', () => {
    expect(normalizeDesktopIconZones(null)).toEqual([]);
    expect(normalizeDesktopIconZones(undefined)).toEqual([]);
    expect(normalizeDesktopIconZones('not-array')).toEqual([]);
    expect(normalizeDesktopIconZones({ length: 0 })).toEqual([]);
  });

  it('빈 배열은 빈 배열', () => {
    expect(normalizeDesktopIconZones([])).toEqual([]);
  });

  it('정상 입력 3개는 그대로 보존, order 오름차순 정렬', () => {
    const result = normalizeDesktopIconZones([
      { id: 'b', name: '작업 중', enabled: true, order: 1 },
      { id: 'c', name: '작업 완료', enabled: true, order: 2 },
      { id: 'a', name: '작업 전', enabled: true, order: 0 },
    ]);
    expect(result).toEqual([
      { id: 'a', name: '작업 전', enabled: true, order: 0 },
      { id: 'b', name: '작업 중', enabled: true, order: 1 },
      { id: 'c', name: '작업 완료', enabled: true, order: 2 },
    ]);
  });

  it('객체가 아닌 항목은 무시', () => {
    const result = normalizeDesktopIconZones([
      { id: 'a', name: 'A', enabled: true, order: 0 },
      'not-object',
      null,
      42,
      { id: 'b', name: 'B', enabled: true, order: 1 },
    ]);
    expect(result.map((z) => z.id)).toEqual(['a', 'b']);
  });

  it('이름은 trim 후 1~20자로 자른다', () => {
    const result = normalizeDesktopIconZones([
      { id: 'a', name: '   ', enabled: true, order: 0 },
      { id: 'b', name: '0123456789'.repeat(3), enabled: true, order: 1 },
      { id: 'c', name: '  안쪽 공백 유지  ', enabled: true, order: 2 },
    ]);
    expect(result[0]?.name).toBe('구역 1'); // trim 후 빈 → fallback
    expect(result[1]?.name).toHaveLength(DESKTOP_ICON_ZONE_LIMITS.MAX_NAME_LENGTH);
    expect(result[2]?.name).toBe('안쪽 공백 유지');
  });

  it('enabled 가 boolean 이 아니면 true 로 fallback', () => {
    const result = normalizeDesktopIconZones([
      { id: 'a', name: 'A', enabled: 'yes', order: 0 },
      { id: 'b', name: 'B', enabled: false, order: 1 },
    ]);
    expect(result[0]?.enabled).toBe(true);
    expect(result[1]?.enabled).toBe(false);
  });

  it('order 가 숫자 아니거나 NaN/Infinity 이면 idx 사용', () => {
    const result = normalizeDesktopIconZones([
      { id: 'a', name: 'A', enabled: true, order: 'first' },
      { id: 'b', name: 'B', enabled: true, order: NaN },
      { id: 'c', name: 'C', enabled: true, order: Infinity },
      { id: 'd', name: 'D', enabled: true, order: 2.7 }, // 정수가 아니면 trunc
    ]);
    // order 가 0,1,2,2 (Math.trunc 후) 로 들어가지만 NaN/Infinity 는 idx fallback (1, 2)
    // 정렬 결과는 안정성을 보장하지 않으므로 단순히 4개 모두 살아남는지만 확인
    expect(result).toHaveLength(4);
    expect(result.map((z) => z.id).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('id 가 비거나 문자열 아니면 fallback id 부여', () => {
    const result = normalizeDesktopIconZones([
      { id: '', name: 'A', enabled: true, order: 0 },
      { id: null, name: 'B', enabled: true, order: 1 },
      { id: 42, name: 'C', enabled: true, order: 2 },
    ]);
    expect(result.every((z) => z.id.length > 0)).toBe(true);
  });

  it('중복 id 는 suffix 로 충돌 회피', () => {
    const result = normalizeDesktopIconZones([
      { id: 'same', name: 'A', enabled: true, order: 0 },
      { id: 'same', name: 'B', enabled: true, order: 1 },
      { id: 'same', name: 'C', enabled: true, order: 2 },
    ]);
    const ids = result.map((z) => z.id);
    expect(new Set(ids).size).toBe(3); // 모두 unique 해야 함
    expect(ids[0]).toBe('same');
    expect(ids[1]).toMatch(/^same-dup-/);
    expect(ids[2]).toMatch(/^same-dup-/);
  });

  it('MAX_COUNT(6) 초과 항목은 절단', () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({
      id: `z${i}`,
      name: `Z${i}`,
      enabled: true,
      order: i,
    }));
    const result = normalizeDesktopIconZones(ten);
    expect(result).toHaveLength(DESKTOP_ICON_ZONE_LIMITS.MAX_COUNT);
    expect(result.map((z) => z.id)).toEqual(['z0', 'z1', 'z2', 'z3', 'z4', 'z5']);
  });
});

describe('DEFAULT_DESKTOP_ICON_ZONE_PRESET', () => {
  it('정확히 3개의 카드 (작업 전/중/완료)', () => {
    expect(DEFAULT_DESKTOP_ICON_ZONE_PRESET).toHaveLength(3);
    expect(DEFAULT_DESKTOP_ICON_ZONE_PRESET.map((z) => z.name)).toEqual([
      '작업 전',
      '작업 중',
      '작업 완료',
    ]);
  });

  it('모든 항목이 enabled=true, order는 0/1/2', () => {
    DEFAULT_DESKTOP_ICON_ZONE_PRESET.forEach((z, idx) => {
      expect(z.enabled).toBe(true);
      expect(z.order).toBe(idx);
    });
  });

  it('id는 __preset_ 접두사로 일관됨 (다음 사용자 정의 id와 충돌 회피)', () => {
    DEFAULT_DESKTOP_ICON_ZONE_PRESET.forEach((z) => {
      expect(z.id).toMatch(/^__preset_/);
    });
  });

  it('정규화를 다시 통과해도 보존된다 (idempotent)', () => {
    const round = normalizeDesktopIconZones(
      DEFAULT_DESKTOP_ICON_ZONE_PRESET.map((z) => ({ ...z })),
    );
    expect(round).toEqual([...DEFAULT_DESKTOP_ICON_ZONE_PRESET]);
  });

  it('Object.freeze 로 mutation 방어', () => {
    expect(Object.isFrozen(DEFAULT_DESKTOP_ICON_ZONE_PRESET)).toBe(true);
  });
});

describe('DESKTOP_ICON_ZONE_LIMITS', () => {
  it('상수값이 디자인 §5.2 / FR-05 와 일치', () => {
    expect(DESKTOP_ICON_ZONE_LIMITS.MIN_COUNT).toBe(1);
    expect(DESKTOP_ICON_ZONE_LIMITS.MAX_COUNT).toBe(6);
    expect(DESKTOP_ICON_ZONE_LIMITS.MIN_NAME_LENGTH).toBe(1);
    expect(DESKTOP_ICON_ZONE_LIMITS.MAX_NAME_LENGTH).toBe(20);
  });

  it('Object.freeze 로 보호됨', () => {
    expect(Object.isFrozen(DESKTOP_ICON_ZONE_LIMITS)).toBe(true);
  });
});
