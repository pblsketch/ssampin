import { describe, it, expect } from 'vitest';
import { columnIndexFromX, type ColumnBound } from './calendarDropColumn';

/**
 * 달력 드롭 요일 판정 — 실기기(드래그)로 확인하기 어려운 조작이라 순수 함수를 잠근다.
 *
 * 예전의 "줄 너비 7 등분"은 칸 사이 gap-x-1(4px)을 무시해, 좁은 창에서 경계 근처 드롭이
 * 하루 어긋날 수 있었다. 지금은 실제 칸 경계(rect)로 판정한다.
 */

/** 폭 w 칸 7개를 gap 간격으로 나란히 놓은 경계 목록 (left 부터 시작) */
function sevenColumns(w: number, gap: number, left = 0): ColumnBound[] {
  return Array.from({ length: 7 }, (_, i) => {
    const l = left + i * (w + gap);
    return { left: l, right: l + w };
  });
}

describe('columnIndexFromX', () => {
  // 300px 줄: 칸 39.43px + gap 4px × 6 — 좁은 창 시나리오
  const gap = 4;
  const w = (300 - gap * 6) / 7;
  const cols = sevenColumns(w, gap);

  it('칸 안이면 그 칸이다', () => {
    for (let i = 0; i < 7; i++) {
      expect(columnIndexFromX(cols[i]!.left + w / 2, cols)).toBe(i);
    }
  });

  it('칸의 양 끝 경계(left·right)도 그 칸이다', () => {
    expect(columnIndexFromX(cols[3]!.left, cols)).toBe(3);
    expect(columnIndexFromX(cols[3]!.right, cols)).toBe(3);
  });

  it('gap 안이면 가까운 쪽 칸이다', () => {
    // 0번 칸 오른쪽 gap: 앞쪽 절반은 0번, 뒤쪽 절반은 1번
    expect(columnIndexFromX(cols[0]!.right + 1, cols)).toBe(0);
    expect(columnIndexFromX(cols[1]!.left - 1, cols)).toBe(1);
  });

  it('줄 양 끝 바깥은 첫/마지막 칸으로 붙는다 (드롭을 버리지 않는다)', () => {
    expect(columnIndexFromX(cols[0]!.left - 10, cols)).toBe(0);
    expect(columnIndexFromX(cols[6]!.right + 10, cols)).toBe(6);
  });

  it('예전 7 등분이 하루 어긋나던 지점에서 실제 칸 기준으로 짚는다', () => {
    // x=258 은 5번 칸 오른쪽 gap 안이고 5번 칸에 더 가깝다(5번 right=256.57, 6번 left=260.57).
    // 그런데 등분 계산은 6번 등분 경계(6 × 300/7 ≈ 257.14)를 이미 넘겨 6번을 짚는다 — 하루 어긋남.
    const x = 258;
    expect(x).toBeGreaterThan(cols[5]!.right); // 전제: gap 안 좌표다
    expect(x).toBeLessThan(cols[6]!.left);
    const uniform = Math.min(6, Math.max(0, Math.floor((x / 300) * 7)));
    expect(uniform).toBe(6); // 등분 계산은 하루 뒤 칸을 짚는다
    expect(columnIndexFromX(x, cols)).toBe(5);
  });

  it('경계가 비어 있으면 null (드롭 무시)', () => {
    expect(columnIndexFromX(100, [])).toBeNull();
  });

  it('0 폭 칸이 있으면 null — 레이아웃이 안 잡힌 상태에서 넘겨짚지 않는다', () => {
    expect(columnIndexFromX(100, [{ left: 0, right: 0 }])).toBeNull();
  });

  it('gap 이 없어도(경계가 딱 붙어도) 순서대로 짚는다', () => {
    const tight = sevenColumns(40, 0);
    expect(columnIndexFromX(85, tight)).toBe(2);
  });
});
