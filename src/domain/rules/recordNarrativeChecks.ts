/**
 * 생기부 초안 **서사 품질** 점검 — 오너 자료가 정의한 "나쁜 세특" 유형을 로컬 규칙으로 잡는다.
 *
 * ★왜 AI 가 아니라 규칙인가: `ssampin-record-check`(저장소 밖)가 AI 맞춤법 검사를 실측으로
 * 탈락시키고 로컬 규칙으로 결론 냈다. 같은 정신이다 — 전부 결정론적이고 오프라인이며, 같은
 * 입력이면 언제나 같은 결과다. 초안 저장 때마다 도는 검사라 네트워크·비용·지연이 없어야 한다.
 *
 * ★기존 점검(`checkGrounding`·`detectProhibitedTerms`)이 못 보던 축이다. 그것들은 "근거에 없는 말을
 * 지어냈나"·"기재 금지 항목이 남았나"를 보는데, 여기서 보는 것은 **문장이 그 학생의 것인가**다.
 *
 * ★막지 않는다. flag 만 단다(ADR-072 결정 5-b). 자동 판정은 오탐이 나고, 이 앱은 모든 초안에 교사
 * 최종 검토를 강제한다. 판단은 사람에게 남긴다.
 *
 * ★재료가 없으면 **검사를 건너뛴다**(`skipped`). "6종 다 보고 깨끗함"과 "재료가 없어 3종을 못 봄"은
 * 교사에게 다른 말이다 — 둘을 똑같이 "경고 0"으로 보이면 안 된다.
 *
 * 판정 기준의 출처(저장소 밖 오너 자료를 분석 문서가 옮겨 적은 것):
 * `docs/03-analysis/record-draft-flow-v2-inquiry-thread.analysis.md` §2 K1·K2·K3·K7·K8·K9·K14, §7 표.
 *
 * 브릿지(`packages/core/src/grounding.ts`)가 이 파일을 **미러**한다(본체가 정본, 본체는 브릿지를
 * import 하지 않는다 — `prohibitedRecordTerms.ts` 선례). 양쪽 어휘가 어긋나면 안 된다:
 * `narrativeLexiconFingerprint()` 를 양쪽 테스트가 같은 상수와 대조한다.
 *
 * ★이 파일은 도메인이다. 외부 의존성 import 금지, 순수 함수만 둔다.
 */
import { recordDraftFlagLabel } from './recordDraftFlagLabels';

/** 점검 코드. `RecordDraft.groundingFlags` 에 그대로 실리고 화면이 라벨로 바꿔 보여 준다. */
export type NarrativeFlagCode =
  | 'standard_text_copied' // K1 성취기준 원문을 옮겨 적음
  | 'shared_boilerplate' // K7·K14 다른 학생 초안과 같은 문장
  | 'generic_praise' // K8 장면 없는 일반 평가 나열
  | 'activity_list_no_question' // K2·K3 활동만 나열되고 질문이 없음
  | 'change_without_basis' // K9 시기 대비 근거 없는 변화 서사
  | 'unobservable_inner_state'; // 관찰 불가 내면 표현

export const NARRATIVE_FLAG_CODES: readonly NarrativeFlagCode[] = [
  'standard_text_copied',
  'shared_boilerplate',
  'generic_praise',
  'activity_list_no_question',
  'change_without_basis',
  'unobservable_inner_state',
];

/** 걸린 검사 하나 — 무엇이 걸렸는지(`detail`)까지 줘야 교사가 어디를 고칠지 안다. */
export interface NarrativeFlag {
  readonly code: NarrativeFlagCode;
  /** 교사용 한국어 라벨(`recordDraftFlagLabels.ts` 정본). */
  readonly label: string;
  /** 무엇이 걸렸고 무엇을 하면 되는지 한 줄. */
  readonly detail: string;
}

/** 재료가 없어 **돌지 않은** 검사. 경고 0 과 구별해서 보여 주기 위한 값이다. */
export interface NarrativeSkip {
  readonly code: NarrativeFlagCode;
  readonly reason: string;
}

/** 변화 서사의 근거로 인정할 관찰 메타 — 호출자가 **해당 학생·해당 영역**만 골라 넘긴다. */
export interface NarrativeEvidenceBasis {
  /** 근거에 붙은 관찰 슬롯. 담임 슬롯 `변화` 가 있으면 시기 대비가 관찰된 것으로 본다. */
  readonly slots?: readonly string[];
  /** 근거 일자(YYYY-MM-DD). 서로 다른 날짜의 간격으로 시기 대비를 본다. */
  readonly dates?: readonly string[];
}

export interface NarrativeCheckInput {
  /** 초안 본문. */
  readonly content: string;
  /**
   * 생기부 영역(`RecordArea`). 초등 교과학습발달상황(`subjectDev`)은 성취기준 도달도를 "이해함"으로
   * 적는 것이 공식 기재 문법이라 내면 표현 검사를 건너뛴다. 미지정이면 검사한다.
   */
  readonly area?: string;
  /**
   * 이 초안이 딛고 선 성취기준 **원문**(T3 번들). 없으면 복사 검사를 건너뛴다.
   * ★원문은 이 검사와 화면 표시에만 쓴다 — AI 에는 보내지 않는다(보내면 그대로 옮겨 적는다).
   */
  readonly standardTexts?: readonly string[];
  /** 같은 반·같은 영역의 **다른 학생** 초안 본문. 없으면 공통 문구 검사를 건너뛴다. */
  readonly peerContents?: readonly string[];
  /** 근거 메타. `undefined` 면 변화 근거 검사를 건너뛴다(모르는 것을 없는 것으로 치지 않는다). */
  readonly evidenceBasis?: NarrativeEvidenceBasis;
}

export interface NarrativeCheckResult {
  readonly flags: readonly NarrativeFlag[];
  readonly skipped: readonly NarrativeSkip[];
}

// ─────────────────────────── 임계값(전부 이름을 붙여 둔다) ───────────────────────────

/** 성취기준 복사 판정 — 어절 몇 개가 연속으로 같으면 옮겨 적은 것으로 보는가. */
export const STANDARD_COPY_NGRAM = 4;
/**
 * 공통 문구 판정 — 다른 학생 문장과의 bigram 유사도(교집합/합집합) 하한.
 *
 * 지어낸 문장쌍으로 실제 값을 재서 골랐다(2026-09-04):
 *  - 어미만 바꾼 복붙 0.77 · 낱말 하나 바꾼 복붙 0.75~0.82  ← 잡아야 하는 쪽
 *  - 같은 소재를 각자 쓴 문장 0.47 · 서로 다른 초안 0.06~0.12  ← 놓아 줘야 하는 쪽
 * 두 무리 사이가 넓게 벌어져 있어 그 사이인 0.70 을 잡았다. 0.85 로는 진짜 복붙을 놓쳤다.
 */
export const BOILERPLATE_SIMILARITY = 0.7;
/** 공통 문구 판정 대상 문장의 최소 크기. */
export const BOILERPLATE_MIN_WORDS = 4;
export const BOILERPLATE_MIN_CHARS = 12;
/** 첫 문장은 더 짧아도 본다 — 모든 학생에게 똑같이 붙는 도입부가 곧 공통 문구다. */
export const BOILERPLATE_FIRST_MIN_WORDS = 3;
export const BOILERPLATE_FIRST_MIN_CHARS = 8;
/** 일반 평가 나열 판정 — 장면 없는 절이 몇 개 연속이면 나열로 보는가. */
export const GENERIC_RUN_MIN = 2;
/** 활동 나열 판정 — 서로 다른 활동 명사 몇 종부터 나열로 보는가. */
export const ACTIVITY_KIND_MIN = 3;
/**
 * 변화 근거 판정 — 서로 다른 근거 날짜의 간격이 며칠 이상이면 시기 대비로 보는가.
 *
 * ⚠️ **아직 보정되지 않은 수다.** 한 학기(약 4.5개월) 안에서 30일은 그럴듯한 하한이라 골랐다.
 * 원 분석(§7)은 "두 학기 날짜"라고 적었지만 세특은 대개 한 학기 문서라 그 기준이면 `꾸준히` 가 든
 * 정상 초안이 전부 경고를 단다. 실패 방향은 **미탐**(무관한 두 관찰이 변화 서사를 통과시킴)이라
 * 막지 않는 이 기능의 성격과 충돌하지 않는다. 하네스 결과로 보정할 것.
 */
export const CHANGE_BASIS_MIN_SPAN_DAYS = 30;
/** 변화 근거로 인정하는 담임 슬롯(`observationSlots.ts` 의 `변화`). */
export const CHANGE_BASIS_SLOT = '변화';
/** 내면 표현 검사를 건너뛰는 영역 — 초등 교과학습발달상황. */
export const UNOBSERVABLE_EXEMPT_AREAS: readonly string[] = ['subjectDev'];

// ─────────────────────────── 어휘(양쪽 미러가 값까지 같아야 한다) ───────────────────────────

/**
 * 일반 평가 어휘(K8) — 등급으로 이미 증명된 말들. **다른 학생에게 옮겨도 말이 되는** 표현이다.
 * 이 말이 들어 있다는 것만으로는 걸지 않는다 — 같은 절에 구체 장면이 없을 때만 본다.
 */
const GENERIC_PRAISE_TERMS: readonly string[] = [
  '성실',
  '이해력이 뛰어',
  '수업 태도가 바',
  '태도가 바르',
  '책임감이 강',
  '적극적',
  '열심히',
  '모범적',
  '근면',
  '예의 바르',
  '원만',
  '착실',
  '바른 인성',
  '밝고 명랑',
  '리더십이 뛰어',
  '학업 능력이 우수',
  '우수한 학생',
];

/**
 * 구체 장면 표지 — 이게 있으면 그 절은 "그 학생의 장면"으로 본다.
 *
 * ⚠️ **활동 명사(보고서·발표·실험…)는 일부러 넣지 않았다.** "발표에 적극적으로 임하며" 처럼
 * 활동 이름만 대는 것은 장면이 아니다. 장면을 만드는 것은 **무엇을 어떻게 했는가**(행동 동사)와
 * 날짜·수량·인용이다. 활동 명사를 표지로 넣으면 K8 의 전형적인 문장이 그대로 통과해 버린다.
 */
const SCENE_ACTION_STEMS: readonly string[] = [
  '설명',
  '비교',
  '분석',
  '측정',
  '설계',
  '수정',
  '제안',
  '반박',
  '지적',
  '계산',
  '요약',
  '구분',
  '작성',
  '적용',
  '연결',
  '검증',
  '정리',
  '제출',
  '조사하',
  '찾아',
  '만들',
  '그려',
  '세우',
  '뒤집',
  '바꾸',
  '고쳐',
  '물어',
  '되물',
];

/** 날짜·차시 표기. */
const SCENE_DATE_RE =
  /\d{4}-\d{2}-\d{2}|\d{1,2}월\s?\d{1,2}일|\d{1,2}월|\d{1,2}차시|\d{1,2}주차|\d{1,2}학기/;
/** 수량 표기 — "30명", "2차", "3회". */
const SCENE_QUANTITY_RE = /\d+\s*(명|개|회|차|번|시간|분|쪽|건|편|점|가지)/;
/** 학생의 말을 그대로 옮긴 자리. */
const SCENE_QUOTE_RE = /["'“”‘’]/;

/**
 * 활동 명사(K2) — 겉으로 한 일의 이름.
 *
 * ⚠️ **'조사'는 일부러 뺐다.** 국어 문법 용어("조사의 쓰임을 구분함")와 구별할 수 없다.
 * 조사 활동은 `조사하`(행동 동사) 쪽에서 장면으로 잡힌다.
 */
const ACTIVITY_NOUNS: readonly string[] = [
  '보고서',
  '실험',
  '발표',
  '토론',
  '설문',
  '제작',
  '프로젝트',
  '포스터',
  '견학',
  '캠페인',
];

/** 질문 표지(K3) — 활동을 잇는 접착제. 하나도 없으면 나열이다. */
const QUESTION_MARKERS: readonly string[] = ['궁금', '의문', '질문', '되물', '왜'];

/**
 * `왜` 매칭 취소 접미 — `왜곡`·`왜소`는 질문이 아니다.
 * (`prohibitedRecordTerms.ts` 의 `대학원`≠`학원` 가드와 같은 방식.)
 */
const QUESTION_CANCEL_SUFFIX: Readonly<Record<string, readonly string[]>> = {
  왜: ['곡', '소', '란', '적', '색'],
};

/** 변화·지속 어휘(K9) — 시기 대비 근거가 있을 때만 쓸 수 있는 말. */
const CHANGE_TERMS: readonly string[] = [
  '점차',
  '점점',
  '꾸준히',
  '갈수록',
  '지속적으로',
  '매번',
  '차츰',
];

/** 관찰 불가 내면 표현 → 행동 동사 대체 제안. 어미까지 붙여 둬야 `이해관계`·`함양군`에 안 걸린다. */
const UNOBSERVABLE_SUGGESTIONS: Readonly<Record<string, string>> = {
  이해함: '설명함 · 구분함 · 비교함',
  이해하게: '설명하게',
  이해하는: '설명하는',
  파악함: '정리해 제시함',
  파악하는: '정리해 제시하는',
  '알게 됨': '설명함',
  '알게 되었': '설명함',
  깨달음: '스스로 짚어 말함',
  깨닫게: '스스로 짚어 말하게',
  '흥미를 느': '이어서 질문함 · 자료를 찾아봄',
  '호기심을 가': '질문을 이어 감',
  '자신감을 얻': '먼저 발표를 맡음',
  함양함: '실제로 한 일로 적기',
  함양하게: '실제로 한 일로 적기',
  성장함: '무엇이 달라졌는지 장면으로 적기',
};

// ─────────────────────────── 공통 도구(순수) ───────────────────────────

const PUNCT_RE = /[.,!?;:()[\]{}"'“”‘’·…—–-]/g;

function norm(s: string): string {
  return s.normalize('NFC');
}

/** 어절 — 공백으로 자르고 문장부호를 턴다. */
function words(text: string): string[] {
  return norm(text)
    .split(/\s+/)
    .map((w) => w.replace(PUNCT_RE, ''))
    .filter((w) => w.length > 0);
}

/** 문장 — 종결부호·줄바꿈 기준. */
function sentences(text: string): string[] {
  return norm(text)
    .split(/(?:[.!?。]|\n)+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * 절 — 문장을 쉼표와 연결어미로 더 자른다.
 *
 * ★세특은 "~하고, ~하며" 로 길게 이어진 한 문장이 흔하다. 문장 단위로만 보면 "장면 없는 절이
 * 연속" 이라는 판정이 거의 성립하지 않아 K8 을 놓친다(미탐).
 */
const CLAUSE_CONNECTIVES = /(하고|하며|하여|하였으며|했으며|이며|지만|으나|면서|고서)\s+/g;
const CLAUSE_MARK = '\ue000';

function clauses(text: string): string[] {
  const out: string[] = [];
  for (const s of sentences(text)) {
    const marked = s.replace(CLAUSE_CONNECTIVES, `$1${CLAUSE_MARK}`);
    for (const c of marked.split(/[,、]\s*|\ue000/)) {
      const t = c.trim();
      if (t.length > 0) out.push(t);
    }
  }
  return out;
}

/** 공백을 턴 bigram 집합. 브릿지 `claimCoverage` 와 같은 방식이다. */
function bigrams(s: string): Set<string> {
  const t = norm(s).replace(/\s+/g, '');
  const set = new Set<string>();
  for (let i = 0; i + 1 < t.length; i += 1) set.add(t.slice(i, i + 2));
  return set;
}

/** 두 문장의 bigram 자카드 유사도(0~1). 어미 한 글자만 바꾼 복붙은 정확 일치로는 못 잡는다. */
function similarity(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter += 1;
  return inter / (A.size + B.size - inter);
}

/** 취소 접미를 뺀 등장 여부(`왜곡`의 `왜`는 세지 않는다). */
function occursWithoutCancel(text: string, term: string): boolean {
  const cancels = QUESTION_CANCEL_SUFFIX[term];
  if (cancels === undefined) return text.includes(term);
  let from = 0;
  for (;;) {
    const i = text.indexOf(term, from);
    if (i < 0) return false;
    const next = text.slice(i + term.length, i + term.length + 1);
    if (!cancels.includes(next)) return true;
    from = i + term.length;
  }
}

function hasSceneMarker(clause: string): boolean {
  if (SCENE_DATE_RE.test(clause)) return true;
  if (SCENE_QUANTITY_RE.test(clause)) return true;
  if (SCENE_QUOTE_RE.test(clause)) return true;
  return SCENE_ACTION_STEMS.some((v) => clause.includes(v));
}

/** 'YYYY-MM-DD' → 일 단위 정수. 형식이 아니면 null. */
function dayNumber(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m === null) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(t) ? null : Math.floor(t / 86_400_000);
}

function flag(code: NarrativeFlagCode, detail: string): NarrativeFlag {
  return { code, label: recordDraftFlagLabel(code), detail };
}

// ─────────────────────────── 검사 6종 ───────────────────────────

/**
 * K1 성취기준 복사 — 초안과 성취기준 원문이 어절 4개 연속으로 같으면 옮겨 적은 것으로 본다.
 * 원문이 없으면 판정하지 않는다(`null`).
 */
export function checkStandardCopy(
  content: string,
  standardTexts: readonly string[] | undefined,
): NarrativeFlag | null {
  const texts = (standardTexts ?? []).filter((t) => typeof t === 'string' && t.trim().length > 0);
  if (texts.length === 0) return null;
  const draft = words(content);
  if (draft.length < STANDARD_COPY_NGRAM) return null;

  const standardGrams = new Set<string>();
  for (const t of texts) {
    const w = words(t);
    for (let i = 0; i + STANDARD_COPY_NGRAM <= w.length; i += 1) {
      standardGrams.add(w.slice(i, i + STANDARD_COPY_NGRAM).join(' '));
    }
  }
  if (standardGrams.size === 0) return null;

  for (let i = 0; i + STANDARD_COPY_NGRAM <= draft.length; i += 1) {
    const gram = draft.slice(i, i + STANDARD_COPY_NGRAM).join(' ');
    if (standardGrams.has(gram)) {
      return flag(
        'standard_text_copied',
        `성취기준 문장과 "${gram}" 이(가) 그대로 겹칩니다. 성취기준은 키워드만 쓰고, ` +
          `그 위에서 이 학생이 무엇을 했는지로 바꿔 주세요.`,
      );
    }
  }
  return null;
}

/**
 * K7·K14 공통 입력 문구 — 같은 반 다른 학생 초안과 같은 문장이 있으면 그 문장은 평가되지 않는다.
 * 비교 대상은 호출자가 넘긴다(같은 영역·같은 반·다른 학생). 없으면 판정하지 않는다.
 */
export function checkSharedBoilerplate(
  content: string,
  peerContents: readonly string[] | undefined,
): NarrativeFlag | null {
  const peers = (peerContents ?? []).filter((c) => typeof c === 'string' && c.trim().length > 0);
  if (peers.length === 0) return null;
  const mine = sentences(content);
  if (mine.length === 0) return null;
  const peerSentences = peers.flatMap((p) => sentences(p));
  if (peerSentences.length === 0) return null;

  for (let i = 0; i < mine.length; i += 1) {
    const s = mine[i] as string;
    const first = i === 0;
    const minWords = first ? BOILERPLATE_FIRST_MIN_WORDS : BOILERPLATE_MIN_WORDS;
    const minChars = first ? BOILERPLATE_FIRST_MIN_CHARS : BOILERPLATE_MIN_CHARS;
    if (words(s).length < minWords) continue;
    if (s.replace(/\s+/g, '').length < minChars) continue;
    for (const p of peerSentences) {
      if (similarity(s, p) < BOILERPLATE_SIMILARITY) continue;
      return flag(
        'shared_boilerplate',
        `"${s}" 이(가) 같은 반 다른 학생 초안에도 거의 그대로 있습니다. ` +
          `다른 학생에게 옮겨도 말이 되는 문장은 이 학생을 설명하지 못합니다.`,
      );
    }
  }
  return null;
}

/** K8 일반 평가 나열 — 장면 없는 일반 평가 절이 연속으로 이어질 때. */
export function checkGenericPraise(content: string): NarrativeFlag | null {
  const cs = clauses(content);
  let run = 0;
  let hits: string[] = [];
  for (const c of cs) {
    const generic = GENERIC_PRAISE_TERMS.some((t) => c.includes(t)) && !hasSceneMarker(c);
    if (!generic) {
      run = 0;
      hits = [];
      continue;
    }
    run += 1;
    hits.push(c);
    if (run >= GENERIC_RUN_MIN) {
      return flag(
        'generic_praise',
        `"${hits.join(' / ')}" 처럼 장면 없는 평가가 이어집니다. ` +
          `성실함·태도는 등급으로 이미 드러나므로, 그렇게 본 장면 하나를 대신 적어 주세요.`,
      );
    }
  }
  return null;
}

/** K2·K3 활동 나열 — 활동 이름만 여럿이고 학생의 질문이 하나도 없을 때. */
export function checkActivityList(content: string): NarrativeFlag | null {
  const text = norm(content);
  const kinds = ACTIVITY_NOUNS.filter((n) => text.includes(n));
  if (kinds.length < ACTIVITY_KIND_MIN) return null;
  const hasQuestion = QUESTION_MARKERS.some((m) => occursWithoutCancel(text, m));
  if (hasQuestion) return null;
  return flag(
    'activity_list_no_question',
    `활동이 ${kinds.length}가지(${kinds.join('·')}) 나열됐는데 학생의 질문이 없습니다. ` +
      `활동을 잇는 것은 호기심입니다 — 하나를 골라 어떤 의문에서 시작했는지로 다시 써 주세요.`,
  );
}

/**
 * K9 변화 서사 근거 — `꾸준히`·`점차` 는 시기 대비가 관찰된 경우에만 쓸 수 있다.
 * 근거 메타를 모르면 판정하지 않는다(`undefined` → `null`).
 */
export function checkChangeBasis(
  content: string,
  basis: NarrativeEvidenceBasis | undefined,
): NarrativeFlag | null {
  if (basis === undefined) return null;
  const text = norm(content);
  const used = CHANGE_TERMS.filter((t) => text.includes(t));
  if (used.length === 0) return null;

  if ((basis.slots ?? []).includes(CHANGE_BASIS_SLOT)) return null;

  const days = (basis.dates ?? [])
    .map((d) => (typeof d === 'string' ? dayNumber(d) : null))
    .filter((n): n is number => n !== null);
  const unique = [...new Set(days)];
  if (unique.length >= 2) {
    const span = Math.max(...unique) - Math.min(...unique);
    if (span >= CHANGE_BASIS_MIN_SPAN_DAYS) return null;
  }

  return flag(
    'change_without_basis',
    `"${used.join('·')}" 같은 변화 표현이 있는데 시기를 견줄 근거가 없습니다. ` +
      `관찰에 '${CHANGE_BASIS_SLOT}' 슬롯을 붙이거나 ${CHANGE_BASIS_MIN_SPAN_DAYS}일 이상 떨어진 ` +
      `근거를 더한 뒤 쓰거나, 변화 표현을 빼 주세요.`,
  );
}

/** 관찰 불가 내면 표현 — 행동 동사로 바꿀 자리를 알려 준다. */
export function checkUnobservableInnerState(content: string, area?: string): NarrativeFlag | null {
  if (area !== undefined && UNOBSERVABLE_EXEMPT_AREAS.includes(area)) return null;
  const text = norm(content);
  const hits: string[] = [];
  for (const term of Object.keys(UNOBSERVABLE_SUGGESTIONS)) {
    if (text.includes(term)) hits.push(term);
  }
  if (hits.length === 0) return null;
  const shown = hits
    .slice(0, 3)
    .map((t) => `${t} → ${UNOBSERVABLE_SUGGESTIONS[t] ?? ''}`)
    .join(' / ');
  return flag(
    'unobservable_inner_state',
    `속마음은 볼 수 없습니다. 행동으로 바꿔 주세요 — ${shown}.`,
  );
}

// ─────────────────────────── 통합 ───────────────────────────

/**
 * 6종을 한 번에 돌린다. **막지 않는다** — 부르는 쪽은 결과를 flag 로만 쓴다.
 *
 * 재료가 없어 돌지 못한 검사는 `skipped` 로 돌려준다. 부르는 쪽이 "깨끗함"과 "안 봤음"을
 * 구별해 보여 줄 수 있어야 한다.
 */
export function checkRecordNarrative(input: NarrativeCheckInput): NarrativeCheckResult {
  const flags: NarrativeFlag[] = [];
  const skipped: NarrativeSkip[] = [];
  const content = typeof input.content === 'string' ? input.content : '';
  if (content.trim().length === 0) return { flags: [], skipped: [] };

  const push = (f: NarrativeFlag | null): void => {
    if (f !== null) flags.push(f);
  };

  if ((input.standardTexts ?? []).length === 0) {
    skipped.push({
      code: 'standard_text_copied',
      reason: '연결된 성취기준 원문이 없어 복사 여부를 보지 못했습니다.',
    });
  } else {
    push(checkStandardCopy(content, input.standardTexts));
  }

  if ((input.peerContents ?? []).length === 0) {
    skipped.push({
      code: 'shared_boilerplate',
      reason: '견줄 다른 학생 초안이 없어 공통 문구 여부를 보지 못했습니다.',
    });
  } else {
    push(checkSharedBoilerplate(content, input.peerContents));
  }

  push(checkGenericPraise(content));
  push(checkActivityList(content));

  if (input.evidenceBasis === undefined) {
    skipped.push({
      code: 'change_without_basis',
      reason: '근거 자료를 아직 읽지 못해 변화 서사의 근거를 보지 못했습니다.',
    });
  } else {
    push(checkChangeBasis(content, input.evidenceBasis));
  }

  if (input.area !== undefined && UNOBSERVABLE_EXEMPT_AREAS.includes(input.area)) {
    skipped.push({
      code: 'unobservable_inner_state',
      reason: '교과학습발달상황은 성취기준 도달도를 그렇게 적는 것이 기재 문법이라 건너뜁니다.',
    });
  } else {
    push(checkUnobservableInnerState(content, input.area));
  }

  return { flags, skipped };
}

/** 걸린 코드만 뽑는다 — `RecordDraft.groundingFlags` 는 문자열 배열이다. */
export function narrativeFlagCodes(result: NarrativeCheckResult): NarrativeFlagCode[] {
  return result.flags.map((f) => f.code);
}

// ─────────────────────────── 미러 대조용 지문 ───────────────────────────

/**
 * 어휘·임계값 지문 — 본체와 브릿지가 **같은 값**을 들고 있는지 확인하는 알람.
 *
 * ⚠️ **보증이 아니다.** 양쪽을 같이 고치면 지문도 같이 바뀌어 초록이 된다. 이것이 잡는 것은
 * "한쪽만 몰래 고쳤다" 뿐이다. 저장소가 갈라져 있어 CI 에서는 실제 파일 대조가 아예 돌지 않는다
 * (브릿지 파일이 체크아웃에 없다) — 진짜 대조는 두 저장소가 다 있는 개발 PC 에서만 돈다.
 */
export function narrativeLexiconFingerprint(): string {
  const payload = JSON.stringify([
    NARRATIVE_FLAG_CODES,
    GENERIC_PRAISE_TERMS,
    SCENE_ACTION_STEMS,
    ACTIVITY_NOUNS,
    QUESTION_MARKERS,
    QUESTION_CANCEL_SUFFIX,
    CHANGE_TERMS,
    UNOBSERVABLE_SUGGESTIONS,
    UNOBSERVABLE_EXEMPT_AREAS,
    [
      STANDARD_COPY_NGRAM,
      BOILERPLATE_SIMILARITY,
      BOILERPLATE_MIN_WORDS,
      BOILERPLATE_MIN_CHARS,
      BOILERPLATE_FIRST_MIN_WORDS,
      BOILERPLATE_FIRST_MIN_CHARS,
      GENERIC_RUN_MIN,
      ACTIVITY_KIND_MIN,
      CHANGE_BASIS_MIN_SPAN_DAYS,
      CHANGE_BASIS_SLOT,
    ],
    NARRATIVE_FLAG_CODES.map((c) => recordDraftFlagLabel(c)),
  ]);
  // FNV-1a 32bit — 암호 용도가 아니라 값 변경 알람용이다.
  let h = 0x811c9dc5;
  for (let i = 0; i < payload.length; i += 1) {
    const cp = payload.charCodeAt(i);
    h = Math.imul(h ^ (cp & 0xff), 0x01000193) >>> 0;
    h = Math.imul(h ^ (cp >>> 8), 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
