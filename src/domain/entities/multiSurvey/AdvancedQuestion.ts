import type { QuestionBase, Choice } from './Question';

export type AdvancedQuestionType =
  | 'order'
  | 'ranking'
  | 'pin'
  | 'numeric'
  | 'allocation'
  | 'matrix'
  | 'brainstorm'
  | 'rating'
  | 'valueline'
  | 'quadrant';

export interface AdvancedSettings {
  readonly items: readonly Choice[];
  /**
   * 가치수직선의 축 개수. 1이면 한 줄 수직선, 2면 가로·세로 두 기준(옛 2축 평가).
   * 옛 자료에는 없으므로 읽는 쪽에서 1로 본다.
   */
  /** 아이디어 모으기에서 공개 후 공감(투표)을 받을지. 없으면 받는다(옛 자료 호환). */
  readonly allowVoting?: boolean;
  /**
   * 2×2 매트릭스의 네 칸 이름. 읽는 순서대로 [왼쪽 위, 오른쪽 위, 왼쪽 아래, 오른쪽 아래].
   * 비워 두면 칸 이름 없이 축 양 끝 이름만 보여 준다.
   */
  readonly quadrantLabels?: readonly string[];
  /** 2×2 매트릭스에서 학생 한 명이 놓을 수 있는 점의 개수(1~5). */
  readonly maxPoints?: number;
  /** 2×2 매트릭스에서 점마다 짧은 글을 함께 받을지. 끄면 자리만 고른다. */
  readonly collectPointText?: boolean;
  /** 가치수직선 양 끝 이름. 가로축(축이 1개면 그 축)과 세로축을 따로 적는다. */
  readonly xMinLabel?: string;
  readonly xMaxLabel?: string;
  readonly yMinLabel?: string;
  readonly yMaxLabel?: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly total: number;
  readonly unit: string;
  readonly xLabel: string;
  readonly yLabel: string;
  readonly imageUrl: string;
  readonly maxIdeas: number;
}

export interface AdvancedQuestion extends QuestionBase {
  readonly type: AdvancedQuestionType;
  readonly settings: AdvancedSettings;
  readonly solution?: {
    readonly order?: readonly string[];
    readonly number?: number;
    readonly tolerance?: number;
    readonly region?: {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    };
  };
}

export interface AdvancedPublicQuestion {
  readonly type: AdvancedQuestionType;
  readonly settings: AdvancedSettings;
}

export const ADVANCED_TYPES: readonly AdvancedQuestionType[] = [
  'order',
  'ranking',
  'pin',
  'numeric',
  'allocation',
  'matrix',
  'brainstorm',
  'rating',
  'valueline',
  'quadrant',
];

export function isAdvancedType(type: string): type is AdvancedQuestionType {
  return ADVANCED_TYPES.some((value) => value === type);
}

/** 2×2 매트릭스에 놓은 점 하나. 좌표는 판 크기 대비 0~1이다(이미지 위치 표시와 같은 규칙). */
export interface QuadrantPoint {
  readonly x: number;
  readonly y: number;
  /** 점마다 글을 받는 문항에서만 있다. */
  readonly text?: string;
}

export type AdvancedAnswer =
  | readonly string[]
  | number
  | Readonly<Record<string, number>>
  | readonly QuadrantPoint[];

/** 2×2 매트릭스 응답인지 — 배열이 글자 목록인지 점 목록인지 가른다. */
export function isQuadrantAnswer(value: AdvancedAnswer): value is readonly QuadrantPoint[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'object' && item !== null);
}

/** 점 개수 상한의 허용 범위 */
export const QUADRANT_MAX_POINTS_LIMIT = 5;
