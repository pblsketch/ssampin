/**
 * AI **서사 초안** 답 파서 — `자리 | 카테고리 | 1,3 | 이유 한 문장` 줄을 관대하게 읽는다(ADR-103 §5-5).
 *
 * 분류 제안 파서(`threadSuggestionParser`)와 같은 태도다: 모델은 형식을 시켜도 글머리표·번호·굵게·전각
 * 구분자를 섞는다. 그때마다 "읽지 못했습니다"가 뜨면 기능이 죽은 것처럼 보인다. 그래서 줄의 **뼈대**만
 * 남기고 꾸밈은 벗기되, **모르는 값은 조용히 버린다** — 잘못 놓는 것보다 덜 놓는 게 낫다.
 *
 * 특히 지키는 것 셋:
 *  1. **자리 이름은 화면 말이 아니라 저장값 4종으로만** 읽는다. 모델이 「특성」이라고 쓰면 생활 틀의
 *     첫 자리(motive)로 옮긴다 — 파서가 모르는 낱말을 요청서·저장값에 들여보내지 않는다.
 *  2. **카테고리는 그 틀 그 자리에 실제로 있는 것만** 받는다. 없으면 카테고리 없이 자리만 쓴다.
 *  3. **평가 장면은 하나**다. 둘 이상 오면 첫 것만 남긴다(교사 판단은 어느 구성에서도 한 번뿐).
 *
 * ★이 파일은 도메인이다. 외부 의존성 import 금지. 순수 함수만 둔다.
 */
import type { RecordModuleId } from '../entities/RecordWritingStyle';
import type { NarrativeRole } from './narrativeParagraphs';
import { NARRATIVE_NOTE_MAX } from '../entities/InquiryThread';
import type { MaskMapping } from '../privacy/types';
import { restoreModelText } from './redactOutbound';
import { FRAME_SLOTS, frameRoleLabels, type NarrativeFrameId } from './narrativeFrames';
import { RECORD_MODULES } from './recordStyleCatalog';

/** 놓을 것이 없을 때 모델이 쓰도록 정한 한 단어. */
export const NARRATIVE_SUGGEST_NONE_WORD = '없음';

/** 제안된 장면 하나. */
export interface NarrativeSceneSuggestion {
  readonly role: NarrativeRole;
  /** 그 틀 그 자리에 실제로 있는 카테고리일 때만 채운다. */
  readonly moduleId?: RecordModuleId;
  /** 모델이 쓴 이유 한 문장 — [적용] 때 **장면 메모로 저장한다**(오너 결정, `noteSource: 'ai'`). */
  readonly note?: string;
  readonly evidenceIds: readonly string[];
}

export type NarrativeSuggestFailure = 'empty-answer' | 'none' | 'no-format' | 'no-valid-scenes';

export const NARRATIVE_SUGGEST_FAILURE_LABELS: Readonly<Record<NarrativeSuggestFailure, string>> = {
  'empty-answer': 'AI 가 답을 주지 않았습니다.',
  none: 'AI 가 세울 만한 흐름을 찾지 못했습니다.',
  'no-format': 'AI 의 장면 배치 제안을 읽지 못했습니다. 다시 시도해 주세요.',
  'no-valid-scenes': '배치 제안이 가리키는 근거를 찾지 못했습니다. 다시 시도해 주세요.',
};

export interface NarrativeSuggestParseResult {
  readonly scenes: readonly NarrativeSceneSuggestion[];
  /** 장면이 하나라도 있으면 null. */
  readonly failure: NarrativeSuggestFailure | null;
  /** `없음` 일 때 모델이 덧붙인 이유. 별칭은 실명으로 되돌린다. */
  readonly reason?: string;
  /** 이음말 제안 — `이음 | 문장` 줄. 앞 주제가 있을 때만 화면이 쓴다. */
  readonly linkNote?: string;
}

export interface NarrativeSuggestParseInput {
  readonly frame: NarrativeFrameId;
  /** 꾸러미가 매긴 순번(1부터) → 근거 id. */
  readonly numbered: readonly string[];
  /** 꾸러미의 별칭 매핑. 있으면 이유 문장의 ［이름1］ 을 실명으로 되돌린다. */
  readonly mappings?: readonly MaskMapping[];
}

const SEPARATOR = /[|｜│¦]/;
const LEAD_DECOR = /^\s*(?:[-*•‣·]\s*)?(?:\(?\d+[.)]\s+)?/;
const QUOTES = /^[`"'“”‘’*_[\]\s]+|[`"'“”‘’*_[\]\s:：]+$/g;
const NUMBER_SPLIT = /[\s,，、·;；/]+/;
const NUMBER_TOKEN = /^#?(\d+)(?:번)?(?:\s*[-~〜–]\s*#?(\d+)(?:번)?)?$/;
const RANGE_MAX = 50;
/** `이음`·`연결`로 시작하는 줄 = 앞 주제와의 이음말. */
const LINK_WORDS: ReadonlySet<string> = new Set(['이음', '이음말', '연결', '연결고리']);

function toAsciiDigits(text: string): string {
  return text.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30));
}

function clean(text: string): string {
  return text.replace(LEAD_DECOR, '').replace(QUOTES, '').trim();
}

/**
 * 자리 이름 → 저장값 4종.
 *
 * ★화면 말(생활 틀의 「특성·장면·성장」)도 받아들이되 **저장값으로 옮겨** 돌려준다. 모델은 우리가
 *   보낸 화면 말을 그대로 돌려주기 때문이다. 그 낱말을 그대로 저장하면 요청서 표식이 4종을 벗어난다.
 */
export function roleFromWord(frame: NarrativeFrameId, word: string): NarrativeRole | null {
  const w = word.replace(/\s/g, '');
  if (w.length === 0) return null;
  const labels = frameRoleLabels(frame);
  for (const role of ['evaluation', 'motive', 'process', 'result'] as const) {
    if (labels[role].replace(/\s/g, '') === w) return role;
  }
  // 탐구 틀 이름은 어느 틀에서 왔든 받는다(모델이 섞어 쓴다).
  const inquiry = frameRoleLabels('inquiry');
  for (const role of ['evaluation', 'motive', 'process', 'result'] as const) {
    if (inquiry[role].replace(/\s/g, '') === w) return role;
  }
  if (w.startsWith('동기') || w.includes('질문')) return 'motive';
  if (w.startsWith('과정')) return 'process';
  if (w.startsWith('결과')) return 'result';
  if (w.startsWith('평가') || w.includes('교사')) return 'evaluation';
  return null;
}

/** 카테고리 이름 → 그 틀 그 자리의 요소 id. 그 자리에 없는 이름은 받지 않는다. */
export function moduleFromWord(
  frame: NarrativeFrameId,
  role: NarrativeRole,
  word: string,
): RecordModuleId | null {
  const w = word.replace(/\s/g, '');
  if (w.length === 0) return null;
  for (const id of FRAME_SLOTS[frame][role]) {
    if (RECORD_MODULES[id].label.replace(/\s/g, '') === w) return id;
  }
  return null;
}

function parseNumbers(text: string, max: number): number[] {
  const out: number[] = [];
  for (const token of toAsciiDigits(text).split(NUMBER_SPLIT)) {
    const m = NUMBER_TOKEN.exec(token.trim());
    if (!m) continue;
    const from = Number(m[1]);
    const to = m[2] === undefined ? from : Number(m[2]);
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    if (hi - lo > RANGE_MAX) continue;
    for (let n = lo; n <= hi; n += 1) {
      if (n >= 1 && n <= max && !out.includes(n)) out.push(n);
    }
  }
  return out;
}

export function parseNarrativeSuggestion(
  answer: string,
  input: NarrativeSuggestParseInput,
): NarrativeSuggestParseResult {
  const body = (answer ?? '').trim();
  if (body.length === 0) {
    return { scenes: [], failure: 'empty-answer' };
  }
  const restore = (t: string): string =>
    input.mappings === undefined || input.mappings.length === 0
      ? t
      : restoreModelText(t, input.mappings);

  const used = new Set<string>();
  const scenes: NarrativeSceneSuggestion[] = [];
  let sawEvaluation = false;
  let sawShape = false;
  let noneReason: string | undefined;
  let linkNote: string | undefined;

  for (const rawLine of body.split(/\r?\n/)) {
    const parts = rawLine.split(SEPARATOR);
    if (parts.length < 2) continue;
    const head = clean(parts[0] ?? '');
    if (head.length === 0) continue;

    // `없음 | 이유` — 오류가 아니라 "놓을 것이 없다".
    if (head.replace(/\s/g, '') === NARRATIVE_SUGGEST_NONE_WORD) {
      const why = clean(parts.slice(1).join('|'));
      if (why.length > 0) noneReason = restore(why);
      sawShape = true;
      continue;
    }
    // `이음 | 문장`
    if (LINK_WORDS.has(head.replace(/\s/g, ''))) {
      const note = clean(parts.slice(1).join('|'));
      if (note.length > 0) linkNote = restore(note).slice(0, NARRATIVE_NOTE_MAX);
      sawShape = true;
      continue;
    }

    const role = roleFromWord(input.frame, head);
    if (role === null) continue;
    sawShape = true;
    // 교사 판단은 어느 구성에서도 한 번뿐이다.
    if (role === 'evaluation') {
      if (sawEvaluation) continue;
      sawEvaluation = true;
    }

    const moduleId = moduleFromWord(input.frame, role, clean(parts[1] ?? ''));
    // 번호 칸은 셋째다. 다만 카테고리를 건너뛴 모델이 있어 **둘째 칸도 본다** —
    // 셋째에서 번호가 안 나오면 둘째를 쓴다(둘 다 없으면 근거 없는 자리다).
    const third = parseNumbers(parts[2] ?? '', input.numbered.length);
    const picked = third.length > 0 ? third : parseNumbers(parts[1] ?? '', input.numbered.length);
    // 넷째 칸까지 있는데 번호가 어디에도 없으면 셋째가 **비워 둔 번호 칸**이다 — 평가 자리는 비워 두라고
    //   시킨다(ADR-109). 그때 이유는 넷째 칸이다. 둘째를 번호 칸으로 보면 빈 칸이 이유 앞에 붙는다.
    const numberedAt = third.length > 0 || (picked.length === 0 && parts.length >= 4) ? 2 : 1;
    const evidenceIds: string[] = [];
    for (const n of picked) {
      const id = input.numbered[n - 1];
      // 한 근거는 한 장면에만. 두 번 나오면 앞 장면이 가진다.
      if (id === undefined || used.has(id)) continue;
      used.add(id);
      evidenceIds.push(id);
    }

    const rawNote = clean(parts.slice(numberedAt + 1).join('|'));
    // 이유 문장에도 별칭이 섞인다. 되돌린 뒤 상한까지만 남긴다(요청서로 다시 나가는 글이다).
    const note = rawNote.length > 0 ? restore(rawNote).slice(0, NARRATIVE_NOTE_MAX) : '';

    scenes.push({
      role,
      ...(moduleId === null ? {} : { moduleId }),
      ...(note.length > 0 ? { note } : {}),
      evidenceIds,
    });
  }

  if (scenes.length === 0) {
    if (noneReason !== undefined || (sawShape && !sawEvaluation)) {
      return {
        scenes: [],
        failure: 'none',
        ...(noneReason === undefined ? {} : { reason: noneReason }),
      };
    }
    return { scenes: [], failure: sawShape ? 'no-valid-scenes' : 'no-format' };
  }
  // 근거를 하나도 못 붙였으면 놓을 것이 없다 — 뼈대만 깔자고 AI 를 부르지는 않았다.
  if (used.size === 0) {
    return { scenes: [], failure: 'no-valid-scenes' };
  }

  return {
    scenes,
    failure: null,
    ...(linkNote === undefined ? {} : { linkNote }),
  };
}
