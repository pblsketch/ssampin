/**
 * 자리 뽑기 사전 배정 설정
 *
 * scope: 'homeroom' | `tc-${teachingClassId}` — 학급/수업반별로 분리 저장
 * seatKey: `${row}-${col}` 형식
 * studentId: 학급이면 Student.id, 수업반이면 `tc-${tcId}-${studentNumber}` (동적 생성)
 */

export type SeatPickerScope = 'homeroom' | `tc-${string}`;

export interface SeatPickerPrivateAssignment {
  scope: SeatPickerScope;
  seatKey: string;      // "row-col"
  studentId: string;
}

export interface SeatPickerConfig {
  privateAssignments: SeatPickerPrivateAssignment[];
}

export const EMPTY_SEAT_PICKER_CONFIG: SeatPickerConfig = {
  privateAssignments: [],
};
