/**
 * AI 분류 제안 꾸러미 — 초안 꾸러미와 같은 가림·제외 규칙을 쓰는지 잠근다(ADR-085 §6-3, 설계서 §10 7단계).
 * 수용 기준: 프롬프트에 실명 0건 · 제외 근거 0건.
 */
import { describe, it, expect } from 'vitest';
import {
  buildThreadSuggestPack,
  type ThreadSuggestEvidence,
  type ThreadSuggestInput,
} from '@domain/services/threadSuggestPack';
import {
  DRAFT_PACK_MAX_EVIDENCE_CHARS,
  summarizeExclusions,
} from '@domain/services/recordDraftPack';
import { rosterFromAll, restoreModelText } from '@domain/rules/redactOutbound';
import { THREAD_SUGGEST_NONE_WORD } from '@domain/rules/threadSuggestionParser';

const ROSTER = rosterFromAll(
  [
    { name: '김지훈', studentNumber: 15 },
    { name: '박서연', studentNumber: 3 },
  ],
  [],
);

function ev(p: Partial<ThreadSuggestEvidence> & { id: string }): ThreadSuggestEvidence {
  return { content: '수업에서 질문을 자주 했다.', ...p };
}

function input(p: Partial<ThreadSuggestInput> = {}): ThreadSuggestInput {
  return {
    studentName: '김지훈',
    roster: ROSTER,
    evidences: [ev({ id: 'e1' })],
    threads: [],
    ...p,
  };
}

describe('★실명은 한 글자도 나가지 않는다', () => {
  it('이 학생·다른 학생·주제 이름·키워드 안의 실명이 전부 별칭이 된다', () => {
    const pack = buildThreadSuggestPack(
      input({
        evidences: [
          ev({ id: 'e1', content: '김지훈이 박서연과 모둠에서 할인 문구를 비교했다.' }),
          ev({ id: 'e2', content: '박서연에게 결과를 설명했다.' }),
        ],
        threads: [{ id: 't1', title: '김지훈의 할인 탐구', keywords: ['박서연', '할인'] }],
      }),
    );
    expect(pack.text).not.toContain('김지훈');
    expect(pack.text).not.toContain('박서연');
    expect(pack.text).toContain('［이름1］');
    expect(pack.text).toContain('［이름2］');
    // 같은 세션 — 같은 사람은 어디서 나와도 같은 번호다.
    expect(restoreModelText('［이름1］', pack.mappings)).toBe('김지훈');
    expect(restoreModelText('［이름2］', pack.mappings)).toBe('박서연');
  });

  it('명단에 이 학생이 없어도(호출부 실수) 이름을 가린다', () => {
    const pack = buildThreadSuggestPack(
      input({ roster: [], evidences: [ev({ id: 'e1', content: '김지훈이 질문했다.' })] }),
    );
    expect(pack.text).not.toContain('김지훈');
  });
});

describe('★제외 규칙은 초안 꾸러미와 같은 순서·같은 갈래', () => {
  it('선생님 제외·빈 내용·기재 금지 근거는 실리지 않고 번호도 받지 않는다', () => {
    const pack = buildThreadSuggestPack(
      input({
        evidences: [
          ev({ id: 'e1', content: '외부 대회 이야기', excludedFromAi: true }),
          ev({ id: 'e2', content: '   ' }),
          ev({ id: 'e3', content: '교내 수학경시대회에서 금상을 받았다.' }),
          ev({ id: 'e4', content: '모둠 활동에서 자료를 정리했다.' }),
        ],
      }),
    );
    expect(pack.text).not.toContain('외부 대회');
    expect(pack.text).not.toContain('경시대회');
    expect(pack.text).toContain('1. 모둠 활동에서 자료를 정리했다.');
    expect(pack.text).not.toContain('2. ');
    expect(pack.numbered).toEqual(['e4']);
    expect(pack.includedCount).toBe(1);
    expect(pack.exclusions.map((x) => [x.evidenceId, x.reason])).toEqual([
      ['e1', 'teacher'],
      ['e2', 'empty'],
      ['e3', 'prohibited'],
    ]);
    expect((pack.exclusions[2]?.categories ?? []).length).toBeGreaterThan(0);
  });

  it('선생님이 뺀 것이 금지 판정보다 먼저다', () => {
    const pack = buildThreadSuggestPack(
      input({ evidences: [ev({ id: 'e1', content: '교내 대회 수상', excludedFromAi: true })] }),
    );
    expect(pack.exclusions[0]?.reason).toBe('teacher');
  });

  it('분량을 넘는 근거는 빼고, 뒤의 짧은 근거는 싣는다 — 번호는 실린 것만 이어진다', () => {
    const long = '가'.repeat(DRAFT_PACK_MAX_EVIDENCE_CHARS);
    const pack = buildThreadSuggestPack(
      input({
        evidences: [
          ev({ id: 'e1', content: '짧은 기록.' }),
          ev({ id: 'e2', content: long }),
          ev({ id: 'e3', content: '또 짧은 기록.' }),
        ],
      }),
    );
    expect(pack.numbered).toEqual(['e1', 'e3']);
    expect(pack.text).toContain('2. 또 짧은 기록.');
    expect(pack.exclusions).toEqual([{ evidenceId: 'e2', reason: 'too-long' }]);
  });

  it('제외 요약 문구를 초안 꾸러미와 같은 함수로 만들 수 있다', () => {
    const pack = buildThreadSuggestPack(
      input({
        evidences: [
          ev({ id: 'e1', content: '', excludedFromAi: true }),
          ev({ id: 'e2', content: '' }),
        ],
      }),
    );
    expect(summarizeExclusions(pack.exclusions)).toContain('제외됨 2건');
  });

  it('실을 근거가 하나도 없으면 그렇게 적는다', () => {
    const pack = buildThreadSuggestPack(input({ evidences: [] }));
    expect(pack.text).toContain('보낼 수 있는 기록이 없습니다');
    expect(pack.includedCount).toBe(0);
    expect(pack.numbered).toEqual([]);
  });
});

describe('꾸러미 모양', () => {
  it('번호는 1부터, 날짜가 있으면 괄호로 붙는다(짧은 날짜). 출처·태그를 안 주면 본문만', () => {
    const pack = buildThreadSuggestPack(
      input({
        evidences: [
          ev({ id: 'a', date: '2026-05-03', content: '첫 기록' }),
          ev({ id: 'b', content: '둘째 기록' }),
        ],
      }),
    );
    expect(pack.text).toContain('1. (5/3) 첫 기록');
    expect(pack.text).toContain('2. 둘째 기록');
  });

  it('★출처·태그가 실린다 — (날짜, 출처, 태그: …) 본문. 태그 속 실명도 같은 세션으로 가린다', () => {
    const pack = buildThreadSuggestPack(
      input({
        evidences: [
          ev({
            id: 'a',
            date: '2026-06-18',
            content: '개념을 설명했다',
            sourceLabel: '관찰기록',
            tags: ['개념 설명', '박서연 모둠'],
          }),
          ev({ id: 'b', content: '제출함', sourceLabel: '과제 제출' }),
        ],
      }),
    );
    expect(pack.text).toContain(
      '1. (6/18, 관찰기록, 태그: 개념 설명, ［이름2］ 모둠) 개념을 설명했다',
    );
    expect(pack.text).toContain('2. (과제 제출) 제출함');
    expect(pack.text).not.toContain('박서연');
    expect(pack.text).not.toContain('김지훈');
  });

  it('★기록 하나뿐이어도 뚜렷한 활동이면 주제로 제안하라고 지시한다(R2) · 억지 묶기는 여전히 금지 · 파일 제출은 같은 활동과', () => {
    const text = buildThreadSuggestPack(input()).text;
    expect(text).toContain('기록이 하나뿐이어도 뚜렷한 활동이면');
    expect(text).toContain('억지로 넣지는 마세요');
    expect(text).toContain('파일 제출 기록(본문 없음)은 같은 과제·활동의 다른 기록과 한 주제에');
  });

  it('기존 주제가 있으면 이름을 그대로 쓰라고 목록으로 싣고, 없으면 그 절이 없다', () => {
    const withThreads = buildThreadSuggestPack(
      input({ threads: [{ id: 't1', title: '할인 문구와 선택', keywords: ['할인', '광고'] }] }),
    );
    expect(withThreads.text).toContain('기존 주제');
    expect(withThreads.text).toContain('- 할인 문구와 선택, 키워드: 할인, 광고');
    expect(buildThreadSuggestPack(input()).text).not.toContain('기존 주제');
  });

  it('출력 형식 지시: `주제명 | 기록번호,기록번호` 한 줄씩, 없으면 "없음 | 이유 한 문장" 한 줄', () => {
    const pack = buildThreadSuggestPack(input());
    expect(pack.text).toContain('`주제명 | 기록번호,기록번호`');
    expect(pack.text).toContain(`\`${THREAD_SUGGEST_NONE_WORD} | 이유 한 문장\` 한 줄만`);
    expect(pack.text).toContain('기록 하나는 한 주제에만');
  });

  it('성취기준 원문은 어디에도 들어갈 자리가 없다', () => {
    expect(buildThreadSuggestPack(input()).text).not.toContain('성취기준');
  });
});
