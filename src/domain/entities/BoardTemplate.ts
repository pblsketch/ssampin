/**
 * BoardTemplate — 협업보드 학습 활동 템플릿 (PDCA-3 / G005)
 *
 * 템플릿은 "보드를 처음 만들 때 캔버스에 미리 깔리는 잠긴 밑그림"이다.
 * 도메인은 좌표·색·텍스트만 담은 스켈레톤을 정의하고, Excalidraw 요소로의
 * 완성(id·seed·version 등 런타임 필드 부여)과 Y.Doc 직렬화는
 * infrastructure(BoardTemplateSeeder)가 담당한다 (ADR-012).
 */

/** 지원 템플릿 5종 — 'blank'는 빈 보드(시딩 없음) */
export const BOARD_TEMPLATE_IDS = [
  'blank',
  'mandalart',
  'group-activity',
  'brainstorm',
  'flow-diagram',
] as const;

export type BoardTemplateId = (typeof BOARD_TEMPLATE_IDS)[number];

export function isBoardTemplateId(value: unknown): value is BoardTemplateId {
  return typeof value === 'string' && (BOARD_TEMPLATE_IDS as readonly string[]).includes(value);
}

/** 템플릿 선택 다이얼로그에 노출되는 메타 정보 */
export interface BoardTemplateInfo {
  readonly id: BoardTemplateId;
  readonly name: string;
  readonly description: string;
}

/** 스켈레톤 공통 — 좌표는 캔버스 절대 좌표 (좌상단 기준) */
interface TemplateSkeletonBase {
  readonly x: number;
  readonly y: number;
  readonly strokeColor: string;
}

/** 면 도형 (사각형·마름모·원) */
export interface TemplateShapeSkeleton extends TemplateSkeletonBase {
  readonly kind: 'rectangle' | 'diamond' | 'ellipse';
  readonly width: number;
  readonly height: number;
  readonly backgroundColor: string;
  /** true면 모서리 둥근 사각형 (Excalidraw ADAPTIVE_RADIUS) */
  readonly rounded: boolean;
  readonly strokeWidth: number;
}

/** 텍스트 라벨 — width/height는 도메인이 추정한 렌더 박스 */
export interface TemplateTextSkeleton extends TemplateSkeletonBase {
  readonly kind: 'text';
  readonly text: string;
  readonly fontSize: number;
  readonly width: number;
  readonly height: number;
  readonly textAlign: 'left' | 'center';
}

/** 선·화살표 — points는 (x, y) 기준 상대 좌표 */
export interface TemplateLinearSkeleton extends TemplateSkeletonBase {
  readonly kind: 'line' | 'arrow';
  readonly width: number;
  readonly height: number;
  readonly points: ReadonlyArray<readonly [number, number]>;
  readonly strokeWidth: number;
  readonly endArrowhead: 'arrow' | null;
}

export type TemplateElementSkeleton =
  | TemplateShapeSkeleton
  | TemplateTextSkeleton
  | TemplateLinearSkeleton;
