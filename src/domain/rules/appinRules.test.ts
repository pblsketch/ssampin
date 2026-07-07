import { describe, it, expect } from 'vitest';
import {
  parseCell,
  parseGrid,
  parseAppinClasses,
  gradesOf,
  classesOfGrade,
  buildClassScheduleFromAppin,
  buildTeacherScheduleFromAppin,
  estimateWeekFromDate,
  countWeekFiles,
  currentWeekByModified,
  weekFileName,
  weekOfFileName,
  appinRegionCandidates,
  parseAppinDayTimes,
} from './appinRules';
import type { AppinFileMeta } from '../entities/AppinTimetable';

describe('appinRules — 셀/격자 파싱', () => {
  it('parseCell: 빈칸/과목/과목·교실/서식마커', () => {
    expect(parseCell('')).toBeNull();
    expect(parseCell('국어')).toEqual({ subject: '국어', room: null });
    expect(parseCell('공통수학1/101')).toEqual({ subject: '공통수학1', room: '101' });
    expect(parseCell('@B동아@K')).toEqual({ subject: '동아', room: null });
    // '*'(이동수업/분반 표시) 제거, '***'는 마커만 남아 공강 처리
    expect(parseCell('*대수')).toEqual({ subject: '대수', room: null });
    expect(parseCell('***')).toBeNull();
    expect(parseCell('*진로/2-5')).toEqual({ subject: '진로', room: '2-5' });
  });

  it('parseGrid: 줄=대상, 쉼표=요일, 캐럿=교시, 트레일링 빈요일 제거', () => {
    // 한 줄: 월=[국어, 빈, 수학], 화=[빈, 체육] + 트레일링 쉼표
    const grids = parseGrid('국어^^수학,^체육,');
    expect(grids).toHaveLength(1);
    const [row] = grids;
    expect(row).toHaveLength(2); // 요일 2개(트레일링 빈요일 제거)
    expect(row![0]![0]).toEqual({ subject: '국어', room: null });
    expect(row![0]![1]).toBeNull();
    expect(row![0]![2]).toEqual({ subject: '수학', room: null });
    expect(row![1]![1]).toEqual({ subject: '체육', room: null });
  });

  it('parseGrid: 여러 줄 = 여러 대상', () => {
    const grids = parseGrid('국어,수학\n영어,과학');
    expect(grids).toHaveLength(2);
    expect(grids[1]![0]![0]).toEqual({ subject: '영어', room: null });
  });
});

describe('appinRules — 학급 파생', () => {
  it("parseAppinClasses: 'G-C' 라벨만 학급으로, index 보존", () => {
    const classes = parseAppinClasses(['1-1', '1-2', '101', '미술실', '2-1']);
    expect(classes).toEqual([
      { grade: 1, classNum: 1, label: '1-1', index: 0 },
      { grade: 1, classNum: 2, label: '1-2', index: 1 },
      { grade: 2, classNum: 1, label: '2-1', index: 4 },
    ]);
  });

  it('gradesOf / classesOfGrade', () => {
    const classes = parseAppinClasses(['1-1', '2-3', '1-2', '2-1']);
    expect(gradesOf(classes)).toEqual([1, 2]);
    expect(classesOfGrade(classes, 2).map((c) => c.classNum)).toEqual([1, 3]);
  });
});

describe('appinRules — 시간표 변환', () => {
  // 월=[국어, 공강, 수학], 화=[체육]
  const dayGrid = parseGrid('국어^^수학,체육')[0]!;

  it('buildClassScheduleFromAppin: 요일 월~금, 빈칸 {subject:"",teacher:""}, maxPeriod', () => {
    const { schedule, maxPeriod } = buildClassScheduleFromAppin(dayGrid);
    expect(maxPeriod).toBe(3);
    expect(schedule['월']).toEqual([
      { subject: '국어', teacher: '' },
      { subject: '', teacher: '' },
      { subject: '수학', teacher: '' },
    ]);
    expect(schedule['화']![0]).toEqual({ subject: '체육', teacher: '' });
    // 수업 없는 요일도 maxPeriod 길이로 채움
    expect(schedule['수']).toHaveLength(3);
    expect(schedule['수']![0]).toEqual({ subject: '', teacher: '' });
  });

  it('buildTeacherScheduleFromAppin: 공강 null, room→classroom', () => {
    const grid = parseGrid('국어/2-3^^수학/1-1,')[0]!;
    const { schedule } = buildTeacherScheduleFromAppin(grid);
    expect(schedule['월']![0]).toEqual({ subject: '국어', classroom: '2-3' });
    expect(schedule['월']![1]).toBeNull();
    expect(schedule['월']![2]).toEqual({ subject: '수학', classroom: '1-1' });
  });
});

describe('appinRules — 주차 추정', () => {
  it('estimateWeekFromDate: 마지막주차 앵커 기준 역산 (실측: 20270220/53 → 2026-07-07 = 20주)', () => {
    expect(estimateWeekFromDate('20270220', 53, new Date('2026-07-07'))).toBe(20);
    expect(estimateWeekFromDate('20270220', 53, new Date('2026-06-15'))).toBe(17);
    // clamp
    expect(estimateWeekFromDate('20270220', 53, new Date('2027-12-31'))).toBe(53);
    expect(estimateWeekFromDate('20270220', 53, new Date('2025-01-01'))).toBe(1);
    // 잘못된 날짜
    expect(estimateWeekFromDate(undefined, 53, new Date('2026-07-07'))).toBeNull();
    expect(estimateWeekFromDate('bad', 53, new Date('2026-07-07'))).toBeNull();
  });

  it('countWeekFiles / currentWeekByModified: 최신 수정 h파일 = 현재 주차', () => {
    const files: AppinFileMeta[] = [
      { name: 'h1.txt', modified: '2026-04-08T13:11:00', size: '324' },
      { name: 'h20.txt', modified: '2026-07-07T10:29:00', size: '8.2k' },
      { name: 'h21.txt', modified: '2026-07-06T15:55:00', size: '6.7k' },
      { name: 'g20.txt', modified: '2026-07-07T10:29:00', size: '9k' }, // g는 무시
      { name: 'ele.txt', modified: '2026-04-08T13:11:00', size: '187' },
    ];
    expect(countWeekFiles(files)).toBe(3);
    // 오늘(07-08) 기준 → 07-07 갱신된 h20
    expect(currentWeekByModified(files, '2026-07-08T00:00:00')).toBe(20);
    // 06-20 기준 → 그 이전 최신은 h1(04-08) (h20/h21은 미래 갱신)
    expect(currentWeekByModified(files, '2026-06-20T00:00:00')).toBe(1);
  });

  it('currentWeekByModified: 수정시각 동률 시 — preferWeek 없으면 큰 주차, 있으면 앵커 근접 주차', () => {
    // 학기초 일괄 업로드: h1~h3 이 같은 분에 올라간 동률 상황
    const files: AppinFileMeta[] = [
      { name: 'h1.txt', modified: '2026-03-02T09:00:00', size: '300' },
      { name: 'h2.txt', modified: '2026-03-02T09:00:00', size: '300' },
      { name: 'h3.txt', modified: '2026-03-02T09:00:00', size: '300' },
    ];
    // preferWeek 없음 → 기존 동작(큰 주차 3)
    expect(currentWeekByModified(files, '2026-03-05T00:00:00')).toBe(3);
    // 날짜 앵커가 1주차를 가리키면 동률 중 1 선택
    expect(currentWeekByModified(files, '2026-03-05T00:00:00', 1)).toBe(1);
    // 앵커가 2주차면 2 선택
    expect(currentWeekByModified(files, '2026-03-05T00:00:00', 2)).toBe(2);
  });

  it('weekFileName / weekOfFileName', () => {
    expect(weekFileName('h', 20)).toBe('h20.txt');
    expect(weekFileName('t', 5)).toBe('t5.txt');
    expect(weekOfFileName('g12.txt')).toBe(12);
    expect(weekOfFileName('ele.txt')).toBeNull();
  });
});

describe('appinRules — 나이스 주소 → 압핀 시/군 후보', () => {
  it('광역시: 광역시명 우선(대구)', () => {
    const c = appinRegionCandidates('대구광역시 남구 대명로 123');
    expect(c[0]).toBe('대구');
    expect(c).toContain('대구광역시');
    expect(c).toContain('남구');
  });
  it('도: 시/군 우선(경산)', () => {
    const c = appinRegionCandidates('경상북도 경산시 대학로 45');
    expect(c[0]).toBe('경산시');
    expect(c).toContain('경산');
    expect(c).toContain('경상북도');
  });
  it('빈 주소는 빈 배열', () => {
    expect(appinRegionCandidates('')).toEqual([]);
  });
});

describe('appinRules — s파일 교시 시각', () => {
  it('parseAppinDayTimes: 첫 블록에서 교시 시작시각(컴시간 포맷)', () => {
    const s = '0830093010301130132014201520        0830093010301130132014201520';
    expect(parseAppinDayTimes(s)).toEqual([
      '1(08:30)',
      '2(09:30)',
      '3(10:30)',
      '4(11:30)',
      '5(13:20)',
      '6(14:20)',
      '7(15:20)',
    ]);
    expect(parseAppinDayTimes('')).toEqual([]);
  });
});
