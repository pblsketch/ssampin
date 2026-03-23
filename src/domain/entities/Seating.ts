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
  /** 자리 배치 레이아웃 타입 */
  readonly layout?: SeatingLayout;
  /** 격자-모둠 연동 여부 (true=전환 시 학생 재분배, false=독립 유지, 기본 true) */
  readonly groupGridSync?: boolean;
  /** 그룹 모드에서 학생 그룹 정보 */
  readonly groups?: readonly SeatGroup[];
}

/** 자리 배치 레이아웃 타입 */
export type SeatingLayout = 'grid' | 'group';

/** 학생 그룹 정보 */
export interface SeatGroup {
  /** 그룹 고유 ID */
  readonly id: string;
  /** 그룹 이름 (예: '1번 모둠', 'A조') */
  readonly name: string;
  /** 그룹 색상 (HEX 코드) */
  readonly color: string;
  /** 그룹에 속한 학생 ID 목록 */
  readonly studentIds: readonly string[];
  /** 그룹 최대 크기 */
  readonly maxSize: number;
}

/** 그룹 자리 배치에 사용할 기본 색상 팔레트 */
export const GROUP_COLORS = [
  '#ef4444', // 빨강
  '#f97316', // 주황
  '#eab308', // 노랑
  '#22c55e', // 초록
  '#3b82f6', // 파랑
  '#8b5cf6', // 보라
  '#ec4899', // 핑크
  '#14b8a6', // 청록
] as const;
