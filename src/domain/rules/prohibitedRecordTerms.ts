/**
 * 기재 금지 항목 탐지 — 생기부에 옮겨 적으면 안 되는 자료를 **AI 에 보내기 전에** 걸러낸다.
 *
 * ★왜 프롬프트가 아니라 여기인가: 실측에서 금지 항목을 시스템 프롬프트에 전부 열거하고
 * 사용자 턴 끝에 다시 강조해도 모델이 세특 본문에 그대로 옮겨 적었다(2/2 → 보강 후에도 2/2 실패,
 * `docs/03-analysis/record-draft-solar-quality.analysis.md` §3-2). 프롬프트로는 안 막힌다.
 * **안 보내면 못 쓴다** — 그래서 근거 창고 단계에서 표시하고 AI 전송에서 뺀다(ADR-072 결정 5).
 *
 * 근거: 2026 기재요령(훈령 제555호) 입력 금지 항목 — 교내외 대회·수상, 공인어학시험,
 * 인증시험·자격증, 모의고사·학력평가 성적, 논문·학회, 도서 출간, 특허, 해외 활동 실적,
 * 장학금, 방과후학교 활동, 부모·친인척의 직업이나 사회·경제적 지위, 구체적인 기관·학원명.
 *
 * 브릿지(`packages/core/src/grounding.ts`)의 고위험 어휘를 **미러**한다 — 본체는 브릿지를
 * import 하지 않는다(`RecordDraft.ts` 미러 방식 선례).
 *
 * ★이 파일은 도메인이다. 외부 의존성 import 금지, 순수 함수만 둔다.
 */

/**
 * 판정 결과의 갈래 — 화면에 "무엇 때문에 걸렸는지" 한국어로 알려주기 위한 값.
 */
export type ProhibitedCategory =
  | 'award' // 대회·수상
  | 'language' // 공인어학시험
  | 'certificate' // 인증시험·자격증
  | 'examScore' // 모의고사·학력평가 성적
  | 'academic' // 논문·학회·저서·특허
  | 'scholarship' // 장학금
  | 'afterSchool' // 방과후학교
  | 'institute' // 학원·사교육기관
  | 'overseas' // 해외 활동 실적
  | 'family'; // 부모·친인척의 직업·지위

/** 갈래 → 교사에게 보여줄 한국어 라벨. */
export const PROHIBITED_CATEGORY_LABELS: Readonly<Record<ProhibitedCategory, string>> = {
  award: '대회·수상',
  language: '공인어학시험',
  certificate: '인증시험·자격증',
  examScore: '모의고사·학력평가 성적',
  academic: '논문·학회·출간·특허',
  scholarship: '장학금',
  afterSchool: '방과후학교',
  institute: '학원·기관명',
  overseas: '해외 활동',
  family: '부모 직업·지위',
};

interface TermDef {
  readonly term: string;
  readonly category: ProhibitedCategory;
}

/**
 * 단독으로 걸리는 어휘 — 정상 업무 문장에서 이 말이 나올 일이 거의 없는 것만 넣는다.
 *
 * ⚠️ 여기 **'대상'·'등급'·'진단'은 일부러 넣지 않았다.**
 *  - `대상`: "분석 대상", "지원 대상 학생"처럼 학교에서 매우 흔하다. 상(賞)으로서의 대상은
 *    아래 `CONTEXT_TERMS` 에서 문맥과 함께 볼 때만 잡는다.
 *  - `등급`: 성취도 등급(A~E)은 **생기부 기재 항목이라 허용**된다(ADR-015 "길 A"). 막으면
 *    정상 근거가 통째로 잘린다. 모의고사 성적은 `모의고사`·`학력평가` 쪽에서 잡는다.
 *  - `진단`: "진단평가"가 학교에서 흔한 정상 업무어다. 기재 금지 항목도 아니다(고위험 어휘와
 *    기재 금지 항목은 다른 축이다 — 브릿지 쪽 `LEGACY_HIGH_RISK_TERMS` 와 목적이 다르다).
 */
const SIMPLE_TERMS: readonly TermDef[] = [
  // ── 대회·수상
  { term: '최우수상', category: 'award' },
  { term: '우수상', category: 'award' },
  { term: '장려상', category: 'award' },
  { term: '금상', category: 'award' },
  { term: '은상', category: 'award' },
  { term: '동상', category: 'award' },
  { term: '입상', category: 'award' },
  { term: '표창', category: 'award' },
  { term: '수상', category: 'award' },
  { term: '경진대회', category: 'award' },
  { term: '공모전', category: 'award' },
  { term: '경연', category: 'award' },
  { term: '올림피아드', category: 'award' },
  { term: '대회', category: 'award' },
  { term: '금메달', category: 'award' },
  // ── 공인어학시험
  { term: '공인어학', category: 'language' },
  { term: '토익', category: 'language' },
  { term: '토플', category: 'language' },
  { term: '텝스', category: 'language' },
  { term: '오픽', category: 'language' },
  { term: 'TOEIC', category: 'language' },
  { term: 'TOEFL', category: 'language' },
  { term: 'TEPS', category: 'language' },
  { term: 'OPIc', category: 'language' },
  { term: 'IELTS', category: 'language' },
  { term: 'HSK', category: 'language' },
  { term: 'JLPT', category: 'language' },
  // ── 인증시험·자격증
  { term: '자격증', category: 'certificate' },
  { term: '인증시험', category: 'certificate' },
  { term: '기능사', category: 'certificate' },
  { term: '산업기사', category: 'certificate' },
  // ── 모의고사·학력평가
  { term: '모의고사', category: 'examScore' },
  { term: '학력평가', category: 'examScore' },
  { term: '전국연합', category: 'examScore' },
  // ── 학술·출간·특허
  { term: '논문', category: 'academic' },
  { term: '학회', category: 'academic' },
  { term: '저서', category: 'academic' },
  { term: '출간', category: 'academic' },
  { term: '특허', category: 'academic' },
  { term: '지식재산권', category: 'academic' },
  // ── 장학금
  { term: '장학금', category: 'scholarship' },
  { term: '장학생', category: 'scholarship' },
  // ── 방과후학교
  { term: '방과후', category: 'afterSchool' },
  // ── 학원·사교육
  { term: '어학원', category: 'institute' },
  { term: '과외', category: 'institute' },
  { term: '학원', category: 'institute' },
  // ── 해외 활동
  { term: '해외봉사', category: 'overseas' },
  { term: '해외연수', category: 'overseas' },
  { term: '어학연수', category: 'overseas' },
];

/**
 * 앞에 이 말이 붙으면 **매칭을 취소**한다(오탐 차단).
 *
 * `대학원`이 `학원`으로 걸리는 것이 실제 사례다. "대학원 진학을 희망함"은 정상 서술이다.
 */
const CANCEL_PREFIXES: Readonly<Record<string, readonly string[]>> = {
  학원: ['대'], // 대학원
};

/** 상(賞)으로서의 '대상'만 잡기 위한 문맥 — 이 표현들과 함께 나올 때만 수상으로 본다. */
const AWARD_CONTEXT_FOR_DAESANG: readonly string[] = ['대상 수상', '대상을 수상', '대상을 받'];

/** 부모·친인척 지칭어. 단독으로는 정상 서술이라(예: "어머니와 상담") 직업어와 함께일 때만 잡는다. */
const FAMILY_WORDS: readonly string[] = [
  '아버지',
  '어머니',
  '아버님',
  '어머님',
  '부모님',
  '부친',
  '모친',
];

/** 직업·지위 어휘. 위 지칭어와 **같은 근거 안에** 있으면 부모 직업 기재로 본다. */
const OCCUPATION_WORDS: readonly string[] = [
  '직업',
  '회사',
  '근무',
  '사업',
  '임원',
  '대표',
  '사장',
  '의사',
  '변호사',
  '교수',
  '공무원',
  '연봉',
  '자영업',
];

/** 탐지 결과 한 건. */
export interface ProhibitedHit {
  /** 실제로 걸린 표현. */
  readonly term: string;
  readonly category: ProhibitedCategory;
}

/** `학원` 앞에 취소 접두사가 붙어 있는지(예: 대학원). */
function isCancelled(text: string, term: string, index: number): boolean {
  const prefixes = CANCEL_PREFIXES[term];
  if (!prefixes) return false;
  return prefixes.some((p) => index >= p.length && text.slice(index - p.length, index) === p);
}

/** 해당 어휘가 취소되지 않은 위치에서 한 번이라도 등장하는지. */
function occurs(text: string, term: string): boolean {
  let from = 0;
  for (;;) {
    const i = text.indexOf(term, from);
    if (i < 0) return false;
    if (!isCancelled(text, term, i)) return true;
    from = i + term.length;
  }
}

/**
 * 기재 금지 항목을 탐지한다. 걸린 표현 목록을 반환하고, 없으면 빈 배열이다.
 *
 * 순수 함수 — 같은 입력이면 언제나 같은 결과다.
 */
export function detectProhibitedTerms(text: string): ProhibitedHit[] {
  if (typeof text !== 'string' || text.length === 0) return [];
  const hits: ProhibitedHit[] = [];
  const seen = new Set<string>();

  const push = (term: string, category: ProhibitedCategory): void => {
    if (seen.has(term)) return;
    seen.add(term);
    hits.push({ term, category });
  };

  for (const def of SIMPLE_TERMS) {
    if (occurs(text, def.term)) push(def.term, def.category);
  }

  // 상으로서의 '대상' — 문맥이 있을 때만.
  for (const ctx of AWARD_CONTEXT_FOR_DAESANG) {
    if (text.includes(ctx)) {
      push('대상', 'award');
      break;
    }
  }

  // 부모 직업·지위 — 지칭어와 직업어가 함께 있을 때만.
  const family = FAMILY_WORDS.find((w) => text.includes(w));
  if (family !== undefined && OCCUPATION_WORDS.some((w) => text.includes(w))) {
    push(family, 'family');
  }

  return hits;
}

/** 기재 금지 항목이 하나라도 있는지(저장 시 자동 표시 판단용). */
export function hasProhibitedTerms(text: string): boolean {
  return detectProhibitedTerms(text).length > 0;
}

/** 걸린 갈래를 한국어 라벨로 묶어 준다(화면 안내용). 중복 없이 등장 순서를 보존한다. */
export function summarizeProhibited(hits: readonly ProhibitedHit[]): string[] {
  const out: string[] = [];
  const seen = new Set<ProhibitedCategory>();
  for (const h of hits) {
    if (seen.has(h.category)) continue;
    seen.add(h.category);
    out.push(PROHIBITED_CATEGORY_LABELS[h.category]);
  }
  return out;
}
