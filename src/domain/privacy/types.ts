/**
 * 개인정보 가리기(마스킹) 도메인 타입.
 *
 * 순수 TypeScript — 외부 의존성 import 금지(Clean Architecture domain 규칙).
 * 마스킹은 "보장"이 아니라 "보조"다. 저신뢰(account/address) 항목은 사람이
 * 반드시 검토해야 한다(confidence: 'low').
 */

/** 정규식으로 자동 탐지하는 패턴 종류 */
export type PatternKind = 'phone' | 'rrn' | 'email' | 'birth' | 'address';

/** 마스킹 대상 종류 — 패턴 + 사용자 키워드 */
export type MaskKind = PatternKind | 'keyword';

/** 탐지 신뢰도. low 는 오탐/미탐 가능성이 높아 검토 필수. */
export type MaskConfidence = 'high' | 'low';

/** 원문에서 탐지된 한 구간 */
export interface DetectedSpan {
  /** 원문 내 시작 인덱스 */
  readonly start: number;
  /** 원문 내 끝 인덱스(exclusive) */
  readonly end: number;
  /** 매칭된 원문 부분 문자열 */
  readonly text: string;
  readonly kind: MaskKind;
  readonly confidence: MaskConfidence;
  /** keyword 일 때 그룹 라벨(이름/학교/지역 등). alias 접두사로 쓰인다. */
  readonly label?: string;
}

/** 자동 패턴 on/off 설정 */
export interface PatternConfig {
  readonly phone: boolean;
  readonly rrn: boolean;
  readonly email: boolean;
  readonly birth: boolean;
  readonly address: boolean;
}

/** 수동 키워드 묶음(라벨 + 값 목록). 라벨이 alias 접두사가 된다. */
export interface KeywordGroup {
  readonly label: string;
  readonly values: readonly string[];
}

/** 마스킹 설정 — 자동 패턴 + 수동 키워드 그룹 */
export interface MaskConfig {
  readonly patterns: PatternConfig;
  readonly keywordGroups: readonly KeywordGroup[];
}

/** 별칭 ↔ 원문 매핑(복원용). 이 매핑은 개인정보이므로 외부로 내보내지 않는다. */
export interface MaskMapping {
  /** 가린 자리에 들어가는 별칭. 예: ［이름1］, ［전화1］ */
  readonly alias: string;
  /** 원래 값 */
  readonly original: string;
  readonly kind: MaskKind;
}

/** applyMask 결과 */
export interface MaskResult {
  /** 가린 마크다운 */
  readonly masked: string;
  /** 복원에 필요한 매핑(등장 순서) */
  readonly mappings: readonly MaskMapping[];
}
