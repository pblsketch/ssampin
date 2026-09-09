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

// ────────────────────────────────────────────────────────────────────────────
// 대체어 — 낱말만 금지된 경우, 말을 바꿔 근거를 살린다 (2026-09-09 오너 요청)
// ────────────────────────────────────────────────────────────────────────────

/**
 * 왜 필요한가: "체육대회 준비물이 부족하자 자기 것을 먼저 빌려주고 마지막에 챙김."은
 * **수상 기록이 아니라 생활 장면**인데 '대회' 한 낱말 때문에 통째로 빠졌다(실측 2026-09-09).
 *
 * 근거(확인일 2026-09-09):
 * - 학교생활기록부 종합지원포털 Q&A: **'대회'는 수상경력을 제외한 어떤 항목에도 입력하지 않는다.**
 *   다만 창의적 체험활동 **누가기록**에는 '체육대회' 같은 명칭을 쓸 수 있다.
 *   https://star.moe.go.kr/web/contents/m30103.do?schM=view&id=15548
 * - 같은 포털: 학교가 주최한 **행사**(의식행사·발표회·**체육행사**·현장체험학습)는 성격에 맞는
 *   창의적 체험활동 영역에 넣어 입력할 수 있다.
 * - 울산 NEIS 자문단 Q&A(전담자 답변): **"운동회" 또는 "체육행사"** 로 명칭을 계획해 운영하면
 *   문제없고, **교내상이 계획되지 않은** 프로그램이면 관찰한 사실로 특기사항을 쓸 수 있다.
 *   https://m.cafe.daum.net/neisulsan/AXxH/2455
 *
 * ★그래서 이 대체는 **낱말 교체이지 면죄부가 아니다.** 시상 계획이 있던 프로그램이라면 이름을
 *   바꿔도 기재할 수 없다. 앱은 그것을 알 수 없으므로 **바꿨다는 사실과 주의를 화면에 적는다**
 *   (조용히 바꾸지 않는다).
 * ★수상 결과를 가리키는 말이 함께 있으면 **아예 바꾸지 않는다.** 그건 진짜 수상 기록이다.
 */
export interface TermSubstitution {
  readonly from: string;
  readonly to: string;
}

/**
 * ★**표를 아주 좁게 둔다.** 처음에는 일반 규칙(`대회` → `행사`)을 넣었는데, 테스트가 바로 잡았다:
 *   그러면 **'경진대회'가 '경진행사'가 되어 필터를 통과한다.** 시상을 전제한 이름을 말만 바꿔
 *   내보내는 것은 규정 우회다.
 *
 * ★그래서 **공식 안내가 대체 명칭을 명시한 것만** 넣는다. 지금은 체육대회 한 짝이다
 *   (포털의 행사 예시에 '체육행사'가 있고, NEIS 자문단 답변이 '운동회·체육행사'를 권한다).
 * ★나머지 `대회` 는 그대로 제외하되, 화면이 **선생님께 고쳐 적는 법을 알려 준다**
 *   (`rewriteHintFor`). 시상 계획이 있었는지는 선생님만 안다 — 앱이 대신 판단하지 않는다.
 */
export const PROHIBITED_SUBSTITUTIONS: readonly TermSubstitution[] = [
  { from: '체육대회', to: '체육행사' },
];

/**
 * 수상 **결과**를 가리키는 말. 하나라도 있으면 대체하지 않는다.
 * ★금지어 목록(`SIMPLE_TERMS`)과 따로 둔다 — 여기 있는 '우승'·'1등'은 다른 자리에서 정상 서술일
 *   수 있어 금지어로 올리면 오탐이 는다. **대체를 막는 조건**으로만 쓴다.
 */
const AWARD_RESULT_WORDS: readonly string[] = [
  '수상',
  '입상',
  '상장',
  '시상',
  '최우수상',
  '우수상',
  '장려상',
  '금상',
  '은상',
  '동상',
  '대상',
  '우승',
  '준우승',
  '메달',
  '트로피',
  '1등',
  '일등',
  '1위',
];

export interface SubstitutionResult {
  /** 바꾼 뒤의 글. 아무것도 안 바뀌었으면 원문과 같다. */
  readonly text: string;
  /** 실제로 바꾼 짝(중복 없이 등장 순서). */
  readonly applied: readonly TermSubstitution[];
}

/**
 * 금지어를 대체어로 바꿔 본다.
 *
 * - 수상 결과를 가리키는 말이 함께 있으면 **하나도 바꾸지 않는다**(진짜 수상 기록이다).
 * - 바꾼 뒤에도 다른 금지 항목이 남아 있으면, 부르는 쪽이 그대로 제외하면 된다.
 *   이 함수는 판단하지 않고 **바꾼 결과와 무엇을 바꿨는지**만 돌려준다.
 */
export function substituteProhibited(text: string): SubstitutionResult {
  if (typeof text !== 'string' || text.length === 0) return { text, applied: [] };
  if (AWARD_RESULT_WORDS.some((w) => text.includes(w))) return { text, applied: [] };
  let out = text;
  const applied: TermSubstitution[] = [];
  for (const sub of PROHIBITED_SUBSTITUTIONS) {
    if (!out.includes(sub.from)) continue;
    out = out.split(sub.from).join(sub.to);
    applied.push(sub);
  }
  return { text: out, applied };
}

/** 화면에 보여 줄 한 줄 — "바꿔 보낸 말 N건 (체육대회 → 체육행사)". 없으면 빈 문자열. */
export function summarizeSubstitutions(applied: readonly TermSubstitution[]): string {
  if (applied.length === 0) return '';
  const pairs = applied.map((s) => `${s.from} → ${s.to}`).join(' · ');
  return `바꿔 보낸 말 ${applied.length}건 (${pairs})`;
}

/**
 * 제외된 근거를 **선생님이 직접 살릴 수 있는 경우** 그 방법을 알려 준다.
 *
 * ★앱이 대신 바꾸지 않는다. '대회'가 든 활동을 기재할 수 있는지는 **시상 계획이 있었는가**로
 *   갈리는데, 그건 교육계획서를 아는 선생님만 판단할 수 있다.
 */
export function rewriteHintFor(hits: readonly ProhibitedHit[]): string {
  if (hits.some((h) => h.term === '대회')) {
    return "'대회'라는 말은 수상경력 말고는 어디에도 적을 수 없어요. 상을 주지 않은 행사였다면 '체육행사'·'발표회'·'○○ 활동'처럼 이름을 바꿔 적으시면 이 근거를 쓸 수 있어요.";
  }
  return '';
}
