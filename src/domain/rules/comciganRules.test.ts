import { describe, it, expect } from 'vitest';
import {
  decodeLessonCode,
  decodeTimetable,
  detectDecodeAnomaly,
  summarizeTeachers,
  buildTeacherSchedule,
  buildClassSchedule,
  listComciganClasses,
  parseComciganPeriodTimes,
  periodTimesToSettingsPatch,
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

describe('listComciganClasses — 등장 학년-반 목록', () => {
  it('격자에 실제 있는 학년-반만 학년·반 오름차순으로 반환한다', () => {
    const lessons = decodeTimetable(makeFixture());
    expect(listComciganClasses(lessons)).toEqual([
      { grade: 1, classNum: 1 },
      { grade: 1, classNum: 2 },
    ]);
  });

  it('수업이 없으면 빈 배열', () => {
    expect(listComciganClasses([])).toEqual([]);
  });
});

describe('buildClassSchedule — 학급 시간표 구성 (교사명 포함)', () => {
  it("'월'~'금' 키·빈칸 {subject:'',teacher:''} 규약으로 담당 교사까지 채운다", () => {
    const lessons = decodeTimetable(makeFixture());
    const { schedule, maxPeriod } = buildClassSchedule(lessons, 1, 1);

    expect(maxPeriod).toBe(3); // 1-1 월요일이 3교시로 가장 김
    expect(schedule['월']).toEqual([
      { subject: '언매', teacher: '백순*' },
      { subject: '수학', teacher: 'A교사*' },
      { subject: '자율', teacher: '자*' },
    ]);
    // 화요일은 2교시까지만 수업 → 3교시는 빈칸으로 패딩
    expect(schedule['화']).toEqual([
      { subject: '국어', teacher: 'B교사*' },
      { subject: '언매', teacher: '백순*' },
      { subject: '', teacher: '' },
    ]);
    // 수업 없는 요일도 같은 길이의 빈칸 배열
    expect(schedule['수']).toEqual([
      { subject: '', teacher: '' },
      { subject: '', teacher: '' },
      { subject: '', teacher: '' },
    ]);
  });

  it('다른 반(1-2)은 자기 수업만 담는다', () => {
    const lessons = decodeTimetable(makeFixture());
    const { schedule, maxPeriod } = buildClassSchedule(lessons, 1, 2);
    expect(maxPeriod).toBe(1);
    expect(schedule['월']).toEqual([{ subject: '언매', teacher: '백순*' }]);
    expect(schedule['화']).toEqual([{ subject: '', teacher: '' }]);
  });

  it('존재하지 않는 반은 maxPeriod 0의 빈 시간표', () => {
    const lessons = decodeTimetable(makeFixture());
    const { schedule, maxPeriod } = buildClassSchedule(lessons, 9, 9);
    expect(maxPeriod).toBe(0);
    expect(schedule['월']).toHaveLength(0);
  });
});

describe('parseComciganPeriodTimes — 일과시간 → 교시 시각', () => {
  it('실측 일과시간을 교시 시각으로 변환하고 점심(4교시 후)을 추정한다', () => {
    // 실측: 4교시 11:40 → 5교시 13:40 (점심 갭). 시작 간격 60분 − 쉬는시간 10분 = 수업 50분
    const dayTimes = [
      '1(08:40)',
      '2(09:40)',
      '3(10:40)',
      '4(11:40)',
      '5(13:40)',
      '6(14:40)',
      '7(15:40)',
      '8(16:40)',
    ];
    const result = parseComciganPeriodTimes(dayTimes, 'high');
    expect(result).not.toBeNull();
    expect(result!.periodTimes).toHaveLength(8);
    expect(result!.periodTimes[0]).toEqual({ period: 1, start: '08:40', end: '09:30' });
    // 4교시 끝(=점심 시작)이 12:25가 아니라 12:30 이어야 한다 (버그 회귀 방지)
    expect(result!.periodTimes[3]).toEqual({ period: 4, start: '11:40', end: '12:30' });
    expect(result!.periodTimes[4]).toEqual({ period: 5, start: '13:40', end: '14:30' });
    expect(result!.lunchAfterPeriod).toBe(4);
  });

  it('학교급 설정이 실제와 달라도 시작 간격에서 수업 길이를 역산한다', () => {
    // 학교급을 'middle'로 넘겨도 데이터 간격 60분 → 수업 50분으로 자동 교정
    const result = parseComciganPeriodTimes(['2(09:40)', '1(08:40)'], 'middle');
    expect(result!.periodTimes.map((p) => p.period)).toEqual([1, 2]);
    expect(result!.periodTimes[0]).toEqual({ period: 1, start: '08:40', end: '09:30' });
  });

  it('역산할 연속 교시가 없으면 학교급 기본 수업시간으로 폴백한다', () => {
    // 단일 교시 → 간격 계산 불가 → 중학교 기본 45분
    const result = parseComciganPeriodTimes(['3(10:00)'], 'middle');
    expect(result!.periodTimes[0]).toEqual({ period: 3, start: '10:00', end: '10:45' });
  });

  it('미제공·빈 배열·불량 입력은 null 을 반환한다 (throw 없음)', () => {
    expect(parseComciganPeriodTimes(undefined, 'high')).toBeNull();
    expect(parseComciganPeriodTimes(null, 'high')).toBeNull();
    expect(parseComciganPeriodTimes([], 'high')).toBeNull();
    expect(parseComciganPeriodTimes(['정보 없음', 'x'], 'high')).toBeNull();
  });
});

describe('periodTimesToSettingsPatch — 교시 시각 → 설정 payload', () => {
  it('점심 위치를 알면 점심 시작·끝(직전 교시 끝 ~ 다음 교시 시작)까지 채운다', () => {
    const parsed = parseComciganPeriodTimes(
      ['1(08:40)', '2(09:40)', '3(10:40)', '4(11:40)', '5(13:40)'],
      'high',
    )!;
    const patch = periodTimesToSettingsPatch(parsed);
    expect(patch.lunchAfterPeriod).toBe(4);
    expect(patch.lunchStart).toBe('12:30'); // 4교시 끝
    expect(patch.lunchEnd).toBe('13:40'); // 5교시 시작(컴시간 정확값)
    // 값은 그대로 통과한다. 다만 동일 참조는 아니다 —
    // 기존 교시 이름을 승계(mergePeriodLabels)하느라 새 배열을 만들기 때문.
    expect(patch.periodTimes).toEqual(parsed.periodTimes);
  });

  it('점심을 못 찾으면 periodTimes만 담고 점심 필드는 비운다', () => {
    const parsed = parseComciganPeriodTimes(['1(08:40)', '2(09:40)'], 'high')!;
    const patch = periodTimesToSettingsPatch(parsed);
    expect(patch.lunchAfterPeriod).toBeUndefined();
    expect(patch.lunchStart).toBeUndefined();
    expect(patch.lunchEnd).toBeUndefined();
    expect(patch.periodTimes).toHaveLength(2);
  });
});

/** 같은 마스킹 이름 '김민*'을 서로 다른 인덱스(1·2)로 가진 학교 */
function makeCollisionFixture(): ComciganRawSchoolData {
  const teachers = ['', '김민*', '김민*', '이철*'];
  const subjects = ['', '국어', '수학', '영어'];
  return {
    schoolName: '동명이인고',
    teachers,
    subjects,
    separator: 1000,
    baseGrid: [
      [],
      [
        [],
        [
          [],
          [2, code(1, 1), code(2, 2)], // 월: 국어(김민* idx1), 수학(김민* idx2)
          [1, code(3, 3)], // 화: 영어(이철* idx3)
        ],
      ],
    ],
  };
}

/** 한 반의 월~금 8교시를 전부 한 교사(idx1)로 몰아 40시간(>30) 만드는 병합 시뮬 */
function makeOverloadFixture(): ComciganRawSchoolData {
  const day = [8, ...Array.from({ length: 8 }, () => code(1, 1))];
  const classArr = [[], day, day, day, day, day]; // [요일0(미사용), 월, 화, 수, 목, 금]
  return {
    schoolName: '과부하고',
    teachers: ['', '과로*', 'B교사*'],
    subjects: ['', '국어'],
    separator: 1000,
    baseGrid: [[], [[], classArr]],
  };
}

describe('summarizeTeachers — 마스킹 동명이인 구분(maskedNameCollision)', () => {
  it('같은 마스킹 이름이 2명 이상이면 각각 true, 항목은 분리 유지', () => {
    const summaries = summarizeTeachers(decodeTimetable(makeCollisionFixture()));
    const kims = summaries.filter((s) => s.name === '김민*');
    expect(kims).toHaveLength(2); // 인덱스 별개 → 병합되지 않음
    expect(kims.every((s) => s.maskedNameCollision)).toBe(true);
    // 서로 다른 과목을 각자 유지(데이터 병합 아님)
    expect(new Set(kims.flatMap((s) => s.subjects))).toEqual(new Set(['국어', '수학']));
  });

  it('유일한 이름은 maskedNameCollision=false', () => {
    const summaries = summarizeTeachers(decodeTimetable(makeCollisionFixture()));
    const lee = summaries.find((s) => s.name === '이철*');
    expect(lee?.maskedNameCollision).toBe(false);
  });

  it('정상 학교(makeFixture)는 동명이인이 없어 전부 false', () => {
    const summaries = summarizeTeachers(decodeTimetable(makeFixture()));
    expect(summaries.every((s) => !s.maskedNameCollision)).toBe(true);
  });
});

describe('detectDecodeAnomaly — 해석 이상 감지(비차단 경고 신호)', () => {
  it('정상 학교 픽스처는 suspicious=false (오탐 0)', () => {
    const fixture = makeFixture();
    const report = detectDecodeAnomaly(fixture, decodeTimetable(fixture));
    expect(report.suspicious).toBe(false);
    expect(report.reasons).toEqual([]);
  });

  it('한 인덱스로 수업이 대량 병합되면(비정상 시수) suspicious=true', () => {
    const fixture = makeOverloadFixture();
    const lessons = decodeTimetable(fixture);
    const report = detectDecodeAnomaly(fixture, lessons);
    expect(report.suspicious).toBe(true);
    expect(report.reasons.length).toBeGreaterThan(0);
    // 병합이 요약에도 그대로 드러난다(한 명에게 40시간) — 감춰지지 않음
    expect(summarizeTeachers(lessons).find((t) => t.name === '과로*')?.weeklyHours).toBe(40);
  });

  it('교사·과목 인덱스가 목록을 크게 벗어나면(구조 변경) suspicious=true', () => {
    const fixture = makeFixture();
    const broken: ComciganRawSchoolData = {
      ...fixture,
      // 모든 셀이 teachers/subjects 범위 밖 → decodeTimetable은 버리지만 비율로 감지
      baseGrid: [[], [[], [[], [3, code(99, 99), code(98, 98), code(97, 97)]]]],
    };
    const report = detectDecodeAnomaly(broken, decodeTimetable(broken));
    expect(report.suspicious).toBe(true);
  });
});
