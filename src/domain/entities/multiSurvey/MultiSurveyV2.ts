import type { Question } from './Question';

export const FORMAT_VERSION_V2 = 2 as const;

/**
 * 발표 설정 그룹 (학습 UX 차원).
 * T01 누적점수표시 / T02 해설노출 / T03 재입장 가능
 */
export interface PresentationOpts {
  readonly showCumulativeScore: boolean;
  readonly revealExplanation: boolean;
  readonly allowReentry: boolean;
}

/**
 * 응답 설정 그룹 (설문(퀴즈) 메카닉).
 * T04 정답 제출 버튼 / T05 자동 넘김 / T06 빠른 풀이 / T07 연속 정답 / T08 랜덤 보너스
 */
export interface ResponseOpts {
  readonly explicitSubmitButton: boolean;
  readonly autoAdvance: boolean;
  readonly fastSolveBonus: boolean;
  readonly streakBonus: boolean;
  readonly randomBonus: boolean;
}

/**
 * 표시 설정 그룹 (교사 UX).
 * T09 교사 집중 모드 / T10 문항별 점수 확인
 */
export interface DisplayOpts {
  readonly teacherFocusMode: boolean;
  readonly showPerQuestionScore: boolean;
}

/**
 * MultiSurveyV2 — formatVersion: 2 신규 엔티티.
 * v1 MultiSurvey와 달리 quiz 메카닉(정답·점수·포디움)을 지원하는 9종 문항 union을 품는다.
 */
export interface MultiSurveyV2 {
  readonly id: string;
  readonly formatVersion: typeof FORMAT_VERSION_V2;
  readonly title: string;
  readonly createdAt: string; // ISO 8601
  readonly updatedAt: string; // ISO 8601
  readonly questions: readonly Question[];
  readonly presentationOpts: PresentationOpts;
  readonly responseOpts: ResponseOpts;
  readonly displayOpts: DisplayOpts;
}

/** 런타임 타입 가드 — unknown 값이 MultiSurveyV2인지 확인 */
export function isMultiSurveyV2(value: unknown): value is MultiSurveyV2 {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return v['formatVersion'] === FORMAT_VERSION_V2 && typeof v['id'] === 'string';
}
