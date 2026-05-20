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
  /**
   * 자유 배치(freestyle) 모드의 책상 목록.
   * `layout === 'freestyle'` 일 때만 사용된다.
   * 정규화 좌표(0~1000) 기반 CSS absolute positioning 으로 렌더된다.
   * grid/group 모드에서도 보존되어 모드 토글 시 데이터 손실 0 보장.
   */
  readonly freestyleDesks?: readonly FreestyleDesk[];
  /**
   * 자유 배치 생성 시 사용한 프리셋 타입 (UI 표시 및 재생성용).
   * 사용자가 자유 편집한 뒤에도 보존된다.
   */
  readonly freestylePreset?: FreestylePresetType;
}

/** 자리 배치 레이아웃 타입 */
export type SeatingLayout = 'grid' | 'group' | 'freestyle';

/**
 * 자유 배치(freestyle) 모드의 책상 단위.
 *
 * 좌표 모델:
 * - `x`, `y` 는 0~1000 정규화 좌표 (컨테이너 크기 독립적).
 * - 화면 렌더 시 `left = (x/1000) * containerWidth`, `top = (y/1000) * containerHeight`.
 * - 컨테이너 종횡비는 4:3 권장 (모바일 세로/데스크톱 가로 차이 흡수).
 *
 * 학생 배정 모델:
 * - `studentId: string` → 학생 배정됨
 * - `studentId: null`   → 책상은 있고 학생만 없음 (의도적 빈 자리)
 * - 책상 자체가 없는 경우는 `freestyleDesks` 배열에서 desk 객체 자체 제외.
 *
 * 회전:
 * - `rotation` 은 0~360° 자유 각도. circle 프리셋에서 360/N 각도가 그대로 저장.
 * - 책상 외곽선·테두리·아바타는 `rotation` 값 그대로 회전.
 * - 학생 이름 텍스트는 SeatCard 내부에서 `rotate(-rotation)` 역회전으로 정방향 유지.
 */
export interface FreestyleDesk {
  /** 고유 ID. `crypto.randomUUID()` 또는 `desk-${Date.now()}-${counter}` */
  readonly id: string;
  /** 정규화 X 좌표 0~1000 (컨테이너 폭에 비례) */
  readonly x: number;
  /** 정규화 Y 좌표 0~1000 (컨테이너 높이에 비례) */
  readonly y: number;
  /** 회전 각도 0~360°. 시각적 회전 (텍스트는 SeatCard 내부에서 역회전 보정). */
  readonly rotation?: number;
  /**
   * 배정된 학생 ID.
   * - `string`: 학생 배정됨
   * - `null`: 책상은 있고 학생 없음 (의도적 빈 자리)
   */
  readonly studentId: string | null;
  /** 모둠 소속 ID (clusters 프리셋에서 사용). 비어있으면 모둠 없음. */
  readonly groupId?: string;
}

/**
 * 자유 배치 프리셋 타입.
 *
 * - Tier 1 (현장 사용률 90%+): rows, clusters, ushape
 * - Tier 2 (교육적 다양성): pairs, facing_rows, circle
 * - Tier 3 (특수 상황): double_horseshoe, hybrid_zones, exam, chevron
 *
 * Phase 1 에서는 타입만 정의하며 실제 좌표 생성 알고리즘은 Phase 2 에서 구현.
 */
export type FreestylePresetType =
  | 'rows' // Tier 1: 일제식 (전통 줄배치)
  | 'clusters' // Tier 1: 모둠형
  | 'ushape' // Tier 1: ㄷ자형 (U-Shape)
  | 'pairs' // Tier 2: 짝꿍 배치
  | 'facing_rows' // Tier 2: 찬반토론형 (Facing Rows)
  | 'circle' // Tier 2: 원형 (Circle/Oval)
  | 'double_horseshoe' // Tier 3: 이중 ㄷ자
  | 'hybrid_zones' // Tier 3: 복합형 (Centers/Hybrid Zones)
  | 'exam' // Tier 3: 시험 대형
  | 'chevron'; // Tier 3: V자형 (Chevron)

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
