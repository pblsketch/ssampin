import type { OddColumnMode } from '@domain/rules/seatingLayoutRules';

/** 학급 자리 배치 데이터 */
export interface SeatingData {
  readonly rows: number;
  readonly cols: number;
  /** 2D 배열: seats[row][col] = studentId | null */
  readonly seats: readonly (readonly (string | null)[])[];
  /** 짝꿍 모드: 인접 2열을 하나의 짝 그룹으로 표시 (기본값 false) */
  readonly pairMode?: boolean;
  /** 짝꿍 모드에서 홀수 열 처리: 'single'=1명 따로 (기본), 'triple'=3명 함께 */
  readonly oddColumnMode?: OddColumnMode;
}
