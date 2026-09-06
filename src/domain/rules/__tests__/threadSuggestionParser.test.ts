/**
 * AI 분류 제안 답 파서 — 정상·변형·실패 (ADR-085 §6-3).
 */
import { describe, it, expect } from 'vitest';
import {
  parseThreadSuggestions,
  THREAD_SUGGEST_FAILURE_LABELS,
  type ThreadSuggestParseInput,
} from '@domain/rules/threadSuggestionParser';

const NUMBERED = ['e1', 'e2', 'e3', 'e4', 'e5'];
const THREADS = [
  { id: 't1', title: '할인 문구와 선택' },
  { id: 't2', title: '기후 변화 탐구' },
];

function input(p: Partial<ThreadSuggestParseInput> = {}): ThreadSuggestParseInput {
  return { numbered: NUMBERED, threads: THREADS, ...p };
}

describe('정상', () => {
  it('`주제명 | 1,3,5` 줄을 주제·근거 id 로 읽는다', () => {
    const r = parseThreadSuggestions('할인 문구와 선택 | 1,3,5\n새 주제 이름 | 2', input());
    expect(r.failure).toBeNull();
    expect(r.suggestions).toEqual([
      { title: '할인 문구와 선택', threadId: 't1', evidenceIds: ['e1', 'e3', 'e5'] },
      { title: '새 주제 이름', threadId: null, evidenceIds: ['e2'] },
    ]);
  });

  it('기존 주제는 공백·대소문자가 달라도 그 주제로 보고 원래 이름을 쓴다', () => {
    const r = parseThreadSuggestions('할인문구와  선택 | 1', input());
    expect(r.suggestions[0]).toEqual({
      title: '할인 문구와 선택',
      threadId: 't1',
      evidenceIds: ['e1'],
    });
  });

  it('별칭 매핑이 있으면 주제 이름의 ［이름1］ 을 실명으로 되돌린 뒤 기존 주제와 맞춘다', () => {
    const mappings = [{ alias: '［이름1］', original: '김지훈', kind: 'keyword' as const }];
    const r = parseThreadSuggestions('［이름1］의 할인 탐구 | 1,2', {
      numbered: NUMBERED,
      threads: [{ id: 't9', title: '김지훈의 할인 탐구' }],
      mappings,
    });
    expect(r.suggestions[0]).toEqual({
      title: '김지훈의 할인 탐구',
      threadId: 't9',
      evidenceIds: ['e1', 'e2'],
    });
  });
});

describe('변형을 받는다', () => {
  it('전각 구분자·전각 쉼표·전각 숫자·가운뎃점·빈칸', () => {
    const r = parseThreadSuggestions('주제 하나｜１，３\n주제 둘 │ 2·4\n주제 셋 | 5 ', input());
    expect(r.suggestions.map((s) => s.evidenceIds)).toEqual([['e1', 'e3'], ['e2', 'e4'], ['e5']]);
  });

  it('글머리표·순번·굵게·따옴표·코드 펜스·머리말 문장을 벗긴다', () => {
    const answer = [
      '제안입니다:',
      '```',
      '1. **주제 하나** | 1, 2',
      '- "주제 둘" | 3번, 4번',
      '(3) `주제 셋`: | #5',
      '```',
    ].join('\n');
    const r = parseThreadSuggestions(answer, input());
    expect(r.suggestions.map((s) => [s.title, s.evidenceIds])).toEqual([
      ['주제 하나', ['e1', 'e2']],
      ['주제 둘', ['e3', 'e4']],
      ['주제 셋', ['e5']],
    ]);
  });

  it('`1-3`·`2~4` 범위를 펼친다', () => {
    const r = parseThreadSuggestions('주제 | 1-3\n다른 주제 | 4~5', input());
    expect(r.suggestions.map((s) => s.evidenceIds)).toEqual([
      ['e1', 'e2', 'e3'],
      ['e4', 'e5'],
    ]);
  });

  it('범위 밖·거꾸로 된 범위·너무 넓은 범위·숫자 아닌 토큰은 그 것만 버린다', () => {
    const r = parseThreadSuggestions('주제 | 0, 1, 9, 5-3, 1-99, 셋, 2', input());
    expect(r.suggestions[0]?.evidenceIds).toEqual(['e1', 'e2']);
  });

  it('같은 근거가 두 주제에 나오면 먼저 나온 주제가 갖고, 한 줄 안의 중복도 한 번만', () => {
    const r = parseThreadSuggestions('먼저 | 1,1,2\n나중 | 2,3', input());
    expect(r.suggestions).toEqual([
      { title: '먼저', threadId: null, evidenceIds: ['e1', 'e2'] },
      { title: '나중', threadId: null, evidenceIds: ['e3'] },
    ]);
  });

  it('같은 주제 이름이 여러 줄이면 한 제안으로 합친다', () => {
    const r = parseThreadSuggestions('주제 | 1\n주제 | 3\n다른 | 2', input());
    expect(r.suggestions).toEqual([
      { title: '주제', threadId: null, evidenceIds: ['e1', 'e3'] },
      { title: '다른', threadId: null, evidenceIds: ['e2'] },
    ]);
  });

  it('번호가 하나도 안 남는 줄은 제안에서 빠지지만 다른 줄은 산다', () => {
    const r = parseThreadSuggestions('빈 주제 | 99\n주제 | 1', input());
    expect(r.failure).toBeNull();
    expect(r.suggestions.map((s) => s.title)).toEqual(['주제']);
  });

  it('CRLF 를 견딘다', () => {
    const r = parseThreadSuggestions('주제 | 1\r\n다른 | 2\r\n', input());
    expect(r.suggestions).toHaveLength(2);
  });
});

describe('실패 — 빈 결과와 이유', () => {
  it('빈 답', () => {
    expect(parseThreadSuggestions('   \n', input())).toEqual({
      suggestions: [],
      failure: 'empty-answer',
    });
  });

  it('"없음" 한 줄은 오류가 아니라 묶을 게 없다는 뜻', () => {
    expect(parseThreadSuggestions('없음', input()).failure).toBe('none');
    expect(parseThreadSuggestions('- `없음`', input()).failure).toBe('none');
    expect(parseThreadSuggestions('기타 | 1,2', input()).failure).toBe('none');
  });

  it('★`없음 | 이유` 는 none + reason — 이유 속 별칭도 실명으로 되돌린다(설계서 board-v2 §4-6)', () => {
    const mappings = [{ alias: '［이름1］', original: '김지훈', kind: 'keyword' as const }];
    const r = parseThreadSuggestions(
      '없음 | ［이름1］의 기록이 서로 다른 활동이라 한 주제로 묶이지 않습니다.',
      {
        ...input(),
        mappings,
      },
    );
    expect(r).toEqual({
      suggestions: [],
      failure: 'none',
      reason: '김지훈의 기록이 서로 다른 활동이라 한 주제로 묶이지 않습니다.',
    });
    // 구분자 없이 "없음: 이유" 로 써도 같이 읽는다. 이유가 없으면 reason 칸 자체가 없다.
    expect(parseThreadSuggestions('없음: 기록이 하나뿐입니다', input())).toEqual({
      suggestions: [],
      failure: 'none',
      reason: '기록이 하나뿐입니다',
    });
    expect(parseThreadSuggestions('없음', input())).toEqual({ suggestions: [], failure: 'none' });
  });

  it('구분자 있는 줄이 하나도 없으면 형식 오류', () => {
    const r = parseThreadSuggestions('할인 문구와 선택: 1, 3, 5\n그냥 문장입니다.', input());
    expect(r).toEqual({ suggestions: [], failure: 'no-format' });
  });

  it('형식은 맞는데 번호가 전부 범위 밖이면 그 이유로 실패', () => {
    const r = parseThreadSuggestions('주제 | 7, 8\n다른 | 0', input());
    expect(r).toEqual({ suggestions: [], failure: 'no-valid-numbers' });
  });

  it('제목이 비어 있는 줄(`| 1`)은 형식으로 치지 않는다', () => {
    expect(parseThreadSuggestions('| 1', input()).failure).toBe('no-format');
  });

  it('실을 근거가 0건인 꾸러미에는 어떤 답도 제안이 될 수 없다', () => {
    const r = parseThreadSuggestions('주제 | 1', input({ numbered: [] }));
    expect(r).toEqual({ suggestions: [], failure: 'no-valid-numbers' });
  });

  it('이유마다 한국어 안내가 있다', () => {
    for (const f of ['empty-answer', 'none', 'no-format', 'no-valid-numbers'] as const) {
      expect(THREAD_SUGGEST_FAILURE_LABELS[f].length).toBeGreaterThan(0);
    }
  });
});
