import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  buildHolidayMap,
  buildEventMap,
  buildAdjustmentMap,
  termEndUnknownView,
} from '../lessonCountViewParts';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import type { LessonDayAdjustment } from '@domain/entities/CurriculumProgress';

/**
 * 차시 계산 재료 가공 계약 + **PC와 모바일이 같은 함수를 쓴다는 것 자체**를 잠근다.
 *
 * 두 화면이 각자 공휴일 지도를 만들고 학사일정을 분류하면, 한쪽만 고쳤을 때 **같은 반의 차시가
 * 기기마다 달라진다.** 그 어긋남은 사용자가 알아채기 어렵고, 알아채면 숫자 전체를 못 믿게 된다.
 * 그래서 값 검증과 함께 "두 훅이 이 파일을 쓰는가"를 소스에서 직접 확인한다.
 */

const ROOT = resolve(__dirname, '../../../..');

function ev(over: Partial<SchoolEvent> & { date: string; title: string }): SchoolEvent {
  return {
    id: `e-${over.date}-${over.title}`,
    categoryId: 'c1',
    ...over,
  } as SchoolEvent;
}

describe('buildEventMap — 학사일정 분류', () => {
  it('나이스 원본 행사명이 있으면 그쪽을 쓴다', () => {
    const map = buildEventMap([
      ev({
        date: '2026-10-09',
        title: '내가 고친 제목',
        neis: {
          eventId: 'x',
          eventName: '한글날',
          schoolYear: '2026',
          gradeYn: {
            grade1: true,
            grade2: true,
            grade3: true,
            grade4: true,
            grade5: true,
            grade6: true,
          },
          subtractDayType: '공휴일',
          loadDate: '',
          lastSyncAt: '',
        },
      }),
    ]);
    expect(map.get('2026-10-09')?.[0]?.title).toBe('한글날');
    expect(map.get('2026-10-09')?.[0]?.group).toBe('holiday');
  });

  it('숨긴 일정은 계산에서 뺀다', () => {
    // 화면에서 지운 행사가 계산에 남아 있으면, 왜 그 날이 빠졌는지 근거 목록에서 찾을 수 없다.
    const map = buildEventMap([ev({ date: '2026-10-09', title: '한글날', isHidden: true })]);
    expect(map.size).toBe(0);
  });

  it('같은 날 여러 행사를 모두 담는다', () => {
    const map = buildEventMap([
      ev({ date: '2026-10-15', title: '중간고사' }),
      ev({ date: '2026-10-15', title: '체육대회' }),
    ]);
    expect(map.get('2026-10-15')).toHaveLength(2);
  });
});

describe('buildAdjustmentMap — 정정은 반 단위다', () => {
  const adjustments: readonly LessonDayAdjustment[] = [
    { classId: 'tc-1', date: '2026-10-09', kind: 'hasLesson', updatedAt: '' },
    { classId: 'tc-2', date: '2026-10-09', kind: 'noLesson', updatedAt: '' },
  ];

  it('다른 반의 정정은 섞이지 않는다', () => {
    // "체육대회라 1학년만 수업 없음"처럼 같은 날도 반마다 갈린다.
    expect(buildAdjustmentMap(adjustments, 'tc-1').get('2026-10-09')).toBe('hasLesson');
    expect(buildAdjustmentMap(adjustments, 'tc-2').get('2026-10-09')).toBe('noLesson');
  });

  it('해당 반의 정정이 없으면 빈 지도', () => {
    expect(buildAdjustmentMap(adjustments, 'tc-없음').size).toBe(0);
  });
});

describe('buildHolidayMap — 수업일에 대해서만 찾는다', () => {
  it('공휴일인 날만 담긴다', () => {
    const map = buildHolidayMap(['2026-10-09', '2026-10-12']);
    expect(map.get('2026-10-09')).toBe('한글날');
    expect(map.has('2026-10-12')).toBe(false);
  });

  it('연도를 걸쳐도 각 해의 공휴일을 찾는다', () => {
    const map = buildHolidayMap(['2026-12-25', '2027-01-01']);
    expect(map.get('2026-12-25')).toBeTruthy();
    expect(map.get('2027-01-01')).toBeTruthy();
  });

  it('날짜가 없으면 빈 지도 (헛계산하지 않는다)', () => {
    expect(buildHolidayMap([]).size).toBe(0);
  });
});

describe('termEndUnknownView — 숫자를 보여주지 않는 상태', () => {
  it('needsTermEnd가 켜지고 숫자는 0이다', () => {
    const v = termEndUnknownView('2026-2');
    expect(v.needsTermEnd).toBe(true);
    expect(v.totalPeriods).toBe(0);
    expect(v.term).toBe('2026-2');
    // 모르는 날짜를 아는 척 채우지 않는다 — 화면이 "○○까지"라고 말해 버리면 거짓말이 된다.
    expect(v.termEndIso).toBeNull();
  });
});

describe('메타 — PC와 모바일이 같은 계산을 쓴다', () => {
  const HOOKS = [
    'src/adapters/hooks/useLessonCountEstimate.ts',
    'src/mobile/hooks/useMobileLessonCountEstimate.ts',
  ];

  for (const file of HOOKS) {
    it(`${file}이 공용 재료 가공(lessonCountViewParts)을 쓴다`, () => {
      const src = readFileSync(resolve(ROOT, file), 'utf-8');
      expect(src).toMatch(/lessonCountViewParts/);
      for (const fn of ['buildHolidayMap', 'buildEventMap', 'buildAdjustmentMap']) {
        expect(src, `${file}에 ${fn} 없음`).toContain(fn);
      }
    });

    it(`${file}이 같은 도메인 계산(buildLessonDayIndexResult → estimateLessonCount)을 쓴다`, () => {
      const src = readFileSync(resolve(ROOT, file), 'utf-8');
      expect(src).toContain('buildLessonDayIndexResult');
      expect(src).toContain('estimateLessonCount');
    });

    it(`${file}이 변동 시간표(overrides)를 계산에 넣는다`, () => {
      // 한쪽이 이걸 빼먹으면 결·보강이 반영되지 않아 같은 반 차시가 기기마다 달라진다.
      const src = readFileSync(resolve(ROOT, file), 'utf-8');
      expect(src).toMatch(/overrides/);
    });
  }
});
