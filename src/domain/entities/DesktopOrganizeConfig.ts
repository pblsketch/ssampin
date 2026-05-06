/**
 * desktop-organize 위젯 카드의 영속 설정.
 *
 * 카드는 가로(cols) × 세로(rows) 그리드로 카테고리 박스를 보여준다.
 * 박스는 시각적 영역만(제목 + 테두리)이고, 실제 바탕화면 아이콘은
 * OS(Windows Explorer)가 관리한다 — 카드 자체는 어떤 아이콘이 어디에
 * 있는지 추적하지 않는다.
 *
 * 외부 의존 0건. 순수 타입과 상수만.
 */

/** 그리드 한 변의 칸 수 (1 ~ 6) */
export type GridDimension = 1 | 2 | 3 | 4 | 5 | 6;

/** 박스 제목 (빈 문자열 허용, 길이는 MAX_BOX_TITLE_LENGTH 이하) */
export type BoxTitle = string;

/** desktop-organize 카드의 영속 설정 */
export interface DesktopOrganizeConfig {
  /** 가로 칸 수 */
  readonly cols: GridDimension;
  /** 세로 칸 수 */
  readonly rows: GridDimension;
  /**
   * 박스 제목 배열 — 길이는 정확히 cols * rows.
   * 인덱스 순서는 row-major (왼→오, 위→아래).
   * 예) cols=3, rows=2 → [0:행0/열0, 1:행0/열1, 2:행0/열2, 3:행1/열0, 4:행1/열1, 5:행1/열2]
   */
  readonly boxTitles: readonly BoxTitle[];
  /**
   * 박스 내부 투명 여부.
   * - true: 박스 내부가 완전 투명 → native-desktop 모드에서 OS 바탕화면 아이콘이 그대로 보임 (기본값)
   * - false: 박스 내부에 sp-card 반투명 배경 → 시각적 구분 강조 (라이트 톤 위젯에서 박스 영역을 명확히 표시)
   */
  readonly boxTransparent: boolean;
  /** 마지막 수정 시각 (ISO 8601) */
  readonly lastModified: string;
}

/** 박스 제목 placeholder 접두 — 빈 슬롯 자동 채움 시 사용 ("카테고리 1", "카테고리 2", ...) */
export const DEFAULT_BOX_TITLE_PREFIX = '카테고리';

/** 박스 제목 길이 상한 (한국어 기준 약 1줄) */
export const MAX_BOX_TITLE_LENGTH = 20;

/** 그리드 셀 합산 상한 (cols × rows ≤ MAX_GRID_CELLS) */
export const MAX_GRID_CELLS = 12;

/** 그리드 한 변 상한 */
export const MAX_GRID_DIMENSION = 6 as const;

/** 그리드 한 변 하한 */
export const MIN_GRID_DIMENSION = 1 as const;

/** 기본 카드 설정 (첫 활성화 시 적용) — 1×3 가로형, "수업/학급/업무", 박스 투명 ON */
export const DEFAULT_DESKTOP_ORGANIZE_CONFIG: DesktopOrganizeConfig = {
  cols: 3,
  rows: 1,
  boxTitles: ['수업', '학급', '업무'],
  boxTransparent: true,
  lastModified: new Date(0).toISOString(),
};

/**
 * 박스 인덱스로부터 placeholder 제목 생성.
 * @param index 0-based 박스 인덱스
 */
export function makePlaceholderTitle(index: number): string {
  return `${DEFAULT_BOX_TITLE_PREFIX} ${index + 1}`;
}
