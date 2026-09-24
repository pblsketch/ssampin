import { describe, it, expect } from 'vitest';
import { normalizeTimerLocalState, pushRecentActivityName } from './timerLocalState';

describe('pushRecentActivityName — 최근 활동 이름', () => {
  it('맨 앞에 넣고 같은 이름은 한 번만', () => {
    expect(pushRecentActivityName(['조용히 읽기', '모둠 토의'], '모둠 토의')).toEqual([
      '모둠 토의',
      '조용히 읽기',
    ]);
  });

  it('빈 이름은 넣지 않고, 8개까지만', () => {
    expect(pushRecentActivityName(['a'], '   ')).toEqual(['a']);
    const many = Array.from({ length: 8 }, (_, i) => `이름${i}`);
    const next = pushRecentActivityName(many, '새 이름');
    expect(next).toHaveLength(8);
    expect(next[0]).toBe('새 이름');
    expect(next).not.toContain('이름7');
  });
});

describe('normalizeTimerLocalState — 이 기기 저장값', () => {
  it('값이 없거나 틀리면 빈 상태', () => {
    expect(normalizeTimerLocalState(null)).toEqual({
      lastDurationSeconds: null,
      recentActivityNames: [],
      presentationRoster: null,
    });
  });

  it('마지막 시간은 1초~99:59 정수만', () => {
    expect(normalizeTimerLocalState({ lastDurationSeconds: 420 }).lastDurationSeconds).toBe(420);
    expect(normalizeTimerLocalState({ lastDurationSeconds: 0 }).lastDurationSeconds).toBeNull();
    expect(normalizeTimerLocalState({ lastDurationSeconds: 9000 }).lastDurationSeconds).toBeNull();
  });

  it('최근 이름의 순서를 지킨다', () => {
    const result = normalizeTimerLocalState({ recentActivityNames: ['가', '나', '가', 3] });
    expect(result.recentActivityNames).toEqual(['가', '나']);
  });

  it('발표 명단: 순서는 명단에 있는 학생만, 질문 시간은 없으면 null', () => {
    const result = normalizeTimerLocalState({
      presentationRoster: {
        presenters: [
          { id: 's-1', name: '김하나', number: 1 },
          { id: 's-2', name: '이둘', number: 2 },
          { id: 's-2', name: '중복' },
        ],
        order: [
          ['s-1', 1],
          ['ghost', 2],
          ['s-2', 0],
        ],
        inputMode: 'students',
        durationSeconds: 120,
        qnaSeconds: 'x',
        autoAdvance: true,
      },
    });
    expect(result.presentationRoster).toEqual({
      presenters: [
        { id: 's-1', name: '김하나', number: 1 },
        { id: 's-2', name: '이둘', number: 2 },
      ],
      order: [['s-1', 1]],
      inputMode: 'students',
      durationSeconds: 120,
      qnaSeconds: null,
      autoAdvance: true,
    });
  });

  it('학생이 없는 명단은 버린다', () => {
    expect(
      normalizeTimerLocalState({ presentationRoster: { presenters: [] } }).presentationRoster,
    ).toBeNull();
  });
});
