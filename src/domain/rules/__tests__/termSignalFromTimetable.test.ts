import { describe, it, expect } from 'vitest';
import { decideTermSignal, type TermSignalInput } from '../termSignalFromTimetable';

/** 8월 개학 학교의 전형적인 신호 — 달력은 1학기, 나이스는 2학기로 응답. */
const AUGUST_SIGNAL: TermSignalInput = {
  currentTerm: '2026-1',
  observedTerm: '2026-2',
  usedFallbackSemester: true,
  observedWeekStartIso: '2026-08-17',
};

describe('decideTermSignal — 물어야 하는 경우', () => {
  it('반대 학기 재시도로 2학기 수업이 나오면 그 주 시작일로 제안한다', () => {
    expect(decideTermSignal(AUGUST_SIGNAL)).toEqual({
      kind: 'suggest',
      term: '2026-2',
      startIso: '2026-08-17',
    });
  });
});

describe('decideTermSignal — 묻지 않아야 하는 경우', () => {
  it('첫 조회가 그냥 성공했으면 증언이 아니다(6월에 9월 주간 미리 조회 등)', () => {
    expect(decideTermSignal({ ...AUGUST_SIGNAL, usedFallbackSemester: false })).toEqual({
      kind: 'none',
    });
  });

  it('이미 그 학기 개학일을 등록했으면 다시 묻지 않는다', () => {
    expect(
      decideTermSignal({ ...AUGUST_SIGNAL, termStartDates: { '2026-2': '2026-08-18' } }),
    ).toEqual({ kind: 'none' });
  });

  it('다른 학기 등록은 침묵 사유가 되지 않는다', () => {
    expect(
      decideTermSignal({ ...AUGUST_SIGNAL, termStartDates: { '2026-1': '2026-03-02' } }).kind,
    ).toBe('suggest');
  });

  it('관찰 학기가 앱이 아는 학기와 같으면 제안할 것이 없다', () => {
    expect(decideTermSignal({ ...AUGUST_SIGNAL, currentTerm: '2026-2' })).toEqual({ kind: 'none' });
  });

  it('뒤로 가는 제안은 하지 않는다(앱은 2학기, 관찰은 1학기)', () => {
    expect(
      decideTermSignal({ ...AUGUST_SIGNAL, currentTerm: '2026-2', observedTerm: '2026-1' }),
    ).toEqual({ kind: 'none' });
  });

  it('학년도가 다르면 개학이 아니라 지난/다음 해 조회다', () => {
    expect(decideTermSignal({ ...AUGUST_SIGNAL, observedTerm: '2027-2' })).toEqual({
      kind: 'none',
    });
  });

  it('날짜 형식이 깨졌으면 제안하지 않는다(추측 금지)', () => {
    expect(decideTermSignal({ ...AUGUST_SIGNAL, observedWeekStartIso: '20260817' })).toEqual({
      kind: 'none',
    });
  });

  it('학기 라벨이 깨졌으면 제안하지 않는다', () => {
    expect(decideTermSignal({ ...AUGUST_SIGNAL, observedTerm: '엉터리' })).toEqual({
      kind: 'none',
    });
    expect(decideTermSignal({ ...AUGUST_SIGNAL, currentTerm: '' })).toEqual({ kind: 'none' });
  });
});
