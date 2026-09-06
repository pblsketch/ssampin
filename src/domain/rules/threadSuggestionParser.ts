/**
 * AI 분류 제안 답 파서 — `주제명 | 1,3,5` 줄을 관대하게 읽는다(ADR-085 §6-3).
 *
 * 관대한 이유: 모델은 형식을 시켜도 글머리표·번호·굵게·전각 구분자·"3번" 같은 꾸밈을 섞는다.
 * 그때마다 "제안을 읽지 못했습니다"가 뜨면 기능이 죽은 것처럼 보인다. 그래서 줄의 **뼈대(제목 | 번호들)**만
 * 남기고 나머지는 벗긴다. 반대로 번호가 범위 밖이거나 이미 쓰인 것은 조용히 버린다 — 잘못 묶는 것보다 덜 묶는 게 낫다.
 *
 * 읽지 못했을 때는 빈 목록과 **이유**를 돌려준다. 화면은 이유별로 다른 말을 한다(`THREAD_SUGGEST_FAILURE_LABELS`).
 *
 * ★이 파일은 도메인이다. 외부 의존성 import 금지. 순수 함수만 둔다.
 */
import type { MaskMapping } from '../privacy/types';
import { restoreModelText } from './redactOutbound';

/** 묶을 것이 없을 때 모델이 쓰도록 정한 한 단어(꾸러미가 지시하고, 파서가 형식 오류와 구분한다). */
export const THREAD_SUGGEST_NONE_WORD = '없음';

/** 주제 이름 자리에 왔지만 주제가 아닌 말들(공백 제거 기준) — 이런 줄은 "묶을 것 없음"으로 읽는다. */
const NON_TOPIC_WORDS: ReadonlySet<string> = new Set([
  THREAD_SUGGEST_NONE_WORD,
  '없습니다',
  '해당없음',
  '기타',
  '미분류',
  '분류불가',
]);

/** 한 줄의 제안 — 주제 이름(실명 복원됨)과 근거 id 들. */
export interface ThreadSuggestion {
  readonly title: string;
  /** 기존 주제와 이름이 같으면 그 id, 아니면 null(새 주제). */
  readonly threadId: string | null;
  readonly evidenceIds: readonly string[];
}

/**
 * 왜 하나도 못 읽었는가.
 * - `empty-answer`: 답이 비었다(모델이 아무것도 안 줌).
 * - `none`: 모델이 "없음"이라고 답했다 — 오류가 아니라 "묶을 게 없다".
 * - `no-format`: `주제명 | 번호` 모양의 줄이 하나도 없다.
 * - `no-valid-numbers`: 모양은 맞는데 번호가 전부 범위 밖·중복이라 남는 근거가 없다.
 */
export type ThreadSuggestFailure = 'empty-answer' | 'none' | 'no-format' | 'no-valid-numbers';

export const THREAD_SUGGEST_FAILURE_LABELS: Readonly<Record<ThreadSuggestFailure, string>> = {
  'empty-answer': 'AI 가 답을 주지 않았습니다.',
  none: 'AI 가 묶을 만한 기록을 찾지 못했습니다.',
  'no-format': '제안을 읽지 못했습니다. 다시 시도해 주세요.',
  'no-valid-numbers': '제안이 가리키는 기록을 찾지 못했습니다. 다시 시도해 주세요.',
};

export interface ThreadSuggestParseResult {
  readonly suggestions: readonly ThreadSuggestion[];
  /** 제안이 하나라도 있으면 null. */
  readonly failure: ThreadSuggestFailure | null;
  /**
   * `none` 일 때 모델이 덧붙인 이유(`없음 | 이유 한 문장`). 별칭은 실명으로 되돌려 준다.
   * 화면이 "왜 못 묶었는지"를 말해 막다른 길이 되지 않게 한다(설계서 board-v2 §4-6). 이유가 없으면 칸도 없다.
   */
  readonly reason?: string;
}

export interface ThreadSuggestParseInput {
  /** 꾸러미가 매긴 순번(1부터) → 근거 id. */
  readonly numbered: readonly string[];
  /** 기존 주제 — 이름이 같으면 그 주제로 본다. */
  readonly threads: readonly { readonly id: string; readonly title: string }[];
  /** 꾸러미의 별칭 매핑. 있으면 주제 이름의 ［이름1］ 을 실명으로 되돌린다. */
  readonly mappings?: readonly MaskMapping[];
}

/** 구분자: 반각 `|`, 전각 `｜`, 상자 그리기 `│`, 깨진 세로줄 `¦`. */
const SEPARATOR = /[|｜│¦]/;
/** 줄머리 꾸밈: 글머리표, "1." "1)" "(1)" 같은 순번, 마크다운 굵게·따옴표. */
const LEAD_DECOR = /^\s*(?:[-*•‣·]\s*)?(?:\(?\d+[.)]\s+)?/;
const QUOTES = /^[`"'“”‘’*_\s]+|[`"'“”‘’*_\s:：]+$/g;
/** 번호 토큰 사이 구분: 공백, 반각·전각 쉼표, 가운뎃점, 세미콜론, 빗금. */
const NUMBER_SPLIT = /[\s,，、·;；/]+/;
/** `3`, `3번`, `#3`, `1-3`, `1~3`, `1〜3` — 범위는 앞·뒤 번호를 다 넣는다. */
const NUMBER_TOKEN = /^#?(\d+)(?:번)?(?:\s*[-~〜–]\s*#?(\d+)(?:번)?)?$/;
/** 범위 하나가 이보다 넓으면 오타로 보고 버린다(모델이 "1-100" 처럼 쓰는 경우). */
const RANGE_MAX = 50;
/** 구분자 없이 "없음: 이유" · "없음 - 이유" · "없음. 이유" 처럼 붙인 줄. */
const NONE_WITH_REASON = new RegExp(
  `^${THREAD_SUGGEST_NONE_WORD}\\s*[:\uff1a\\-\u2013\u2014.,]\\s*(.+)$`,
);

/** 전각 숫자(０-９) → 반각. 다른 글자는 그대로. */
function toAsciiDigits(text: string): string {
  return text.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30));
}

/** 이름 비교용 — 공백·대소문자 차이를 무시한다. */
function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, '').toLowerCase();
}

function parseNumbers(text: string, max: number): number[] {
  const out: number[] = [];
  for (const tok of toAsciiDigits(text).split(NUMBER_SPLIT)) {
    if (tok.length === 0) continue;
    const m = NUMBER_TOKEN.exec(tok);
    if (!m) continue;
    const from = Number(m[1]);
    const to = m[2] === undefined ? from : Number(m[2]);
    if (!Number.isInteger(from) || !Number.isInteger(to)) continue;
    if (to < from || to - from > RANGE_MAX) continue;
    for (let n = from; n <= to; n += 1) {
      if (n >= 1 && n <= max) out.push(n);
    }
  }
  return out;
}

/**
 * 모델 답을 읽는다.
 *
 * - 같은 근거가 두 주제에 나오면 먼저 나온 주제가 가진다. 번호가 범위 밖이면 그 번호만 버린다.
 * - 같은 주제 이름이 여러 줄이면 한 제안으로 합친다.
 * - 코드 펜스(```)·빈 줄·구분자 없는 줄은 건너뛴다.
 */
export function parseThreadSuggestions(
  answer: string,
  input: ThreadSuggestParseInput,
): ThreadSuggestParseResult {
  if (answer.trim().length === 0) return { suggestions: [], failure: 'empty-answer' };

  const mappings = input.mappings ?? [];
  const existingByKey = new Map<string, { id: string; title: string }>();
  for (const t of input.threads) existingByKey.set(normalizeTitle(t.title), t);

  const byKey = new Map<string, { title: string; threadId: string | null; ids: string[] }>();
  const order: string[] = [];
  const taken = new Set<string>();
  let sawFormat = false;
  let sawNone = false;
  let noneReason = '';
  /** "없음" 뒤에 붙은 이유 — 첫 문장만, 별칭은 실명으로. */
  const noteReason = (text: string): void => {
    const t = text.replace(QUOTES, '').trim();
    if (t.length === 0 || noneReason.length > 0) return;
    noneReason = mappings.length > 0 ? restoreModelText(t, mappings).trim() : t;
  };

  for (const rawLine of answer.split(/\r?\n/)) {
    const line = rawLine.replace(LEAD_DECOR, '').trim();
    if (line.length === 0 || line.startsWith('```')) continue;

    const sepAt = line.search(SEPARATOR);
    if (sepAt < 0) {
      // 구분자 없는 줄 — "없음" 한 줄이면 그 뜻으로 읽는다("없음: 이유"처럼 이유가 붙어도). 나머지는 머리말로 보고 버린다.
      const bare = line.replace(QUOTES, '');
      if (NON_TOPIC_WORDS.has(normalizeTitle(bare))) {
        sawNone = true;
        continue;
      }
      const m = NONE_WITH_REASON.exec(bare);
      if (m) {
        sawNone = true;
        noteReason(m[1] ?? '');
      }
      continue;
    }
    const rawTitle = line.slice(0, sepAt).replace(QUOTES, '').trim();
    const rawNumbers = line.slice(sepAt + 1);
    if (rawTitle.length === 0) continue;
    if (NON_TOPIC_WORDS.has(normalizeTitle(rawTitle))) {
      sawNone = true;
      noteReason(rawNumbers);
      continue;
    }
    sawFormat = true;

    const ids: string[] = [];
    for (const n of parseNumbers(rawNumbers, input.numbered.length)) {
      const id = input.numbered[n - 1];
      if (id === undefined || taken.has(id)) continue;
      taken.add(id);
      ids.push(id);
    }
    if (ids.length === 0) continue;

    const title = mappings.length > 0 ? restoreModelText(rawTitle, mappings).trim() : rawTitle;
    const key = normalizeTitle(title);
    const existing = existingByKey.get(key);
    const bucket = byKey.get(key);
    if (bucket) {
      bucket.ids.push(...ids);
    } else {
      byKey.set(key, { title: existing?.title ?? title, threadId: existing?.id ?? null, ids });
      order.push(key);
    }
  }

  const suggestions = order.map((k): ThreadSuggestion => {
    const b = byKey.get(k);
    return { title: b?.title ?? '', threadId: b?.threadId ?? null, evidenceIds: b?.ids ?? [] };
  });
  if (suggestions.length > 0) return { suggestions, failure: null };
  if (sawFormat) return { suggestions, failure: 'no-valid-numbers' };
  if (!sawNone) return { suggestions, failure: 'no-format' };
  return noneReason.length > 0
    ? { suggestions, failure: 'none', reason: noneReason }
    : { suggestions, failure: 'none' };
}
