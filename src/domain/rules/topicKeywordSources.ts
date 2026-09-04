/**
 * 주제(탐구 흐름) 이름 후보와 매칭 키워드의 **원천** — 순수 함수.
 *
 * 두 갈래를 섞지 않는다(오너 결정 2026-09-04):
 *  - **주제 이름 후보**: ① 수행평가 이름 → ② 과제 제목 → ③ 성취기준 핵심 키워드.
 *    교사가 평가계획서에 이미 정해 둔 이름이라 학기 내내 같은 말로 부른다.
 *  - **매칭 키워드**: 루브릭 **요소** 이름("자료 해석", "주장의 명확성")·성취기준 핵심어. 주제 이름이
 *    아니라 "이것도 이 주제?" 를 띄우는 문자열 검사용이다.
 *
 * 성취기준 **원문 문장**은 어느 쪽에도 넣지 않는다 — 원문을 AI 에 실으면 모델이 그대로 옮겨 적어
 * "성취기준 복사형" 세특이 된다(실측 C 사례와 같은 기전). 키워드만 쓴다.
 *
 * 이 파일은 T0 가 시그니처를 고정하고, T2(근거 창고 주제 분류)가 쓰며, T3(성취기준 번들)가
 * `standardKeywords` 원천을 채운다. 입력은 엔티티 그대로가 아니라 **필요한 이름만 뽑은 얇은 형태**라
 * 어느 쪽도 상대 파일을 import 하지 않는다.
 */

/** 주제 이름 후보 하나 — 어디서 왔는지(출처)와 함께 준다. 화면이 출처별로 묶어 보여 줄 수 있다. */
export interface TopicTitleCandidate {
  readonly title: string;
  readonly source: 'assessment' | 'assignment' | 'standard';
}

export interface TopicTitleSources {
  /** 수행평가 이름 — `AssessmentPlanItem.title` · `Rubric.title`. */
  readonly assessmentTitles?: readonly string[];
  /** 과제 제목 — `Assignment.title`. */
  readonly assignmentTitles?: readonly string[];
  /** 성취기준 핵심 키워드(원문 아님) — T3 가 번들 데이터에서 준다. 없으면 빈 배열. */
  readonly standardKeywords?: readonly string[];
}

function cleanUnique(values: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values ?? []) {
    const t = v.trim();
    if (t.length === 0 || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * 주제 이름 후보 — 출처 우선순위 순(수행평가 → 과제 → 성취기준)으로, 중복은 앞 출처를 남긴다.
 */
export function topicTitleCandidates(sources: TopicTitleSources): TopicTitleCandidate[] {
  const seen = new Set<string>();
  const out: TopicTitleCandidate[] = [];
  const push = (titles: readonly string[] | undefined, source: TopicTitleCandidate['source']) => {
    for (const title of cleanUnique(titles)) {
      if (seen.has(title)) continue;
      seen.add(title);
      out.push({ title, source });
    }
  };
  push(sources.assessmentTitles, 'assessment');
  push(sources.assignmentTitles, 'assignment');
  push(sources.standardKeywords, 'standard');
  return out;
}

export interface TopicKeywordSources {
  /** 루브릭 **요소** 이름 — 주제 이름이 아니라 매칭용. */
  readonly rubricCriterionNames?: readonly string[];
  /** 성취기준 핵심 키워드(원문 아님). */
  readonly standardKeywords?: readonly string[];
  /** 교사가 직접 적은 키워드. */
  readonly manual?: readonly string[];
}

/** 매칭 키워드 — 정리·중복 제거만 한다. 순서는 입력 순(교사 직접 입력이 앞이면 앞). */
export function topicMatchKeywords(sources: TopicKeywordSources): string[] {
  return cleanUnique([
    ...(sources.manual ?? []),
    ...(sources.rubricCriterionNames ?? []),
    ...(sources.standardKeywords ?? []),
  ]);
}

/* ──────────────────── 성취기준 키워드 원천 (T3) ──────────────────── */

/**
 * 성취기준 코드 목록 → 그 성취기준의 **핵심 키워드**를 주는 함수.
 *
 * 실제 구현은 `curriculumStandardRules.standardKeywords` 이고, 화면이 그것을 감아 넘겨준다.
 * 여기서 자료를 직접 읽지 않고 **함수 하나로 받는** 이유는 이 규칙 파일이 성취기준 자료 파일을
 * 몰라야 하기 때문이다 — 자료가 1.5MB 라 필요할 때만 따로 읽어 들이는데(`useCurriculumStandards`),
 * 이 파일이 그것을 직접 import 하면 그 덩어리가 앱 첫 화면에 딸려 들어온다.
 */
export type StandardKeywordLookup = (codes: readonly string[]) => readonly string[];

/**
 * 성취기준 코드에서 **키워드만** 뽑아 온다. 주제 이름 후보(③)와 매칭 키워드가 이것을 받는다.
 *
 * ⚠️ 여기로 나오는 것은 명사 키워드뿐이고 **원문 문장은 절대 아니다.** 원문("일차함수의 개념을
 * 이해하고, 그 그래프를 그릴 수 있다")을 근거에 실으면 모델이 그대로 옮겨 적어 성취기준
 * 복사형 세특이 된다(오너 결정 2026-09-04). 나가는 것은 `일차함수`·`그래프` 같은 낱말뿐이다.
 */
export function standardKeywordsFromCodes(
  lookup: StandardKeywordLookup | undefined,
  codes: readonly string[] | undefined,
): string[] {
  if (lookup === undefined || codes === undefined || codes.length === 0) return [];
  return cleanUnique(lookup(codes));
}

/**
 * 본문에 든 키워드 — "이것도 이 주제?" 제안의 근거. 문자열 포함 검사(AI 없음).
 * 두 글자 미만 키워드는 아무 데나 걸리므로 제외한다(예: '수').
 */
export function matchedKeywords(text: string, keywords: readonly string[]): string[] {
  if (text.trim().length === 0) return [];
  const hay = text.replace(/\s+/g, '');
  return cleanUnique(keywords).filter((k) => k.length >= 2 && hay.includes(k.replace(/\s+/g, '')));
}
