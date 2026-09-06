/**
 * AI 분류 제안 꾸러미 — 미분류 근거를 "이렇게 묶으면 어떨까요"까지만 묻는다(ADR-085, ADR-083 수정 2).
 *
 * 지키는 선:
 *  - 제안은 화면에 점선(고스트)으로만 뜨고, [적용] 전에는 **아무것도 저장되지 않는다.** 이 파일은 저장을 모른다.
 *  - 근거 본문이 밖으로 나가므로 **생기부 초안 꾸러미(`recordDraftPack`)와 같은 규칙**을 같은 순서로 쓴다:
 *    선생님 제외 → 빈 내용 → 기재 금지 → 분량 초과. 실명·학번은 한 세션으로 가린다(같은 학생 = 같은 별칭).
 *    성취기준 원문은 싣지 않는다.
 *  - 출력 형식은 줄마다 `주제명 | 근거번호,근거번호`. 번호는 이 꾸러미가 매긴 1부터의 순번이다.
 *    묶을 것이 없으면 `없음 | 이유 한 문장` — 화면이 이유를 보여 막다른 길이 되지 않게(설계서 board-v2 §4-6).
 *    답을 읽는 쪽은 `rules/threadSuggestionParser.ts`.
 *  - 기록 하나뿐이어도 뚜렷한 활동이면 주제로 제안한다(오너 결정 2026-09-06 R2). 억지 묶기는 여전히 금지.
 *  - 기록 줄에 날짜·출처·태그를 실어 묶을 단서를 늘린다. 출처·태그도 같은 세션으로 가린다(이름이 섞일 수 있다).
 *
 * ★이 파일은 도메인이다. 외부 의존성 import 금지.
 */
import { detectProhibitedTerms, summarizeProhibited } from '../rules/prohibitedRecordTerms';
import { createMaskSession } from '../privacy/maskEngine';
import type { KeywordGroup, MaskMapping } from '../privacy/types';
import { redactQuestion } from '../rules/redactOutbound';
import { THREAD_SUGGEST_NONE_WORD } from '../rules/threadSuggestionParser';
import {
  DRAFT_PACK_MAX_EVIDENCE_CHARS,
  type DraftPackEvidence,
  type DraftPackExclusion,
} from './recordDraftPack';

/**
 * 근거 한 건 — 초안 꾸러미와 같은 모양에 출처·태그를 더한다(둘 다 선택 — 안 주면 예전처럼 본문만 실린다).
 * 출처는 "관찰기록"처럼 종류 이름, 태그는 원본의 태그(관찰)·세부 분류(누가기록).
 */
export type ThreadSuggestEvidence = DraftPackEvidence & {
  readonly sourceLabel?: string;
  readonly tags?: readonly string[];
};

export interface ThreadSuggestThread {
  readonly id: string;
  readonly title: string;
  readonly keywords: readonly string[];
}

export interface ThreadSuggestInput {
  /** 학생 **실명**. 꾸러미 안에서 별칭으로 바뀐다 — 이 값 자체는 절대 밖으로 나가지 않는다. */
  readonly studentName: string;
  /** 실명·학번을 찾아 가릴 명단(`rosterFromAll`). 없어도 이 학생은 반드시 가린다. */
  readonly roster: readonly KeywordGroup[];
  /** 이 학생의 **미분류** 근거만 넘긴다(부르는 쪽이 거른다). */
  readonly evidences: readonly ThreadSuggestEvidence[];
  /** 이 학생의 기존 주제(열린 것). 이름이 같으면 그 열에 제안한다. */
  readonly threads: readonly ThreadSuggestThread[];
}

export interface ThreadSuggestPack {
  /** 모델에게 보낼 사용자 턴 본문. 실명이 없다. */
  readonly text: string;
  /**
   * 별칭 ↔ 실명. 답의 주제 이름을 되돌리는 데 쓴다.
   * ★개인정보다 — 화면 상태나 파일에 저장하지 않고, 이 실행이 끝나면 버린다.
   */
  readonly mappings: readonly MaskMapping[];
  /** 순번(1부터) → 근거 id. 답을 읽을 때 되짚는다. 빠진 근거는 번호를 받지 않는다. */
  readonly numbered: readonly string[];
  /** 실제로 실린 근거 수(= `numbered.length`). */
  readonly includedCount: number;
  /** 왜 빠졌는지 — 초안 꾸러미와 같은 갈래라 `summarizeExclusions` 를 그대로 쓴다. */
  readonly exclusions: readonly DraftPackExclusion[];
}

/** YYYY-MM-DD → 'M/D'. 모델에게는 짧은 날짜로 충분하다. */
function shortDate(date: string): string {
  const [, mm, dd] = date.split('-');
  return mm && dd ? `${Number(mm)}/${Number(dd)}` : date;
}

export function buildThreadSuggestPack(input: ThreadSuggestInput): ThreadSuggestPack {
  // ★명단에 이 학생이 없으면(호출부 실수) 실명이 그대로 나간다 — 여기서 반드시 넣는다.
  const name = input.studentName.trim();
  const roster = input.roster.some((g) => g.values.includes(name))
    ? input.roster
    : [{ label: '이름', values: [name] }, ...input.roster];
  const session = createMaskSession();
  const mappings: MaskMapping[] = [];
  const mask = (text: string): string => {
    const r = redactQuestion(text, roster, session);
    mappings.push(...r.mappings);
    return r.masked;
  };
  // 이 학생 이름을 **맨 먼저** 가린다 — 그래야 ［이름1］ 이 되고, 근거 안의 같은 이름도 같은 번호를 받는다.
  mask(name);

  const numbered: string[] = [];
  const lines: string[] = [];
  const exclusions: DraftPackExclusion[] = [];
  let usedChars = 0;
  for (const e of input.evidences) {
    if (e.excludedFromAi === true) {
      exclusions.push({ evidenceId: e.id, reason: 'teacher' });
      continue;
    }
    const raw = e.content.trim();
    if (raw.length === 0) {
      exclusions.push({ evidenceId: e.id, reason: 'empty' });
      continue;
    }
    // 기재 금지 검사는 **원문**으로 한다 — 가린 뒤에는 단어가 바뀌어 못 잡을 수 있다.
    const hits = detectProhibitedTerms(raw);
    if (hits.length > 0) {
      exclusions.push({
        evidenceId: e.id,
        reason: 'prohibited',
        categories: summarizeProhibited(hits),
      });
      continue;
    }
    // 묶을 단서: 날짜·출처·태그. 출처·태그에도 이름이 섞일 수 있어 같은 세션으로 가린다.
    const head = [
      e.date ? shortDate(e.date) : '',
      e.sourceLabel?.trim() ? mask(e.sourceLabel.trim()) : '',
      e.tags && e.tags.length > 0 ? `태그: ${mask(e.tags.join(', '))}` : '',
    ].filter((s) => s.length > 0);
    const line = `${numbered.length + 1}. ${head.length > 0 ? `(${head.join(', ')}) ` : ''}${mask(raw)}`;
    if (usedChars + line.length > DRAFT_PACK_MAX_EVIDENCE_CHARS) {
      // 여기서 멈추지 않고 계속 도는 이유: 뒤에 짧은 근거가 있으면 그건 실을 수 있다.
      exclusions.push({ evidenceId: e.id, reason: 'too-long' });
      continue;
    }
    usedChars += line.length + 1;
    numbered.push(e.id);
    lines.push(line);
  }

  const parts: string[] = [];
  parts.push(
    '아래는 한 학생의 아직 주제로 묶이지 않은 기록입니다. 같은 탐구 흐름(질문 → 시도 → 결과)으로',
  );
  parts.push('이어지는 기록끼리 주제로 묶어 제안해 주세요.');
  parts.push(
    '기록이 하나뿐이어도 뚜렷한 활동이면 그 활동 이름으로 주제를 제안하세요. 서로 관련 없는 기록을 한 주제에 억지로 넣지는 마세요.',
  );
  parts.push('파일 제출 기록(본문 없음)은 같은 과제·활동의 다른 기록과 한 주제에 넣으세요.');
  parts.push('기록 하나는 한 주제에만 넣습니다. 기록 앞 괄호는 (날짜, 출처, 태그)입니다.');
  parts.push('');
  if (input.threads.length > 0) {
    parts.push('기존 주제(이 주제에 맞으면 이름을 **그대로** 쓰세요):');
    for (const t of input.threads) {
      const kw = t.keywords.length > 0 ? `, 키워드: ${mask(t.keywords.join(', '))}` : '';
      parts.push(`- ${mask(t.title)}${kw}`);
    }
    parts.push('');
  }
  parts.push('기록:');
  parts.push(lines.length > 0 ? lines.join('\n') : '(보낼 수 있는 기록이 없습니다)');
  parts.push('');
  parts.push(
    '출력 형식: 줄마다 `주제명 | 기록번호,기록번호` 만 쓰세요. 예) 할인 문구와 선택 | 1,3,4\n' +
      `묶을 기록이 없으면 \`${THREAD_SUGGEST_NONE_WORD} | 이유 한 문장\` 한 줄만 쓰세요. 예) ${THREAD_SUGGEST_NONE_WORD} | 기록이 서로 다른 활동이라 한 주제로 묶이지 않습니다\n` +
      '설명·머리말·다른 말은 쓰지 마세요. 새 주제 이름은 10자 안팎의 명사구로 짓습니다.',
  );
  return { text: parts.join('\n'), mappings, numbered, includedCount: numbered.length, exclusions };
}
