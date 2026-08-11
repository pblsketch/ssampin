import { describe, it, expect } from 'vitest';
import { decideTermStartPrompt, type TermStartPromptInput } from '../termStartPrompt';

const AUGUST: TermStartPromptInput = {
  todayIso: '2026-08-12',
  currentTerm: '2026-2',
};

describe('decideTermStartPrompt — 물어야 하는 때', () => {
  it('8월인데 이번 2학기 개학일을 모르면 묻는다', () => {
    expect(decideTermStartPrompt(AUGUST)).toEqual({ kind: 'ask', term: '2026-2' });
  });

  it('8월 1일·31일 모두 묻는 구간', () => {
    expect(decideTermStartPrompt({ ...AUGUST, todayIso: '2026-08-01' }).kind).toBe('ask');
    expect(decideTermStartPrompt({ ...AUGUST, todayIso: '2026-08-31' }).kind).toBe('ask');
  });

  it('개학일을 등록한 학기가 1학기뿐이어도 2학기는 묻는다', () => {
    expect(
      decideTermStartPrompt({ ...AUGUST, termStartDates: { '2026-1': '2026-03-02' } }),
    ).toEqual({ kind: 'ask', term: '2026-2' });
  });

  it('사용자가 다른 학기를 넘긴 기록은 이번 질문을 막지 않는다', () => {
    expect(decideTermStartPrompt({ ...AUGUST, skippedTerm: '2025-2' }).kind).toBe('ask');
  });
});

describe('decideTermStartPrompt — 묻지 않아야 하는 때', () => {
  it('8월이 아니면 묻지 않는다 — 달력과 학교가 갈릴 일이 없는 달', () => {
    for (const todayIso of ['2026-03-05', '2026-07-31', '2026-09-01', '2026-12-20', '2027-01-10']) {
      expect(decideTermStartPrompt({ ...AUGUST, todayIso }), todayIso).toEqual({ kind: 'none' });
    }
  });

  it('그 학기 개학일이 이미 등록됐으면 묻지 않는다', () => {
    expect(
      decideTermStartPrompt({ ...AUGUST, termStartDates: { '2026-2': '2026-08-18' } }),
    ).toEqual({ kind: 'none' });
  });

  it('사용자가 그 학기를 넘겼으면 다시 묻지 않는다', () => {
    expect(decideTermStartPrompt({ ...AUGUST, skippedTerm: '2026-2' })).toEqual({ kind: 'none' });
  });

  it('날짜·학기 형식이 깨졌으면 묻지 않는다(추측 금지)', () => {
    expect(decideTermStartPrompt({ ...AUGUST, todayIso: '20260812' })).toEqual({ kind: 'none' });
    expect(decideTermStartPrompt({ ...AUGUST, currentTerm: '엉터리' })).toEqual({ kind: 'none' });
  });
});
