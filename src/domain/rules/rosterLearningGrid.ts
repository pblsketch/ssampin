/**
 * 명단만으로 이름 학습용 격자를 만든다.
 *
 * ## 왜 필요한가
 *
 * 이름 학습 모드는 지금까지 **자리배치 탭 안에만** 있었다. 담임도 수업 관리도
 * 자리배치를 먼저 만들어야 도달할 수 있었다(수업 관리는 자리배치가 없으면 탭 내용 자체가 안 뜬다).
 *
 * 그런데 **얼굴 보고 이름 맞히기는 자리와 아무 상관이 없다.** 학기 초 첫 주,
 * 자리배치를 아직 안 짠 시점이 오히려 이 기능이 가장 필요한 때다.
 * 그래서 명단만으로도 격자를 만들어 학습 모드를 열 수 있게 한다.
 *
 * 학습 모드 컴포넌트는 손대지 않는다 — 그쪽은 `SeatingData` 를 받게 되어 있으니
 * 여기서 **명단으로 가짜 자리표를 만들어 넘기면** 된다.
 */

import type { SeatingData } from '@domain/entities/Seating';

/** 한 줄에 놓을 최대 인원 — 카드가 너무 작아지지 않는 선 */
export const ROSTER_GRID_MAX_COLS = 6;

/**
 * 학생 id 목록을 학습용 격자로 만든다.
 *
 * 실제 교실 자리와 무관한 **보기용 배치**다. 학번 순으로 왼쪽 위부터 채운다.
 */
export function buildRosterLearningGrid(
  studentIds: readonly string[],
  maxCols: number = ROSTER_GRID_MAX_COLS,
): SeatingData {
  const count = studentIds.length;
  if (count === 0) return { rows: 0, cols: 0, seats: [] };

  const cols = Math.max(1, Math.min(maxCols, count));
  const rows = Math.ceil(count / cols);

  const seats: (string | null)[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: (string | null)[] = [];
    for (let c = 0; c < cols; c++) {
      row.push(studentIds[r * cols + c] ?? null);
    }
    seats.push(row);
  }

  return { rows, cols, seats };
}
