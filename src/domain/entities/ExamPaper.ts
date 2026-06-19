/**
 * 지필평가 배점 계산기 — 도메인 엔티티.
 *
 * 계획서: docs/01-plan/features/exam-score-allocator.plan.md
 * 제1원칙 준수: 학생 개인정보 0건 — 문항 메타(유형/배점)만 다룬다.
 *
 * 설계 결정:
 * - D1: 배점(points)은 number 로 보관하되, 모든 산술은 examAllocationRules 만 통과한다.
 *       소수점 합산 오차는 규칙 함수의 센티포인트(×100 정수) 연산으로 차단한다.
 * - D2: 문항 유형은 객관식(choice)/단답형(short)/서술형(essay) 3종.
 *       서답형 비율 = (short + essay) 배점 / 만점 — 학업성적관리규정 검증용.
 */

/** 문항 유형 — 객관식 / 단답형 / 서술형 */
export type ItemType = 'choice' | 'short' | 'essay';

/** 문항 난이도 (이원목적분류표용, 선택) */
export type ItemDifficulty = '상' | '중' | '하';

/** 문항 1개 */
export interface ExamItem {
  readonly id: string;
  /** 문항 번호 (1-based, 표시·정렬용) */
  readonly number: number;
  readonly type: ItemType;
  /** 배점 (소수점 허용, 0 초과) */
  readonly points: number;
  /** 난이도 (선택) */
  readonly difficulty?: ItemDifficulty;
  /** 출제 단원/영역 (선택) */
  readonly unit?: string;
  /** 성취기준 (선택) */
  readonly standard?: string;
}

/** 시험지 1개 — 문항별 배점 설계 단위 */
export interface ExamPaper {
  readonly id: string;
  readonly title: string;
  /** 만점 (기본 100) */
  readonly fullScore: number;
  /** 서답형 목표 비율(%) — 학교 학업성적관리규정. 미설정이면 비율 경고를 띄우지 않는다. */
  readonly targetWrittenRatio?: number;
  readonly items: readonly ExamItem[];
  readonly createdAt: string; // ISO 8601
  readonly updatedAt: string; // ISO 8601
}

/** 유형별 라벨 (UI 표시용) */
export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  choice: '선택형',
  short: '단답형',
  essay: '서술형',
};

/** 서답형으로 간주하는 유형 (서답형 비율 산정 대상). */
export const WRITTEN_TYPES: readonly ItemType[] = ['short', 'essay'];

/** 기본 만점. */
export const DEFAULT_FULL_SCORE = 100;

/**
 * 난이도 3단계 기본 문항수 비율 (하 : 중 : 하 아님 — 하·중·상 오름차순).
 * 종 모양(중이 가장 많고 상·하가 적음). 공식 지침이 정한 고정값이 아니라
 * 교과협의회 자율 관행의 기본값이므로 사용자가 수정할 수 있어야 한다.
 */
export const DEFAULT_DIFFICULTY_RATIO: readonly [number, number, number] = [25, 50, 25];

/**
 * 난이도 단계 라벨 (오름차순: index 0 = 가장 쉬움).
 * 3단계면 하/중/상, 그 외에는 "난이도 1..N"(1 = 가장 쉬움).
 */
export function difficultyTierLabel(level: number, tierCount: number): string {
  if (tierCount === 3) return ['하', '중', '상'][level] ?? `난이도 ${level + 1}`;
  if (tierCount === 2) return ['하', '상'][level] ?? `난이도 ${level + 1}`;
  return `난이도 ${level + 1}`;
}
