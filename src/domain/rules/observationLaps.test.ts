import { describe, it, expect } from 'vitest';
import type { LapMark } from '../entities/ObservationLap';
import type { ObservationEntry } from './observationEntries';
import {
  computeLap,
  findLapMark,
  isValidLapMark,
  mergeLapMark,
  mergeLapMarkLists,
  upsertLapMark,
  type LapInput,
} from './observationLaps';

const CARD = 'subject:c1';
const TERM = '2026-2';

let seq = 0;
function rec(ref: string, date: string, createdAt?: number, id?: string): ObservationEntry {
  seq++;
  return { card: CARD, ref, date, createdAt: createdAt ?? seq, id: id ?? `r${seq}` };
}

function input(over: Partial<LapInput>): LapInput {
  return {
    card: CARD,
    term: TERM,
    termStart: '2026-08-18',
    today: '2026-09-23',
    entries: [],
    memberRefs: ['1', '2', '3'],
    mark: null,
    ...over,
  };
}

describe('지금 바퀴 — 칠해진 칸', () => {
  it('기록한 구성원만 칠해지고 남은 수를 센다', () => {
    const s = computeLap(input({ entries: [rec('1', '2026-09-01'), rec('1', '2026-09-02')] }));
    expect([...s.filledRefs]).toEqual(['1']);
    expect(s.remaining).toBe(2);
    expect(s.completedLaps).toBe(0);
    expect(s.newMark).toBeNull();
  });

  it('지난 학기 기록·오늘 뒤 날짜 기록·다른 카드 기록은 넣지 않는다', () => {
    const s = computeLap(
      input({
        entries: [
          rec('1', '2026-07-10'),
          rec('2', '2026-12-03'),
          { card: 'subject:other', ref: '3', date: '2026-09-01', createdAt: 1, id: 'o' },
        ],
      }),
    );
    expect(s.filledRefs.size).toBe(0);
    expect(s.currentLapHasRecords).toBe(false);
  });
});

describe('바퀴가 끝나는 때', () => {
  it('구성원 모두가 나오는 기록에서 끝나고 그 뒤 기록은 다음 바퀴', () => {
    const last = rec('3', '2026-09-05');
    const s = computeLap(
      input({
        entries: [rec('1', '2026-09-01'), rec('2', '2026-09-02'), last, rec('2', '2026-09-06')],
      }),
    );
    expect(s.completedLaps).toBe(1);
    expect(s.newBoundaryRecordId).toBe(last.id);
    expect(s.newMark).toMatchObject({
      card: CARD,
      term: TERM,
      completed: 1,
      boundary: { recordId: last.id },
    });
    expect([...s.filledRefs]).toEqual(['2']);
    expect(s.justFinished).toBe(false);
  });

  it('한 번에 여러 바퀴가 끝날 수 있다(여러 명 기록을 연달아 저장)', () => {
    const entries = ['1', '2', '3', '1', '2', '3'].map((r, i) => rec(r, '2026-09-10', 100 + i));
    const s = computeLap(input({ entries }));
    expect(s.completedLaps).toBe(2);
    expect(s.newMark?.completed).toBe(2);
    expect(s.justFinished).toBe(true);
  });

  it('구성원이 0명이면 끝나지 않는다', () => {
    const s = computeLap(input({ memberRefs: [], entries: [rec('1', '2026-09-01')] }));
    expect(s.completedLaps).toBe(0);
    expect(s.remaining).toBe(0);
  });

  it('구성원이 아닌 학생 기록만으로는 칠해지지 않는다', () => {
    const s = computeLap(input({ entries: [rec('9', '2026-09-01')] }));
    expect(s.filledRefs.size).toBe(0);
    expect(s.currentLapHasRecords).toBe(false);
  });

  it('구성원 아닌 학생(빠진 학생 등) 기록은 막 끝난 모습을 거두지 않는다', () => {
    const entries = ['1', '2', '3'].map((r, i) => rec(r, '2026-09-10', 200 + i));
    const s = computeLap(input({ entries: [...entries, rec('빠진학생', '2026-09-11')] }));
    expect(s.justFinished).toBe(true);
  });
});

describe('끝난 바퀴는 그대로', () => {
  const b = rec('3', '2026-09-05', 500, 'boundary');
  const mark: LapMark = {
    card: CARD,
    term: TERM,
    completed: 1,
    boundary: { date: b.date, createdAt: b.createdAt, recordId: b.id },
  };

  it('끝 지점 앞의 기록은 지금 바퀴에 들어가지 않는다 — 지난 날짜로 더한 기록 포함', () => {
    const s = computeLap(
      input({
        mark,
        entries: [rec('1', '2026-09-01'), b, rec('2', '2026-09-03', 900, 'backdated')],
      }),
    );
    expect(s.filledRefs.size).toBe(0);
    expect(s.completedLaps).toBe(1);
  });

  it('끝 지점의 기록이 지워져도 기준 위치는 그대로다', () => {
    const s = computeLap(input({ mark, entries: [rec('1', '2026-09-06')] }));
    expect([...s.filledRefs]).toEqual(['1']);
    expect(s.completedLaps).toBe(1);
  });

  it('전입생·돌아온 학생은 지금 바퀴에만 들어온다 — 끝난 바퀴 수는 그대로', () => {
    const s = computeLap(input({ mark, memberRefs: ['1', '2', '3', 'new'], entries: [b] }));
    expect(s.completedLaps).toBe(1);
    expect(s.justFinished).toBe(true);
    // 막 끝난 모습: 끝 지점 이전 기록이 있는 학생만 칠해 보여 준다 — 새 학생은 빈칸
    expect(s.recordedBeforeBoundaryRefs.has('3')).toBe(true);
    expect(s.recordedBeforeBoundaryRefs.has('new')).toBe(false);
  });

  it('다른 학기의 끝 지점은 무시한다 — 학기마다 새로 시작', () => {
    const old: LapMark = { ...mark, term: '2026-1' };
    const s = computeLap(input({ mark: old, entries: [rec('1', '2026-09-06')] }));
    expect(s.completedLaps).toBe(0);
  });

  it('구성원만 바뀌어 계산상 끝난 바퀴는 다시 넣으면 원래대로 돌아온다', () => {
    const entries = [rec('1', '2026-09-10'), rec('2', '2026-09-11')];
    const excluded = computeLap(input({ memberRefs: ['1', '2'], entries }));
    expect(excluded.completedLaps).toBe(1); // 계산상 완료 — 저장은 호출자가 정한다
    const readded = computeLap(input({ memberRefs: ['1', '2', '3'], entries }));
    expect(readded.completedLaps).toBe(0);
    expect(readded.remaining).toBe(1);
  });
});

describe('끝 지점 저장·병합', () => {
  const m = (date: string, createdAt: number, completed: number, card = CARD): LapMark => ({
    card,
    term: TERM,
    completed,
    boundary: { date, createdAt, recordId: `${date}-${createdAt}` },
  });

  it('두 값이 만나면 끝 지점은 더 뒤, 바퀴 수는 더 큰 값', () => {
    const merged = mergeLapMark(m('2026-09-05', 1, 3), m('2026-09-20', 1, 2));
    expect(merged.boundary.date).toBe('2026-09-20');
    expect(merged.completed).toBe(3);
  });

  it('끝 지점이 같으면 더 큰 바퀴 수', () => {
    expect(mergeLapMark(m('2026-09-05', 1, 1), m('2026-09-05', 1, 2)).completed).toBe(2);
  });

  it('더 뒤일 때만 저장한다 — 뒤로 가지 않는다', () => {
    const base = [m('2026-09-10', 1, 2)];
    expect(upsertLapMark(base, m('2026-09-05', 1, 2)).changed).toBe(false);
    expect(upsertLapMark(base, m('2026-09-10', 1, 2)).changed).toBe(false);
    // 앞이지만 바퀴 수가 크면 끝 지점은 그대로, 바퀴 수만 올린다(병합 규칙과 같다)
    const raised = upsertLapMark(base, m('2026-09-05', 1, 3));
    expect(raised.changed).toBe(true);
    expect(raised.marks[0]?.boundary.date).toBe('2026-09-10');
    expect(raised.marks[0]?.completed).toBe(3);
    const later = upsertLapMark(base, m('2026-09-12', 1, 3));
    expect(later.changed).toBe(true);
    expect(later.marks).toHaveLength(1);
    expect(later.marks[0]?.boundary.date).toBe('2026-09-12');
  });

  it('목록 병합은 (카드, 학기)마다 하나로 모으고 깨진 항목은 버린다', () => {
    const merged = mergeLapMarkLists(
      [m('2026-09-05', 1, 1), m('2026-09-05', 1, 1, 'homeroom')],
      [m('2026-09-08', 1, 2), { bogus: true } as unknown as LapMark],
    );
    expect(merged).toHaveLength(2);
    expect(findLapMark(merged, CARD, TERM)?.completed).toBe(2);
    expect(findLapMark(merged, 'homeroom', TERM)?.completed).toBe(1);
  });

  it('끝 지점 모양 검사', () => {
    expect(isValidLapMark(m('2026-09-05', 1, 1))).toBe(true);
    expect(isValidLapMark({ ...m('2026-09-05', 1, 1), completed: 0 })).toBe(false);
    expect(isValidLapMark(null)).toBe(false);
  });
});
