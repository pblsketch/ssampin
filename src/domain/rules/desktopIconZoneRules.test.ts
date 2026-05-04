import { describe, it, expect } from 'vitest';
import {
  addDesktopIconZone,
  renameDesktopIconZone,
  reorderDesktopIconZones,
  removeDesktopIconZone,
} from './desktopIconZoneRules';
import {
  DEFAULT_DESKTOP_ICON_ZONE_PRESET,
  DESKTOP_ICON_ZONE_LIMITS,
  type DesktopIconZoneSettings,
} from '@domain/entities/Settings';

const seed = (): DesktopIconZoneSettings[] =>
  DEFAULT_DESKTOP_ICON_ZONE_PRESET.map((z) => ({ ...z }));

describe('addDesktopIconZone', () => {
  it('지정 이름으로 신규 zone 추가, order = max+1', () => {
    const zones = seed();
    const result = addDesktopIconZone(zones, '회의록');
    expect(result).toHaveLength(4);
    expect(result[3]?.name).toBe('회의록');
    expect(result[3]?.order).toBe(3);
    expect(result[3]?.enabled).toBe(true);
    expect(result[3]?.id).toBeTruthy();
  });

  it('빈 이름은 `구역 N` 자동 생성', () => {
    const zones = seed();
    const result = addDesktopIconZone(zones, '   ');
    expect(result[3]?.name).toBe('구역 4');
  });

  it('이름이 MAX_NAME_LENGTH 초과면 잘림', () => {
    const long = '가나다'.repeat(20);
    const result = addDesktopIconZone([], long);
    expect(result[0]?.name.length).toBe(DESKTOP_ICON_ZONE_LIMITS.MAX_NAME_LENGTH);
  });

  it('MAX_COUNT(6) 도달 시 추가 거부 (원본 그대로)', () => {
    const zones: DesktopIconZoneSettings[] = Array.from({ length: 6 }, (_, i) => ({
      id: `z${i}`,
      name: `Z${i}`,
      enabled: true,
      order: i,
    }));
    const result = addDesktopIconZone(zones, '추가');
    expect(result).toHaveLength(6);
    expect(result.find((z) => z.name === '추가')).toBeUndefined();
  });

  it('각 호출이 unique id 생성', () => {
    const a = addDesktopIconZone([], 'A');
    const b = addDesktopIconZone(a, 'B');
    expect(a[0]?.id).not.toBe(b[1]?.id);
  });

  it('원본 배열을 mutate 하지 않음', () => {
    const zones = seed();
    const original = JSON.stringify(zones);
    addDesktopIconZone(zones, '신규');
    expect(JSON.stringify(zones)).toBe(original);
  });
});

describe('renameDesktopIconZone', () => {
  it('정상 이름 변경 적용', () => {
    const zones = seed();
    const targetId = zones[1]!.id;
    const result = renameDesktopIconZone(zones, targetId, '진행 중');
    expect(result[1]?.name).toBe('진행 중');
  });

  it('이름이 trim 되어 저장됨', () => {
    const zones = seed();
    const targetId = zones[0]!.id;
    const result = renameDesktopIconZone(zones, targetId, '  처리   ');
    expect(result[0]?.name).toBe('처리');
  });

  it('빈 이름은 거부 (원본 반환)', () => {
    const zones = seed();
    const targetId = zones[0]!.id;
    const result = renameDesktopIconZone(zones, targetId, '   ');
    expect(result[0]?.name).toBe(zones[0]?.name);
  });

  it('MAX_NAME_LENGTH 초과 이름 거부', () => {
    const zones = seed();
    const targetId = zones[0]!.id;
    const tooLong = '가나다'.repeat(20);
    const result = renameDesktopIconZone(zones, targetId, tooLong);
    expect(result[0]?.name).toBe(zones[0]?.name);
  });

  it('존재하지 않는 id 는 원본 반환', () => {
    const zones = seed();
    const result = renameDesktopIconZone(zones, 'nonexistent', '아무거나');
    expect(result).toEqual(zones);
  });
});

describe('reorderDesktopIconZones', () => {
  it('인덱스 0 → 2 이동 후 order 재할당', () => {
    const zones = seed();
    const result = reorderDesktopIconZones(zones, 0, 2);
    expect(result[0]?.name).toBe('작업 중');
    expect(result[1]?.name).toBe('작업 완료');
    expect(result[2]?.name).toBe('작업 전');
    expect(result.map((z) => z.order)).toEqual([0, 1, 2]);
  });

  it('인덱스 2 → 0 이동', () => {
    const zones = seed();
    const result = reorderDesktopIconZones(zones, 2, 0);
    expect(result[0]?.name).toBe('작업 완료');
    expect(result[1]?.name).toBe('작업 전');
    expect(result[2]?.name).toBe('작업 중');
  });

  it('동일 인덱스는 원본 그대로', () => {
    const zones = seed();
    const result = reorderDesktopIconZones(zones, 1, 1);
    expect(result.map((z) => z.id)).toEqual(zones.map((z) => z.id));
  });

  it('범위 밖 인덱스는 원본 그대로', () => {
    const zones = seed();
    expect(reorderDesktopIconZones(zones, -1, 0)).toEqual(zones);
    expect(reorderDesktopIconZones(zones, 0, 99)).toEqual(zones);
    expect(reorderDesktopIconZones(zones, 1.5, 2)).toEqual(zones);
  });
});

describe('removeDesktopIconZone', () => {
  it('정상 삭제', () => {
    const zones = seed();
    const targetId = zones[1]!.id;
    const result = removeDesktopIconZone(zones, targetId);
    expect(result).toHaveLength(2);
    expect(result.find((z) => z.id === targetId)).toBeUndefined();
  });

  it('MIN_COUNT(1) 미만은 거부 (원본 반환)', () => {
    const onlyOne: DesktopIconZoneSettings[] = [
      { id: 'a', name: '하나', enabled: true, order: 0 },
    ];
    const result = removeDesktopIconZone(onlyOne, 'a');
    expect(result).toHaveLength(1);
  });

  it('존재하지 않는 id 는 원본 그대로', () => {
    const zones = seed();
    const result = removeDesktopIconZone(zones, 'nonexistent');
    expect(result).toEqual(zones);
  });

  it('삭제 후 정규화로 order 재정렬됨', () => {
    const zones = seed();
    const targetId = zones[1]!.id;
    const result = removeDesktopIconZone(zones, targetId);
    expect(result.map((z) => z.order).sort()).toEqual([0, 2]);
  });
});
