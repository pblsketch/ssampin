import { describe, it, expect } from 'vitest';
import {
  draftReadiness,
  isRetrospectNoticeDay,
  pastTermLapCount,
  rarelyUsesScenes,
  sameSchoolYear,
  summarizeScenes,
  termDisplayName,
} from './observationRetrospect';
import { EMPTY_SCHOOL_CALENDAR, buildSchoolCalendarDays } from './schoolCalendarDays';

describe('학기 돌아보기 알리는 날', () => {
  // 2026-12-31(목) 겨울방학식 — 그 주 월요일은 12-28
  it('종료일이 든 주의 등교일, 종료일까지', () => {
    expect(isRetrospectNoticeDay('2026-12-28', '2026-12-31', EMPTY_SCHOOL_CALENDAR)).toBe(true);
    expect(isRetrospectNoticeDay('2026-12-30', '2026-12-31', EMPTY_SCHOOL_CALENDAR)).toBe(true);
    expect(isRetrospectNoticeDay('2026-12-31', '2026-12-31', EMPTY_SCHOOL_CALENDAR)).toBe(true);
    expect(isRetrospectNoticeDay('2026-12-25', '2026-12-31', EMPTY_SCHOOL_CALENDAR)).toBe(false);
    expect(isRetrospectNoticeDay('2027-01-01', '2026-12-31', EMPTY_SCHOOL_CALENDAR)).toBe(false);
  });

  it('공휴일은 건너뛰고, 종료일을 모르면 알리지 않는다', () => {
    const cal = buildSchoolCalendarDays([], ['2026-12-28']);
    expect(isRetrospectNoticeDay('2026-12-28', '2026-12-31', cal)).toBe(false);
    expect(isRetrospectNoticeDay('2026-12-29', '2026-12-31', cal)).toBe(true);
    expect(isRetrospectNoticeDay('2026-12-29', null, cal)).toBe(false);
  });
});

describe('장면 조각', () => {
  const many = (n: number, slots?: string[]) =>
    Array.from({ length: n }, (_, i) => ({ ref: `s${i}`, ...(slots ? { slots } : {}) }));

  it('많이 남긴 장면 2개와 빈 기본 장면 — 장면 없는 기록은 세지 않는다', () => {
    const records = [
      ...many(5, ['시도']),
      ...many(3, ['질문', '시도']),
      ...many(3, ['융합']),
      ...many(4),
    ];
    const s = summarizeScenes(records, 'teaching');
    expect(s.topScenes).toEqual(['시도', '질문']);
    expect(s.emptyDefaultScenes).toEqual(['시행착오', '산출물', '피드백']);
  });

  it('장면 붙은 기록이 10건 미만이거나 20% 미만이면 거의 안 쓰는 반', () => {
    expect(rarelyUsesScenes([...many(9, ['시도'])])).toBe(true);
    expect(rarelyUsesScenes([...many(10, ['시도'])])).toBe(false);
    expect(rarelyUsesScenes([...many(10, ['시도']), ...many(41)])).toBe(true);
    expect(rarelyUsesScenes([...many(10, ['시도']), ...many(40)])).toBe(false);
  });
});

describe('초안 준비', () => {
  it('서로 다른 장면 3가지 이상이면 준비 — 부족한 학생은 구성원 순서로', () => {
    const r = draftReadiness(
      ['a', 'b', 'c'],
      [
        { ref: 'a', slots: ['질문', '시도'] },
        { ref: 'a', slots: ['시도', '내가 만든 장면'] },
        { ref: 'b', slots: ['질문'] },
        { ref: 'b', slots: ['질문'] },
        { ref: 'z', slots: ['질문', '시도', '융합'] }, // 구성원 아님
      ],
    );
    expect(r.readyCount).toBe(1);
    expect(r.notReadyRefs).toEqual(['b', 'c']);
  });
});

describe('지난 학기', () => {
  it('명렬을 모르면 저장된 끝 지점 수만, 알면 계산값(저장값 이상)', () => {
    expect(pastTermLapCount(2, null)).toBe(2);
    expect(pastTermLapCount(2, 3)).toBe(3);
    expect(pastTermLapCount(2, 1)).toBe(2);
    expect(pastTermLapCount(0, null)).toBe(0);
  });

  it('담임 명렬은 같은 학년도일 때만 지금 명렬로 본다', () => {
    expect(sameSchoolYear('2026-1', '2026-2')).toBe(true);
    expect(sameSchoolYear('2025-2', '2026-1')).toBe(false);
  });

  it('학기 이름', () => {
    expect(termDisplayName('2026-2')).toBe('2026학년도 2학기');
    expect(termDisplayName('이상한값')).toBe('이상한값');
  });
});
