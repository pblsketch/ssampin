import { describe, it, expect } from 'vitest';
import {
  HOMEROOM_CARD,
  comparePosition,
  homeroomEntries,
  isCountedHomeroomRecord,
  lastObservationDateByRef,
  sortEntries,
  subjectCard,
  subjectEntries,
  toCreatedAtMs,
} from './observationEntries';

describe('관찰로 세는 기록 — 출결만 뺀다', () => {
  it('출결 갈래는 세지 않는다', () => {
    expect(isCountedHomeroomRecord({ category: 'attendance' })).toBe(false);
  });

  it('상담(학부모상담 포함)·생활·기타(가정연락 포함)·직접 만든 갈래는 센다', () => {
    for (const category of ['counseling', 'life', 'etc', 'my-custom']) {
      expect(isCountedHomeroomRecord({ category })).toBe(true);
    }
  });

  it('담임 기록을 모으면 출결 기록이 빠진다', () => {
    const entries = homeroomEntries([
      {
        id: 'a',
        studentId: 's1',
        category: 'attendance',
        date: '2026-09-01',
        createdAt: '2026-09-01T01:00:00Z',
      },
      {
        id: 'b',
        studentId: 's1',
        category: 'life',
        date: '2026-09-02',
        createdAt: '2026-09-02T01:00:00Z',
      },
    ]);
    expect(entries.map((e) => e.id)).toEqual(['b']);
    expect(entries[0]?.card).toBe(HOMEROOM_CARD);
  });

  it('여러 명 기록(같은 내용이 학생마다 한 건씩)은 학생마다 따로 센다', () => {
    const entries = subjectEntries([
      { id: 'x1', studentId: '1', classId: 'c1', date: '2026-09-02', createdAt: 10 },
      { id: 'x2', studentId: '2', classId: 'c1', date: '2026-09-02', createdAt: 10 },
    ]);
    expect(entries.map((e) => e.ref)).toEqual(['1', '2']);
    expect(entries[0]?.card).toBe(subjectCard('c1'));
  });

  it('날짜 형식이 아닌 기록은 버린다', () => {
    expect(
      subjectEntries([{ id: 'x', studentId: '1', classId: 'c', date: '9월 2일', createdAt: 1 }]),
    ).toEqual([]);
  });
});

describe('정렬 순서 — 날짜, 만든 시각, id', () => {
  it('날짜가 먼저, 같은 날이면 만든 시각, 그것도 같으면 id', () => {
    const e = (id: string, date: string, createdAt: number) => ({
      card: 'homeroom',
      ref: id,
      date,
      createdAt,
      id,
    });
    const sorted = sortEntries([
      e('c', '2026-09-02', 5),
      e('b', '2026-09-02', 5),
      e('a', '2026-09-02', 1),
      e('z', '2026-09-01', 99),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(['z', 'a', 'b', 'c']);
    expect(comparePosition(e('a', '2026-09-01', 1), e('a', '2026-09-01', 1))).toBe(0);
  });

  it('ISO 문자열과 ms 숫자를 모두 ms 로 바꾼다', () => {
    expect(toCreatedAtMs('2026-09-01T00:00:00.000Z')).toBe(Date.parse('2026-09-01T00:00:00.000Z'));
    expect(toCreatedAtMs(123)).toBe(123);
    expect(toCreatedAtMs(undefined)).toBe(0);
    expect(toCreatedAtMs('엉망')).toBe(0);
  });
});

describe('학생별 마지막 관찰 날짜', () => {
  it('오늘보다 뒤 날짜 기록은 그날이 올 때까지 세지 않는다', () => {
    const entries = homeroomEntries([
      { id: '1', studentId: 's1', category: 'life', date: '2026-09-10', createdAt: '' },
      { id: '2', studentId: 's1', category: 'life', date: '2026-12-03', createdAt: '' },
    ]);
    expect(lastObservationDateByRef(entries, '2026-09-23').get('s1')).toBe('2026-09-10');
    expect(lastObservationDateByRef(entries, '2026-12-03').get('s1')).toBe('2026-12-03');
  });

  it('출결만 있는 학생은 마지막 관찰 날짜가 없다', () => {
    const entries = homeroomEntries([
      { id: '1', studentId: 's1', category: 'attendance', date: '2026-09-10', createdAt: '' },
    ]);
    expect(lastObservationDateByRef(entries, '2026-09-23').has('s1')).toBe(false);
  });
});
