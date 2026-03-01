/** 학급 자리 배치 데이터 */
export interface SeatingData {
  readonly rows: number;
  readonly cols: number;
  /** 2D 배열: seats[row][col] = studentId | null */
  readonly seats: readonly (readonly (string | null)[])[];
}
