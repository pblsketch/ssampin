/**
 * 2022 개정 교육과정 성취기준 번들의 모양.
 *
 * 실제 자료는 같은 폴더의 `curriculumStandards.elementary.json` ·
 * `curriculumStandards.secondary.json` 이고, `scripts/fetch-curriculum-standards.mjs` 가 만든다.
 * 손으로 고치지 않는다 — 고칠 일이 있으면 스크립트를 고치고 다시 돌린다.
 *
 * ⚠️ **원문(`text`)은 AI 로 보내지 않는다.** 화면에 보여 주기와 "성취기준을 그대로 옮겨 적었는지"
 *    검사에만 쓴다. AI 에게 가는 것은 `keywords` 뿐이다. 원문을 근거와 함께 실으면 모델이
 *    그대로 베껴 써서 성취기준 복사형 세특이 나온다(오너 결정 2026-09-04).
 */

/** 학교급. 성취기준 자료가 나뉘는 단위이자 목록을 좁히는 첫 번째 축이다. */
export type StandardSchoolLevel = 'elementary' | 'middle' | 'high';

/** 성취기준 하나. */
export interface CurriculumStandard {
  /** 성취기준 코드. 대괄호까지 포함한다 — 예: `[9수02-15]` */
  readonly code: string;
  /**
   * 고시 원문. 비어 있을 수 있다(추출 실패).
   * ⚠️ AI 로 보내지 않는다. 화면 표시와 복사 검사 전용.
   */
  readonly text: string;
  /** 원문에서 뽑은 **명사 핵심어**. 서술어("이해하고", "그릴 수 있다")는 들어 있지 않다. */
  readonly keywords: readonly string[];
  /** 과목명 — 예: `수학`, `공통국어1`, `경제 수학` */
  readonly subject: string;
  /** 교과(군) — 예: `수학`, `국어`. 과목이 잘게 나뉜 고교에서 묶어 보여 줄 때 쓴다. */
  readonly subjectGroup: string;
  /** 영역 — 예: `변화와 관계` */
  readonly domain: string;
  /** 학년군 — `1-2` `3-4` `5-6` `7-9` `10` `10-12` */
  readonly gradeBand: string;
  readonly schoolLevel: StandardSchoolLevel;
  /** 출처 id — `sources` 표의 열쇠 */
  readonly source?: string;
  /** 출처 PDF 쪽 번호 */
  readonly page?: number;
  /**
   * 원문이 다단 PDF 에서 열이 뒤섞여 뽑힌 자료. 화면은 원문 대신 "원문 추출이 불완전합니다"를
   * 보여 주고, 키워드도 비어 있다. 코드·과목·영역은 멀쩡하므로 목록에는 그대로 나온다.
   */
  readonly textBroken?: boolean;
}

/** 원문이 어느 고시·별책의 몇 쪽에서 왔는지. */
export interface CurriculumStandardSource {
  /** 예: `[별책8] 교육과정` */
  readonly label: string;
  /** 예: `교육부 고시 제2022-33호` */
  readonly notice: string;
  /** 이 별책을 쓰는 교과(군) — 자료에서 뽑은 것이라 추측이 아니다. */
  readonly groups?: readonly string[];
  /** 국가교육과정정보센터(NCIC) 첨부 번호 */
  readonly ncicSeq?: string;
  /** 원본 PDF 의 SHA-256 (추적용) */
  readonly sha256?: string;
}

export interface CurriculumStandardsBundle {
  readonly schema: 1;
  readonly generatedAt: string;
  readonly revision: '2022';
  readonly scope: 'elementary' | 'secondary';
  readonly package: {
    readonly name: string;
    readonly version: string;
    readonly license: string;
    readonly datasetGeneratedAt: string | null;
  };
  /** 출처·라이선스 고지. 화면 어딘가에 그대로 보여 줄 수 있는 문장이다. */
  readonly notice: string;
  readonly keywordTool: string;
  readonly sources: Readonly<Record<string, CurriculumStandardSource>>;
  readonly standards: readonly CurriculumStandard[];
}
