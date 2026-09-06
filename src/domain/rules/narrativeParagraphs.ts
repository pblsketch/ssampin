/**
 * 서사 역할 형광펜 — 초안 문단이 무엇(동기·과정·결과·평가)인지 표시하는 어휘와 파서(순수).
 *
 * 왜 영역 무관 공통 4종인가(오너 결정 2026-09-06, ADR-085): 교과 세특이든 담임 행특이든 좋은 글의
 * 골격은 같다 — 무엇에서 출발했고(동기·질문) → 무엇을 했고(과정) → 무엇이 나왔고(결과) → 교사가
 * 무엇을 봤나(평가). 영역마다 어휘를 갈라 두면 선생님이 외울 것이 늘고 색의 뜻이 화면마다 달라진다.
 *
 * 표식 주체는 AI 다. `recordDraftPack` 이 문단 첫머리에 `[동기]` 류 표식을 붙여 달라고 지시하고, 이
 * 파서가 표식을 떼어 역할과 **순수 텍스트**로 나눈다. ★저장되는 `RecordDraft.content` 에는 표식이
 * 남지 않는다 — NEIS 에 복사해 넣는 글이다.
 *
 * ★이 파일은 도메인이다. 외부 의존성 import 금지.
 */

export type NarrativeRole = 'motive' | 'process' | 'result' | 'evaluation';

export const NARRATIVE_ROLES: readonly NarrativeRole[] = [
  'motive',
  'process',
  'result',
  'evaluation',
];

/** 범례·툴팁용 한국어 라벨. */
export const NARRATIVE_ROLE_LABELS: Readonly<Record<NarrativeRole, string>> = {
  motive: '동기·질문',
  process: '과정',
  result: '결과',
  evaluation: '교사 평가',
};

/** 모델에게 요구하는 표식 낱말(정본). 파서는 이보다 관대하게 읽는다. */
export const NARRATIVE_ROLE_MARKS: Readonly<Record<NarrativeRole, string>> = {
  motive: '동기',
  process: '과정',
  result: '결과',
  evaluation: '평가',
};

/** 문단 하나 — 역할(없으면 null)과 표식을 뗀 본문. */
export interface NarrativeParagraph {
  readonly role: NarrativeRole | null;
  readonly text: string;
}

/**
 * 저장용 문단 표식 — [반영] 시점의 문단별 역할. 문단 순서가 곧 대응이므로 역할 없는 문단도 `null` 로 남긴다
 * (빼면 뒤 문단의 색이 한 칸씩 밀린다).
 */
export interface RoleMark {
  readonly role: NarrativeRole | null;
  readonly text: string;
}

/**
 * 모델이 쓸 법한 표식 낱말 → 역할. 정본 낱말 외에 흔한 변형을 받는다(실측 전 관대하게, 설계서 §12).
 * 키는 공백을 뺀 형태로 비교한다.
 */
const MARK_WORDS: Readonly<Record<string, NarrativeRole>> = {
  동기: 'motive',
  질문: 'motive',
  '동기·질문': 'motive',
  '동기/질문': 'motive',
  동기질문: 'motive',
  과정: 'process',
  탐구과정: 'process',
  활동: 'process',
  결과: 'result',
  성과: 'result',
  평가: 'evaluation',
  교사평가: 'evaluation',
  '교사 평가': 'evaluation',
  교사의평가: 'evaluation',
};

/**
 * 문단 첫머리 표식 — `[동기]` `【동기】` `(동기)` `〔동기〕` `<동기>` 를 허용하고, 표식 뒤의 공백·콜론을 함께 뗀다.
 * 표식은 **첫머리에만** 인정한다. 본문 중간의 "(결과)" 는 글의 일부다.
 */
const MARK_HEAD =
  /^\s*(?:\[([^\]\n]{1,12})\]|【([^】\n]{1,12})】|\(([^)\n]{1,12})\)|〔([^〕\n]{1,12})〕|<([^>\n]{1,12})>)\s*[:：]?\s*/;

function roleOfWord(word: string): NarrativeRole | null {
  const key = word.replace(/\s+/g, '');
  return MARK_WORDS[key] ?? MARK_WORDS[word.trim()] ?? null;
}

/** 문단 나누기 — 빈 줄 하나 이상. 빈 줄이 없으면 줄바꿈 단위로 나눈다(모델이 한 줄에 한 문단을 쓰는 경우). */
export function splitParagraphs(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  if (normalized.length === 0) return [];
  const byBlank = normalized
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (byBlank.length > 1) return byBlank;
  return normalized
    .split('\n')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * 표식 파서 — 문단 분리 → 첫머리 표식 추출·제거 → `{ role, text }[]`.
 *
 * - 표식이 없는 문단은 `role: null`, 본문 그대로.
 * - 표식 낱말을 모르면(예: `[서론]`) 표식으로 보지 않고 본문에 남긴다 — 모르는 말을 지우지 않는다.
 * - 같은 문단에 표식이 두 번 오면(`[동기] [과정] …`) 첫 것만 역할이 되고 두 번째도 뗀다(한 문단 하나 원칙).
 */
export function parseNarrativeParagraphs(text: string): NarrativeParagraph[] {
  return splitParagraphs(text).map((raw) => {
    let body = raw;
    let role: NarrativeRole | null = null;
    // 첫머리에 연달아 붙은 표식을 전부 뗀다(첫 것이 역할).
    for (let guard = 0; guard < 3; guard += 1) {
      const m = MARK_HEAD.exec(body);
      if (!m) break;
      const word = m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? '';
      const r = roleOfWord(word);
      if (r === null) break; // 모르는 낱말 — 표식이 아니다.
      if (role === null) role = r;
      body = body.slice(m[0].length);
    }
    return { role, text: body.trim() };
  });
}

/**
 * 표식을 뗀 순수 본문 — 저장·복사용. ★문단은 **공백 하나**로 잇는다.
 * 생기부(NEIS)는 줄바꿈 없는 한 덩어리 글이다(오너 결정 2026-09-06).
 */
export function stripNarrativeMarks(text: string): string {
  return parseNarrativeParagraphs(text)
    .map((p) => p.text.trim())
    .filter((t) => t.length > 0)
    .join(' ');
}

/** 문단 목록 → 저장용 표식(순서 보존, 역할 없는 문단은 null). */
export function roleMarksOf(paragraphs: readonly NarrativeParagraph[]): RoleMark[] {
  return paragraphs.map((p) => ({ role: p.role, text: p.text }));
}

/** 표식이 하나라도 있나 — 없으면 화면이 "표식 없음" 한 줄을 보여 준다. */
export function hasAnyRole(paragraphs: readonly NarrativeParagraph[]): boolean {
  return paragraphs.some((p) => p.role !== null);
}

/**
 * 형광펜 한 구간 — 본문이 표식과 같으면 `exact`, 교사가 고쳤으면 `stale`(같은 색을 흐리게), 표식이 없으면 `null`.
 *
 * ★문단 단위로 맞추던 예전 함수(`alignRoleMarks`)는 지웠다. 생기부 본문이 줄바꿈 없는 한 덩어리가 되면서
 * "i번째 문단 ↔ i번째 표식" 대응이 성립하지 않는다. `alignRoleMarksInline` 하나만 쓴다.
 */
export interface HighlightedParagraph {
  readonly text: string;
  readonly role: NarrativeRole | null;
  readonly match: 'exact' | 'stale' | null;
}

function normalizeForCompare(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * [다시 표시] 답이 원문과 같은 글인가 — 모델이 문장을 고쳐 보내면 표식을 받지 않는다(본문은 불변이어야 한다).
 *
 * ★**문단 수로 견주지 않는다.** 저장되는 본문은 한 덩어리인데 모델은 문단으로 답하므로, 문단 수를 견주면
 * 1 대 N 이 되어 [다시 표시]가 늘 실패한다. 이어 붙인 글끼리 공백을 무시하고 견준다.
 */
export function sameNarrativeBody(
  original: string,
  remarked: readonly NarrativeParagraph[],
): boolean {
  const a = normalizeForCompare(original);
  const b = normalizeForCompare(remarked.map((p) => p.text).join(' '));
  return a.length > 0 && a === b;
}

/**
 * 편집 칸의 현재 글과 저장된 표식을 맞춘다 — **문단 나누기에 기대지 않고 표식 본문을 순서대로 찾아** 구간을 만든다.
 *
 * 왜 이 방식인가: 생기부 본문은 줄바꿈 없는 한 덩어리라 "i번째 문단 ↔ i번째 표식" 대응이 성립하지 않는다.
 * 표식의 본문을 앞에서부터 차례로 찾으면 **줄바꿈이 있든 없든 같게** 동작해, 빈 줄이 든 옛 초안도 색이 맞는다.
 *
 * - 찾은 구간은 `exact`(진한 색).
 * - 못 찾은 표식은 **연속된 것끼리 묶어**, 직전에 찾은 구간의 끝부터 다음에 찾은 구간의 시작까지를 그 묶음의
 *   첫 역할로 `stale`(흐린 색) 칠한다. 교사가 고친 자리다.
 * - 어느 표식에도 걸리지 않은 나머지는 색이 없다.
 */
export function alignRoleMarksInline(
  currentText: string,
  marks: readonly RoleMark[] | undefined,
): HighlightedParagraph[] {
  if (currentText.length === 0) return [];
  if (!marks || marks.length === 0) return [{ text: currentText, role: null, match: null }];

  /** 찾은 표식의 자리(본문 인덱스). 못 찾은 것은 없음. */
  const anchors: { readonly index: number; readonly end: number; readonly mark: RoleMark }[] = [];
  /** 앵커 사이에 낀, 못 찾은 표식들. 키 = 뒤따르는 앵커 번호(마지막이면 anchors.length). */
  const orphans = new Map<number, RoleMark[]>();
  let pos = 0;
  for (const mark of marks) {
    const body = mark.text.trim();
    const at = body.length > 0 ? currentText.indexOf(body, pos) : -1;
    if (at < 0) {
      const bucket = orphans.get(anchors.length);
      if (bucket) bucket.push(mark);
      else orphans.set(anchors.length, [mark]);
      continue;
    }
    anchors.push({ index: at, end: at + body.length, mark });
    pos = at + body.length;
  }

  const out: HighlightedParagraph[] = [];
  const push = (
    text: string,
    role: NarrativeRole | null,
    match: 'exact' | 'stale' | null,
  ): void => {
    if (text.length > 0) out.push({ text, role, match });
  };
  /** 앵커 앞의 빈 자리 — 못 찾은 표식이 있으면 그 역할로 흐리게, 없으면 색 없음. */
  const gap = (from: number, to: number, slot: number): void => {
    if (to <= from) return;
    const orphan = orphans.get(slot)?.find((m) => m.role !== null);
    push(currentText.slice(from, to), orphan?.role ?? null, orphan?.role ? 'stale' : null);
  };

  let cursor = 0;
  anchors.forEach((a, i) => {
    gap(cursor, a.index, i);
    push(currentText.slice(a.index, a.end), a.mark.role, a.mark.role === null ? null : 'exact');
    cursor = a.end;
  });
  gap(cursor, currentText.length, anchors.length);
  return out;
}

/** AI 가 문단마다 붙일 표식 지시 — `recordDraftPack` 과 [다시 표시]가 같은 문장을 쓴다. */
export const NARRATIVE_MARK_INSTRUCTION =
  '문단마다 줄 첫머리에 그 문단의 역할을 [동기] [과정] [결과] [평가] 중 하나로 표시하세요. ' +
  '표식은 문단 첫머리에만, 한 문단에 하나만 씁니다. 문단 사이는 빈 줄로 나눕니다.';
