/** 짝꿍 모드에서 홀수 열 처리 방식 */
export type OddColumnMode = 'single' | 'triple';

export interface PairGroup {
  readonly startCol: number;
  readonly endCol: number;
  /** 그룹 내 좌석 수 */
  readonly size: number;
}

/**
 * 짝꿍 그룹 생성: oddColumnMode에 따라 홀수 열 처리
 * - 'single' (기본): 2열씩 + 마지막 1명 따로
 * - 'triple': 마지막 3열을 하나의 그룹으로 묶기
 */
export function buildPairGroups(
  cols: number,
  oddColumnMode: OddColumnMode,
): PairGroup[] {
  const groups: PairGroup[] = [];
  const isOddCols = cols % 2 !== 0;

  if (isOddCols && oddColumnMode === 'triple' && cols >= 3) {
    // 마지막 3열을 하나의 그룹으로: (0,1)(2,3)...(n-3,n-2,n-1)
    for (let c = 0; c < cols - 3; c += 2) {
      groups.push({ startCol: c, endCol: c + 1, size: 2 });
    }
    // 마지막 3열 그룹
    groups.push({ startCol: cols - 3, endCol: cols - 1, size: 3 });
  } else {
    // 기존 로직: 2열씩 + 홀수면 마지막 1명
    for (let c = 0; c < cols; c += 2) {
      const endCol = Math.min(c + 1, cols - 1);
      groups.push({ startCol: c, endCol, size: endCol - c + 1 });
    }
  }

  return groups;
}
