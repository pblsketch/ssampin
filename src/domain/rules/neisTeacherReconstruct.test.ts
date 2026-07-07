import { describe, it, expect } from 'vitest';
import {
  normalizeSubject,
  classKey,
  reconstructTeacherSchedule,
  deriveClassFromTeachingClass,
  distinctStudentClasses,
  isLikelyMovementClass,
  type TeacherClassMapping,
} from './neisTeacherReconstruct';
import type { NeisTimetableRow } from '../entities/NeisTimetable';
import type { TeachingClass, TeachingClassStudent } from '../entities/TeachingClass';

/**
 * 요일 앵커: 2024-01-01 = 월요일인 깨끗한 한 주.
 *   20240101=월, 20240102=화, 20240103=수, 20240104=목, 20240105=금, 20240106=토, 20240107=일
 */
const 월 = '20240101';
const 화 = '20240102';
const 수 = '20240103';
const 목 = '20240104';

function row(
  perio: number,
  subject: string,
  ymd: string,
  grade: number,
  classNum: number,
): NeisTimetableRow {
  return {
    PERIO: String(perio),
    ITRT_CNTNT: subject,
    ALL_TI_YMD: ymd,
    GRADE: String(grade),
    CLASS_NM: String(classNum),
  };
}

describe('normalizeSubject — 과목명 매칭 정규화', () => {
  it('로마숫자를 아라비아 숫자로 바꾼다 (수학Ⅰ ↔ 수학1)', () => {
    expect(normalizeSubject('수학Ⅰ')).toBe(normalizeSubject('수학1'));
    expect(normalizeSubject('영어Ⅱ')).toBe('영어2');
  });

  it('괄호와 그 안 내용을 제거한다 (수학(심화) → 수학)', () => {
    expect(normalizeSubject('수학(심화)')).toBe('수학');
    expect(normalizeSubject('과학Ⅰ(실험)')).toBe('과학1');
  });

  it('공백·가운뎃점·구분자를 제거한다', () => {
    expect(normalizeSubject('확률과 통계')).toBe(normalizeSubject('확률과통계'));
    expect(normalizeSubject('통합 사회')).toBe('통합사회');
  });

  it('빈 문자열은 빈 문자열', () => {
    expect(normalizeSubject('')).toBe('');
  });
});

describe('reconstructTeacherSchedule — 학급 시간표 재조합', () => {
  const rowsByClass = new Map<string, readonly NeisTimetableRow[]>([
    [
      classKey(2, 1),
      [
        row(1, '수학', 월, 2, 1), // 월1 수학
        row(2, '국어', 월, 2, 1), // 교사 미담당 → 무시
        row(1, '수학', 화, 2, 1), // 화1 수학
      ],
    ],
    [
      classKey(2, 2),
      [
        row(1, '수학', 월, 2, 2), // 월1 수학 → 2-1과 합반 병합
        row(3, '영어', 화, 2, 2), // 교사 미담당 → 무시
      ],
    ],
    [
      classKey(3, 1),
      [
        row(2, '과학Ⅰ', 수, 3, 1), // 수2 (로마숫자 매칭)
        row(1, '과학Ⅰ(실험)', 목, 3, 1), // 목1 (로마숫자+괄호 매칭)
      ],
    ],
  ]);

  const mappings: TeacherClassMapping[] = [
    { classId: 'c1', subject: '수학', grade: 2, classNum: 1 },
    { classId: 'c2', subject: '수학', grade: 2, classNum: 2 },
    { classId: 'c3', subject: '과학1', grade: 3, classNum: 1 },
  ];

  it("'월'~'금' 키·0-베이스 교시·합반 '·' 병합·로마숫자 매칭으로 교사 시간표를 만든다", () => {
    const { schedule, maxPeriod, matchedCount, unmatched } = reconstructTeacherSchedule(
      mappings,
      rowsByClass,
    );

    expect(maxPeriod).toBe(2);
    // 월 1교시: 2-1과 2-2 합반 → classroom 병합
    expect(schedule['월']?.[0]).toEqual({ subject: '수학', classroom: '2-1·2-2' });
    expect(schedule['월']?.[1]).toBeNull();
    expect(schedule['화']?.[0]).toEqual({ subject: '수학', classroom: '2-1' });
    expect(schedule['수']?.[1]).toEqual({ subject: '과학1', classroom: '3-1' });
    expect(schedule['수']?.[0]).toBeNull();
    expect(schedule['목']?.[0]).toEqual({ subject: '과학1', classroom: '3-1' });
    // 수업 없는 요일도 같은 길이의 null 배열
    expect(schedule['금']).toHaveLength(2);
    expect(schedule['금']?.every((p) => p === null)).toBe(true);
    // 채워진 칸: 월1·화1·수2·목1 = 4 (합반은 한 칸)
    expect(matchedCount).toBe(4);
    expect(unmatched).toEqual([]);
  });

  it('나이스에 없는 과목은 unmatched 로 표면화한다', () => {
    const extra: TeacherClassMapping[] = [
      ...mappings,
      { classId: 'c4', subject: '체육', grade: 2, classNum: 1 }, // 2-1에 체육 row 없음
    ];
    const { unmatched } = reconstructTeacherSchedule(extra, rowsByClass);
    expect(unmatched).toEqual([{ grade: 2, classNum: 1, subject: '체육' }]);
  });

  it('학급 시간표를 못 받은(맵에 없는) 매핑도 unmatched 로 잡는다', () => {
    const only: TeacherClassMapping[] = [{ classId: 'c9', subject: '수학', grade: 5, classNum: 9 }];
    const { unmatched, matchedCount, maxPeriod } = reconstructTeacherSchedule(only, rowsByClass);
    expect(unmatched).toEqual([{ grade: 5, classNum: 9, subject: '수학' }]);
    expect(matchedCount).toBe(0);
    expect(maxPeriod).toBe(0);
  });

  it('빈 매핑은 빈 시간표(maxPeriod 0)를 반환한다', () => {
    const { schedule, maxPeriod, matchedCount } = reconstructTeacherSchedule([], rowsByClass);
    expect(maxPeriod).toBe(0);
    expect(matchedCount).toBe(0);
    expect(schedule['월']).toHaveLength(0);
  });

  it('주말 수업 요일을 주면 토/일 칸도 포함한다', () => {
    const satRows = new Map<string, readonly NeisTimetableRow[]>([
      [classKey(1, 1), [row(1, '수학', '20240106', 1, 1)]], // 20240106 = 토
    ]);
    const { schedule } = reconstructTeacherSchedule(
      [{ classId: 'x', subject: '수학', grade: 1, classNum: 1 }],
      satRows,
      ['토'],
    );
    expect(schedule['토']?.[0]).toEqual({ subject: '수학', classroom: '1-1' });
    // 주말 요일을 안 주면 토요일 수업은 버려진다
    const { schedule: noWeekend, maxPeriod } = reconstructTeacherSchedule(
      [{ classId: 'x', subject: '수학', grade: 1, classNum: 1 }],
      satRows,
    );
    expect(maxPeriod).toBe(0);
    expect(noWeekend['토']).toBeUndefined();
  });
});

/* ── deriveClassFromTeachingClass / 이동수업 판별 ── */

function student(number: number, extra: Partial<TeachingClassStudent> = {}): TeachingClassStudent {
  return { number, name: `학생${number}`, ...extra };
}

function makeClass(name: string, students: TeachingClassStudent[]): TeachingClass {
  return {
    id: `id-${name}`,
    name,
    subject: '수학',
    students,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

describe('deriveClassFromTeachingClass — (학년, 반) 도출', () => {
  it("name 파싱을 우선한다 ('2-3', '2학년 3반')", () => {
    expect(deriveClassFromTeachingClass(makeClass('2-3', []))).toEqual({ grade: 2, classNum: 3 });
    expect(deriveClassFromTeachingClass(makeClass('2학년 3반', []))).toEqual({
      grade: 2,
      classNum: 3,
    });
  });

  it('name 으로 못 뽑으면 students 의 최빈 (학년,반)을 쓴다', () => {
    const cls = makeClass('심화수학', [
      student(1, { grade: 3, classNum: 5 }),
      student(2, { grade: 3, classNum: 5 }),
      student(3, { grade: 3, classNum: 2 }),
    ]);
    expect(deriveClassFromTeachingClass(cls)).toEqual({ grade: 3, classNum: 5 });
  });

  it('name·students 둘 다 없으면 null (사용자 지정 필요)', () => {
    expect(deriveClassFromTeachingClass(makeClass('우리반', []))).toBeNull();
  });

  it('비현실적 학년/반(범위 밖)은 name 파싱에서 거른다', () => {
    // '2023 수학' 같은 연도 표기는 (grade 2023) 거부 후 students 폴백(없으면 null)
    expect(deriveClassFromTeachingClass(makeClass('2023 수학', []))).toBeNull();
  });
});

describe('isLikelyMovementClass — 선택과목 이동수업 의심', () => {
  it('학생 소속이 여러 (학년,반)이면 이동수업 의심', () => {
    const cls = makeClass('선택 물리', [
      student(1, { grade: 3, classNum: 1 }),
      student(2, { grade: 3, classNum: 2 }),
      student(3, { grade: 3, classNum: 3 }),
    ]);
    expect(isLikelyMovementClass(cls)).toBe(true);
    expect(distinctStudentClasses(cls)).toEqual([
      { grade: 3, classNum: 1 },
      { grade: 3, classNum: 2 },
      { grade: 3, classNum: 3 },
    ]);
  });

  it('한 반에서만 온 학생이면 이동수업 아님', () => {
    const cls = makeClass('2-1', [
      student(1, { grade: 2, classNum: 1 }),
      student(2, { grade: 2, classNum: 1 }),
    ]);
    expect(isLikelyMovementClass(cls)).toBe(false);
  });

  it('grade/classNum 이 비어 있는 학생은 세지 않는다(담임·단일 홈룸 수업반)', () => {
    const cls = makeClass('우리반', [student(1), student(2)]);
    expect(distinctStudentClasses(cls)).toEqual([]);
    expect(isLikelyMovementClass(cls)).toBe(false);
  });
});
