/**
 * 바탕화면 작업판 카테고리 (zone) 편집 도메인 규칙.
 *
 * 4가지 순수 함수 (입력 배열 변경 안 함, 새 배열 반환):
 *   - addDesktopIconZone: 새 zone 추가 (이름 검증 + UUID id + order = max+1)
 *   - renameDesktopIconZone: 이름 변경 (1~20자 검증)
 *   - reorderDesktopIconZones: 순서 변경 (드래그앤드롭 또는 인덱스 swap)
 *   - removeDesktopIconZone: 삭제 (MIN_COUNT 보장)
 *
 * 모든 함수는 후처리로 normalizeDesktopIconZones 를 통과시켜 정합성 보장.
 *
 * 선례: src/domain/rules/realtimeWallRules.ts 의 addWallColumn / renameWallColumn /
 *       reorderWallColumns / removeWallColumn 4개 함수 패턴.
 */

import {
  DESKTOP_ICON_ZONE_LIMITS,
  normalizeDesktopIconZones,
  type DesktopIconZoneSettings,
} from '@domain/entities/Settings';

/**
 * 신규 zone 추가. 호출 후 MAX_COUNT(6) 도달이면 추가 거부.
 *
 * @param zones 현재 zone 배열
 * @param name 사용자 입력 이름. 빈 문자열이면 `구역 N` 자동 생성.
 * @returns 새 배열. 추가 거부 시 원본 그대로 반환.
 */
export function addDesktopIconZone(
  zones: ReadonlyArray<DesktopIconZoneSettings>,
  name: string,
): DesktopIconZoneSettings[] {
  if (zones.length >= DESKTOP_ICON_ZONE_LIMITS.MAX_COUNT) {
    return zones.slice();
  }
  const trimmed = (name ?? '').trim().slice(0, DESKTOP_ICON_ZONE_LIMITS.MAX_NAME_LENGTH);
  const finalName = trimmed.length === 0 ? `구역 ${zones.length + 1}` : trimmed;
  const maxOrder = zones.reduce((acc, z) => Math.max(acc, z.order), -1);
  const newZone: DesktopIconZoneSettings = {
    id:
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `zone-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    name: finalName,
    enabled: true,
    order: maxOrder + 1,
  };
  return normalizeDesktopIconZones([...zones, newZone]);
}

/**
 * zone 이름 변경. 1~20자 검증 (빈 문자열 거부).
 *
 * @returns 변경 적용된 새 배열. 입력이 invalid 하거나 id 가 없으면 원본 그대로.
 */
export function renameDesktopIconZone(
  zones: ReadonlyArray<DesktopIconZoneSettings>,
  id: string,
  newName: string,
): DesktopIconZoneSettings[] {
  const trimmed = (newName ?? '').trim();
  if (
    trimmed.length < DESKTOP_ICON_ZONE_LIMITS.MIN_NAME_LENGTH ||
    trimmed.length > DESKTOP_ICON_ZONE_LIMITS.MAX_NAME_LENGTH
  ) {
    return zones.slice();
  }
  let found = false;
  const next = zones.map((z) => {
    if (z.id === id) {
      found = true;
      return { ...z, name: trimmed };
    }
    return z;
  });
  if (!found) return zones.slice();
  return normalizeDesktopIconZones(next);
}

/**
 * 인덱스 fromIdx → toIdx 로 zone 이동 후 order 재정렬.
 * 인덱스 범위 밖이면 원본 그대로.
 */
export function reorderDesktopIconZones(
  zones: ReadonlyArray<DesktopIconZoneSettings>,
  fromIdx: number,
  toIdx: number,
): DesktopIconZoneSettings[] {
  if (
    !Number.isInteger(fromIdx) ||
    !Number.isInteger(toIdx) ||
    fromIdx < 0 ||
    toIdx < 0 ||
    fromIdx >= zones.length ||
    toIdx >= zones.length ||
    fromIdx === toIdx
  ) {
    return zones.slice();
  }
  const arr = zones.slice();
  const [moved] = arr.splice(fromIdx, 1);
  if (!moved) return zones.slice();
  arr.splice(toIdx, 0, moved);
  // order 재할당
  const reordered = arr.map((z, idx) => ({ ...z, order: idx }));
  return normalizeDesktopIconZones(reordered);
}

/**
 * zone 삭제. MIN_COUNT(1) 미만으로 떨어지면 거부.
 */
export function removeDesktopIconZone(
  zones: ReadonlyArray<DesktopIconZoneSettings>,
  id: string,
): DesktopIconZoneSettings[] {
  if (zones.length <= DESKTOP_ICON_ZONE_LIMITS.MIN_COUNT) {
    return zones.slice();
  }
  const filtered = zones.filter((z) => z.id !== id);
  if (filtered.length === zones.length) return zones.slice(); // id 없음
  return normalizeDesktopIconZones(filtered);
}
