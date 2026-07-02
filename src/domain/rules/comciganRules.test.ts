import { describe, it, expect } from 'vitest';
import {
  decodeLessonCode,
  decodeTimetable,
  summarizeTeachers,
  buildTeacherSchedule,
  COMCIGAN_DUMMY_SUBJECTS,
} from './comciganRules';
import type { ComciganRawSchoolData } from '../entities/ComciganTimetable';

describe('decodeLessonCode — 컴시간 splitData 공식 (2026-07 실측)', () => {
  it('온양여고 실측 코드를 정확히 분해한다 (separator=1000)', () => {
    // 1학년 1반 월요일 실측 행: [7, 64068, 13021, 36066, 50056, 41049, 7013, 31042]
    expect(decodeLessonCode(64068, 1000)).toEqual({
      teacherIndex: 68,
      subjectIndex: 64,
      changed: false,
    });
    expect(decodeLessonCode(13021, 1000)).toEqual({
      teacherIndex: 21,
      subjectIndex: 13,
      changed: false,
    });
    // 2학년 3반 화요일 실측 행의 짧은 코드
    expect(decodeLessonCode(2003, 1000)).toEqual({
      teacherIndex: 3,
      subjectIndex: 2,
      changed: false,
    });
    expect(decodeLessonCode(7013, 1000)).toEqual({
      teacherIndex: 13,
      subjectIndex: 7,
      changed: false,
    });
  });

  it('separator=100(기본값) 학교에서는 시간 플래그 자리를 걸러낸다', () => {
    // 상위 3자리 그룹 164 → 164 % 100 = 64 (앞자리 1은 동시수업 시간 플래그)
    expect(decodeLessonCode(164068, 100)).toEqual({
      teacherIndex: 68,
      subjectIndex: 64,
      changed: false,
    });
  });

  it("'>' 접두 문자열 코드는 변경 표시로 해석한다", () => {
    expect(decodeLessonCode('>13021', 1000)).toEqual({
      teacherIndex: 21,
      subjectIndex: 13,
      changed: true,
    });
  });

  it('0·빈 값·비숫자는 공강(null)으로 본다', () => {
    expect(decodeLessonCode(0, 1000)).toBeNull();
    expect(decodeLessonCode('', 1000)).toBeNull();
    expect(decodeLessonCode(undefined, 1000)).toBeNull();
    expect(decodeLessonCode(null, 1000)).toBeNull();
    expect(decodeLessonCode('abc', 1000)).toBeNull();
    expect(decodeLessonCode(-5, 1000)).toBeNull();
  });

  it('separator가 0 이하로 오면 기본값 100으로 방어한다', () => {
    expect(decodeLessonCode(164068, 0)).toEqual({
      teacherIndex: 68,
      subjectIndex: 64,
      changed: false,
    });
  });
});

/** 과목 idx s × 교사 idx t → 컴시간 수업 코드 */
const code = (s: number, t: number) => s * 1000 + t;

function makeFixture(): ComciganRawSchoolData {
  // teachers[3] = 백순* (실명 교사), teachers[4] = 자* (자율 더미)
  const teachers = ['', 'A교사*', 'B교사*', '백순*', '자*'];
  const subjects = ['', '국어', '수학', '언매', '자율'];
  return {
    schoolName: '테스트고',
    teachers,
    subjects,
    separator: 1000,
    baseGrid: [
      [],
      [
        // 1학년
        [],
        [
          // 1반: [요일0(미사용)], 월, 화
          [],
          [3, code(3, 3), code(2, 1), code(4, 4)], // 월: 언매(백순*), 수학(A), 자율(자*)
          [2, code(1, 2), code(3, 3)], // 화: 국어(B), 언매(백순*)
        ],
        [
          // 2반: 월요일 1교시에 백순* 언매 (합반 병합 검증용)
          [],
          [1, code(3, 3)],
        ],
      ],
    ],
  };
}

describe('decodeTimetable — 격자 → 수업 목록', () => {
  it('1-베이스 격자를 해석하고 [0] 메타값·공강을 건너뛴다', () => {
    const lessons = decodeTimetable(makeFixture());
    expect(lessons).toHaveLength(6);
    expect(lessons[0]).toEqual({
      grade: 1,
      classNum: 1,
      day: 1,
      period: 1,
      subject: '언매',
      teacherIndex: 3,
      teacherName: '백순*',
    });
  });

  it('교사/과목 인덱스가 목록 밖이면 해당 셀만 건너뛴다', () => {
    const fixture = makeFixture();
    const broken: ComciganRawSchoolData = {
      ...fixture,
      baseGrid: [[], [[], [[], [2, code(99, 1), code(1, 99)]]]],
    };
    expect(decodeTimetable(broken)).toHaveLength(0);
  });
});

describe('summarizeTeachers — 교사 요약과 더미 판별', () => {
  it('주간 시간·과목을 집계하고 자율/창체 전용 항목을 더미로 표시한다', () => {
    const summaries = summarizeTeachers(decodeTimetable(makeFixture()));

    const baek = summaries.find((s) => s.name === '백순*');
    expect(baek).toBeDefined();
    expect(baek!.weeklyHours).toBe(3);
    expect(baek!.subjects).toEqual(['언매']);
    expect(baek!.isDummy).toBe(false);

    const dummy = summaries.find((s) => s.name === '자*');
    expect(dummy).toBeDefined();
    expect(dummy!.isDummy).toBe(true);
    expect(COMCIGAN_DUMMY_SUBJECTS).toContain('자율');
  });
});

describe('buildTeacherSchedule — 교사 시간표 구성', () => {
  it("요일 '월'~'금' 키와 0-베이스 교시 배열, '학년-반' classroom으로 변환한다", () => {
    const lessons = decodeTimetable(makeFixture());
    const { schedule, maxPeriod, totalHours } = buildTeacherSchedule(lessons, 3);

    expect(totalHours).toBe(3);
    expect(maxPeriod).toBe(2);
    // 월 1교시: 1-1과 1-2 합반 → classroom 병합
    expect(schedule['월']?.[0]).toEqual({ subject: '언매', classroom: '1-1·1-2' });
    expect(schedule['월']?.[1]).toBeNull();
    expect(schedule['화']?.[0]).toBeNull();
    expect(schedule['화']?.[1]).toEqual({ subject: '언매', classroom: '1-1' });
    // 수업 없는 요일도 같은 길이의 null 배열
    expect(schedule['수']).toHaveLength(2);
    expect(schedule['금']?.every((p) => p === null)).toBe(true);
  });

  it('수업이 없는 교사는 빈 시간표(maxPeriod 0)를 반환한다', () => {
    const { schedule, maxPeriod, totalHours } = buildTeacherSchedule([], 3);
    expect(maxPeriod).toBe(0);
    expect(totalHours).toBe(0);
    expect(schedule['월']).toHaveLength(0);
  });
});
