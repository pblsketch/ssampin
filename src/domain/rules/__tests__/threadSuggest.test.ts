import { describe, it, expect } from 'vitest';
import type { InquiryThread } from '@domain/entities/InquiryThread';
import type { EvidenceSourceType, RecordEvidence } from '@domain/entities/RecordEvidence';
import {
  buildThreadTimeline,
  competencyKeywordExample,
  competencyKeywordHasField,
  countUnclassified,
  emptyLinkHints,
  isClassified,
  suggestEvidenceForThread,
  suggestThreadsForEvidence,
  unclassifiedEvidence,
  EMPTY_LINK_LABELS,
} from '@domain/rules/threadSuggest';

function ev(p: Partial<RecordEvidence> & { id: string }): RecordEvidence {
  return {
    studentRef: 's1',
    areas: ['subject'],
    content: '',
    createdAt: 1,
    updatedAt: 1,
    ...p,
  } as RecordEvidence;
}

function thread(p: Partial<InquiryThread> & { id: string }): InquiryThread {
  return {
    studentRef: 's1',
    title: '주제',
    keywords: [],
    status: 'open',
    createdAt: 1,
    updatedAt: 1,
    ...p,
  } as InquiryThread;
}

describe('주제 소속 판정 — 고아 threadId 는 미분류로 본다', () => {
  const ids = new Set(['t1']);

  it('실재하는 주제에 묶여 있으면 분류됨', () => {
    expect(isClassified(ev({ id: 'e1', threadId: 't1' }), ids)).toBe(true);
  });

  it('threadId 가 없으면 미분류', () => {
    expect(isClassified(ev({ id: 'e2' }), ids)).toBe(false);
  });

  it('★없는 주제를 가리키면(동기화 시차) 미분류로 보되 지우지는 않는다', () => {
    const orphan = ev({ id: 'e3', threadId: 't-gone' });
    expect(isClassified(orphan, ids)).toBe(false);
    // 판정 함수는 순수하다 — 입력을 건드리지 않는다(호출자가 threadId 를 지우면 안 된다).
    expect(orphan.threadId).toBe('t-gone');
  });

  it('미분류 목록에 고아가 포함된다', () => {
    const list = [ev({ id: 'a', threadId: 't1' }), ev({ id: 'b' }), ev({ id: 'c', threadId: 'x' })];
    expect(unclassifiedEvidence(list, ids).map((e) => e.id)).toEqual(['b', 'c']);
  });

  it('미분류 건수는 학생별로 센다 — 남의 학생은 안 센다', () => {
    const list = [
      ev({ id: 'a' }),
      ev({ id: 'b' }),
      ev({ id: 'c', studentRef: 's2' }),
      ev({ id: 'd', threadId: 't1' }),
    ];
    expect(countUnclassified(list, 's1', ids)).toBe(2);
    expect(countUnclassified(list, 's2', ids)).toBe(1);
  });
});

describe('"이것도 이 주제?" — 키워드가 겹칠 때만 뜬다', () => {
  it('키워드가 본문에 있으면 제안한다', () => {
    const t = thread({ id: 't1', keywords: ['기회비용', '프레이밍'] });
    const got = suggestThreadsForEvidence(
      ev({ id: 'e1', content: '쿠폰과 기회비용을 두고 고민했다' }),
      [t],
    );
    expect(got).toHaveLength(1);
    expect(got[0]?.matched).toEqual(['기회비용']);
  });

  it('★키워드가 하나도 안 겹치면 제안하지 않는다', () => {
    const t = thread({ id: 't1', keywords: ['기회비용'] });
    expect(suggestThreadsForEvidence(ev({ id: 'e1', content: '체육 대회 응원' }), [t])).toEqual([]);
  });

  it('★다른 학생의 주제는 후보에 오르지 않는다', () => {
    const other = thread({ id: 't2', studentRef: 's2', keywords: ['기회비용'] });
    expect(
      suggestThreadsForEvidence(ev({ id: 'e1', content: '기회비용을 따졌다' }), [other]),
    ).toEqual([]);
  });

  it('닫힌 주제는 제안하지 않는다', () => {
    const closed = thread({ id: 't1', keywords: ['기회비용'], status: 'closed' });
    expect(
      suggestThreadsForEvidence(ev({ id: 'e1', content: '기회비용을 따졌다' }), [closed]),
    ).toEqual([]);
  });

  it('많이 겹친 주제가 먼저 온다', () => {
    const a = thread({ id: 't1', title: '가', keywords: ['기회비용'] });
    const b = thread({ id: 't2', title: '나', keywords: ['기회비용', '프레이밍'] });
    const got = suggestThreadsForEvidence(ev({ id: 'e1', content: '기회비용과 프레이밍 효과' }), [
      a,
      b,
    ]);
    expect(got.map((g) => g.threadId)).toEqual(['t2', 't1']);
  });

  it('띄어쓰기가 달라도 찾는다(공백 무시 비교)', () => {
    const t = thread({ id: 't1', keywords: ['기회 비용'] });
    const got = suggestThreadsForEvidence(ev({ id: 'e1', content: '기회비용을 따졌다' }), [t]);
    expect(got).toHaveLength(1);
  });

  it('주제 쪽에서 본 후보 — 미분류이면서 같은 학생인 것만', () => {
    const t = thread({ id: 't1', keywords: ['설문'] });
    const list = [
      ev({ id: 'a', content: '설문을 설계했다' }), // 후보
      ev({ id: 'b', content: '설문 결과 정리', threadId: 't1' }), // 이미 묶임
      ev({ id: 'c', content: '설문 도움', studentRef: 's2' }), // 남의 학생
      ev({ id: 'd', content: '독서 감상문' }), // 안 겹침
    ];
    expect(suggestEvidenceForThread(t, list, new Set(['t1'])).map((m) => m.evidenceId)).toEqual([
      'a',
    ]);
  });

  it('★키워드가 없는 주제는 아무것도 권하지 않는다', () => {
    const t = thread({ id: 't1', keywords: [] });
    expect(suggestEvidenceForThread(t, [ev({ id: 'a', content: '무엇이든' })], new Set())).toEqual(
      [],
    );
  });
});

describe('시간순 줄기', () => {
  it('날짜 오름차순으로 세운다', () => {
    const nodes = buildThreadTimeline([
      ev({ id: 'b', date: '2026-09-18' }),
      ev({ id: 'a', date: '2026-09-02' }),
      ev({ id: 'c', date: '2026-09-25' }),
    ]);
    expect(nodes.map((n) => n.evidenceId)).toEqual(['a', 'b', 'c']);
  });

  it('★날짜 없는 근거를 버리지 않고 뒤로 보낸다', () => {
    const nodes = buildThreadTimeline([ev({ id: 'x' }), ev({ id: 'a', date: '2026-09-02' })]);
    expect(nodes.map((n) => n.evidenceId)).toEqual(['a', 'x']);
  });

  it('같은 날짜는 적은 순서(createdAt)를 지킨다', () => {
    const nodes = buildThreadTimeline([
      ev({ id: 'second', date: '2026-09-02', createdAt: 20 }),
      ev({ id: 'first', date: '2026-09-02', createdAt: 10 }),
    ]);
    expect(nodes.map((n) => n.evidenceId)).toEqual(['first', 'second']);
  });

  it('슬롯 첫 번째를 갈래 라벨로 싣는다', () => {
    const [node] = buildThreadTimeline([ev({ id: 'a', slots: ['질문', '피드백'] })]);
    expect(node?.slot).toBe('질문');
    expect(node?.slots).toEqual(['질문', '피드백']);
  });

  it('슬롯이 없으면 라벨 칸을 만들지 않는다', () => {
    const [node] = buildThreadTimeline([ev({ id: 'a' })]);
    expect(node && 'slot' in node).toBe(false);
  });
});

describe('빈 고리 힌트', () => {
  const n = (slots: string[], sourceType: EvidenceSourceType = 'observation', date?: string) =>
    ev({ id: Math.random().toString(36), slots, sourceType, ...(date ? { date } : {}) });

  it('빈 흐름에는 아무 힌트도 안 뜬다 — 새 주제를 재촉하지 않는다', () => {
    expect(emptyLinkHints([])).toEqual([]);
  });

  it('질문이 하나뿐이면 힌트가 뜬다', () => {
    const nodes = buildThreadTimeline([n(['질문']), n(['시도'])]);
    expect(emptyLinkHints(nodes)).toContain('single_question');
  });

  it('질문이 둘이면 안 뜬다', () => {
    const nodes = buildThreadTimeline([n(['질문']), n(['질문']), n(['시행착오'])]);
    expect(emptyLinkHints(nodes)).not.toContain('single_question');
  });

  it('★마디가 3개 미만이면 시행착오 힌트를 안 띄운다(초반엔 당연히 없다)', () => {
    const nodes = buildThreadTimeline([n(['질문']), n(['시도'])]);
    expect(emptyLinkHints(nodes)).not.toContain('no_trial_error');
  });

  it('마디가 3개 이상인데 시행착오가 없으면 뜬다', () => {
    const nodes = buildThreadTimeline([n(['질문']), n(['질문']), n(['시도'])]);
    expect(emptyLinkHints(nodes)).toContain('no_trial_error');
  });

  it('산출물 뒤에 평가가 없으면 뜬다', () => {
    const nodes = buildThreadTimeline([
      n(['질문'], 'observation', '2026-09-02'),
      n(['산출물'], 'assignment', '2026-09-25'),
    ]);
    expect(emptyLinkHints(nodes)).toContain('no_evaluation_after_output');
  });

  it('산출물 뒤에 평가가 있으면 안 뜬다', () => {
    const nodes = buildThreadTimeline([
      n(['질문'], 'observation', '2026-09-02'),
      n(['산출물'], 'assignment', '2026-09-25'),
      n([], 'evaluation', '2026-09-27'),
    ]);
    expect(emptyLinkHints(nodes)).not.toContain('no_evaluation_after_output');
  });

  it('★산출물이 없으면 평가 힌트를 안 띄운다', () => {
    const nodes = buildThreadTimeline([n(['질문']), n(['시도'])]);
    expect(emptyLinkHints(nodes)).not.toContain('no_evaluation_after_output');
  });

  it('모든 힌트 코드에 한국어 라벨이 있다', () => {
    const nodes = buildThreadTimeline([
      n(['질문'], 'observation', '2026-09-02'),
      n(['시도'], 'observation', '2026-09-11'),
      n(['산출물'], 'assignment', '2026-09-25'),
    ]);
    for (const code of emptyLinkHints(nodes)) {
      expect(EMPTY_LINK_LABELS[code]).toBeTruthy();
    }
  });
});

describe('교사 역량 키워드 — 분야 붙이기 유도(막지는 않는다)', () => {
  it('분야가 붙으면 통과', () => {
    expect(competencyKeywordHasField('경제 현상에 대한 자료 해석력')).toBe(true);
    expect(competencyKeywordHasField('실험 설계를 통한 문제 해결력')).toBe(true);
  });

  it('분야 없이 역량만 적으면 권유 대상', () => {
    expect(competencyKeywordHasField('자료 해석력')).toBe(false);
    expect(competencyKeywordHasField('')).toBe(false);
  });

  it('예시 문구는 과목이 있으면 그 과목으로 든다', () => {
    expect(competencyKeywordExample('생명과학')).toBe('예: 생명과학에 대한 자료 해석력');
    expect(competencyKeywordExample()).toContain('에 대한');
  });
});
