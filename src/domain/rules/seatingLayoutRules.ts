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

/**
 * 행별 짝 그룹 조정: 짝수 열에서 마지막 학생이 혼자인 경우 이전 짝에 합류시켜 3인 그룹 생성
 * - groups: buildPairGroups('single')의 결과
 * - rowData: 해당 행의 좌석 데이터
 */
export function adjustPairGroupsForRow(
  groups: readonly PairGroup[],
  rowData: readonly (string | null)[],
): PairGroup[] {
  if (groups.length < 2) return groups.map((g) => ({ ...g }));

  // 뒤에서부터 학생이 있는 마지막 그룹 찾기
  let lastOccIdx = -1;
  for (let i = groups.length - 1; i >= 0; i--) {
    const gr = groups[i]!;
    for (let c = gr.startCol; c <= gr.endCol; c++) {
      if (rowData[c] != null) { lastOccIdx = i; break; }
    }
    if (lastOccIdx >= 0) break;
  }

  // 합칠 이전 그룹이 없으면 원본 반환
  if (lastOccIdx <= 0) return groups.map((g) => ({ ...g }));

  // 마지막 학생 그룹의 점유 수 & 마지막 학생 열 위치
  const soloGroup = groups[lastOccIdx]!;
  let occ = 0;
  let lastStudCol = soloGroup.startCol;
  for (let c = soloGroup.startCol; c <= soloGroup.endCol; c++) {
    if (rowData[c] != null) { occ++; lastStudCol = c; }
  }

  // solo(1명)가 아니면 조정 불필요
  if (occ !== 1) return groups.map((g) => ({ ...g }));

  const totalEndCol = groups[groups.length - 1]!.endCol;
  const prev = groups[lastOccIdx - 1]!;
  const result: PairGroup[] = [];

  // 이전 그룹들 그대로
  for (let i = 0; i < lastOccIdx - 1; i++) {
    const g = groups[i]!;
    result.push({ startCol: g.startCol, endCol: g.endCol, size: g.size });
  }

  // 이전 그룹 + solo 학생 합쳐서 트리플
  result.push({
    startCol: prev.startCol,
    endCol: lastStudCol,
    size: lastStudCol - prev.startCol + 1,
  });

  // 나머지 빈 좌석들
  if (lastStudCol < totalEndCol) {
    result.push({
      startCol: lastStudCol + 1,
      endCol: totalEndCol,
      size: totalEndCol - lastStudCol,
    });
  }

  return result;
}
