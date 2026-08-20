/**
 * 사진 열과 이름 열이 어긋나 있어도 순서로 맞물릴 수 있는지 판정하는 규칙.
 *
 * 실물 확인(2026-08-20): 나이스 엑셀은 사진을 절대 좌표로 놓아서
 * 사진 열(1,2,5,7,11,15,18,23)과 이름 열(1,3,6,8,12,16,19,24)이 거의 다 다르다.
 */
import { describe, it, expect } from 'vitest';
import { rowOrderMatches } from '../photoRosterPairing';

const REAL_PHOTOS = [1, 2, 5, 7, 11, 15, 18, 23];
const REAL_NAMES = [1, 3, 6, 8, 12, 16, 19, 24];

describe('rowOrderMatches', () => {
  it('★실물 배치 — 열이 달라도 순서가 맞으면 통과한다', () => {
    expect(rowOrderMatches(REAL_PHOTOS, REAL_NAMES)).toBe(true);
  });

  it('열이 정확히 같은 경우도 통과한다 (예전 파일)', () => {
    expect(rowOrderMatches(REAL_NAMES, REAL_NAMES)).toBe(true);
  });

  it('★사진이 한 장 빠지면 막는다 (남은 사진이 한 칸씩 밀린다)', () => {
    expect(rowOrderMatches(REAL_PHOTOS.slice(1), REAL_NAMES)).toBe(false);
  });

  it('★로고 같은 그림이 앞에 끼면 막는다', () => {
    expect(rowOrderMatches([0, ...REAL_PHOTOS], REAL_NAMES)).toBe(false);
  });

  it('★사진이 이름보다 오른쪽에 있으면 막는다 (짝이 뒤바뀐 배치)', () => {
    expect(rowOrderMatches([2, 4, 7], [1, 3, 6])).toBe(false);
  });

  it('★한 사진 자리에 이름이 둘이면 막는다', () => {
    // 이름 3과 4가 모두 사진 2와 5 사이에 있다 → 어느 쪽이 짝인지 알 수 없다
    expect(rowOrderMatches([1, 2, 5], [1, 3, 4])).toBe(false);
  });

  it('개수가 다르면 막는다', () => {
    expect(rowOrderMatches([1, 2], [1, 3, 6])).toBe(false);
  });

  it('빈 줄은 통과 (비교할 게 없다)', () => {
    expect(rowOrderMatches([], [])).toBe(true);
  });

  it('입력 순서가 뒤죽박죽이어도 판정이 같다 (문서 안 순서에 안 흔들린다)', () => {
    expect(rowOrderMatches([...REAL_PHOTOS].reverse(), [...REAL_NAMES].reverse())).toBe(true);
  });
});
