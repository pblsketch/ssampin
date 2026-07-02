/**
 * 컴시간알리미 수업 코드 해석 규칙 (순수 함수).
 *
 * 컴시간 페이지의 splitData/baSplit 공식(2026-07-02 실측)을 그대로 구현한다:
 *   - 수업 코드를 오른쪽부터 3자리 그룹으로 분해
 *   - 마지막 3자리 = 교사 인덱스, 그 앞 3자리 % 분리(separator) = 과목 인덱스
 *   - '>' 접두 문자열 코드는 당일 변경 표시 (숫자 부분은 동일 규칙)
 * 컴시간이 공식을 바꾸면 이 파일만 고치면 된다.
 */
import type {
  ComciganLesson,
  ComciganRawSchoolData,
  ComciganTeacherSummary,
} from '../entities/ComciganTimetable';
import type { TeacherPeriod, TeacherScheduleData } from '../entities/Timetable';
import { DAYS_OF_WEEK } from '../valueObjects/DayOfWeek';

/** 편성용 더미 "교사"가 갖는 과목들 — 전 수업이 이 목록에만 속하면 실제 교사가 아니다 */
export const COMCIGAN_DUMMY_SUBJECTS: readonly string[] = [
  '자율',
  '창체',
  '공강',
  '자습',
  '동아리',
  '방과후',
];

/** 수업 코드 분해 결과 */
export interface DecodedLessonCode {
  readonly teacherIndex: number;
  readonly subjectIndex: number;
  readonly changed: boolean;
}

/**
 * 수업 코드 → 교사/과목 인덱스.
 * 0, 빈 값, 숫자가 아닌 값은 공강으로 보고 null을 반환한다.
 */
export function decodeLessonCode(
  code: number | string | undefined | null,
  separator: number,
): DecodedLessonCode | null {
  if (code === undefined || code === null) return null;
  const raw = String(code);
  const changed = raw.startsWith('>');
  const n = Number(changed ? raw.slice(1) : raw);
  if (!Number.isFinite(n) || n <= 0) return null;

  const div = separator > 0 ? separator : 100;
  // 교사 축은 separator와 무관하게 아래 3자리로 고정 — 2026-07-02 실측(분리=1000·100 모두).
  // 특정 학교에서 교사명이 어긋나게 보이면 이 가정부터 재검증할 것.
  const teacherIndex = n % 1000;
  const subjectIndex = (Math.floor(n / 1000) % 1000) % div;
  return { teacherIndex, subjectIndex, changed };
}

/**
 * 기본 편성표 격자 전체를 수업 목록으로 해석한다.
 * 격자는 [학년][반][요일][교시] 1-베이스이며 각 요일 배열의 [0]은 교시 수 메타값.
 * 인덱스가 목록 범위를 벗어난 셀(구조 변경 신호)은 건너뛴다.
 */
export function decodeTimetable(data: ComciganRawSchoolData): readonly ComciganLesson[] {
  const { baseGrid, teachers, subjects, separator } = data;
  const lessons: ComciganLesson[] = [];

  for (let grade = 1; grade < baseGrid.length; grade++) {
    const gradeArr = baseGrid[grade];
    if (!Array.isArray(gradeArr)) continue;
    for (let classNum = 1; classNum < gradeArr.length; classNum++) {
      const classArr = gradeArr[classNum];
      if (!Array.isArray(classArr)) continue;
      for (let day = 1; day <= 5 && day < classArr.length; day++) {
        const dayArr = classArr[day];
        if (!Array.isArray(dayArr)) continue;
        for (let period = 1; period < dayArr.length; period++) {
          const decoded = decodeLessonCode(dayArr[period], separator);
          if (!decoded) continue;
          const teacherName = teachers[decoded.teacherIndex];
          const subject = subjects[decoded.subjectIndex];
          if (!teacherName || !subject) continue;
          lessons.push({
            grade,
            classNum,
            day,
            period,
            subject,
            teacherIndex: decoded.teacherIndex,
            teacherName,
          });
        }
      }
    }
  }
  return lessons;
}

/**
 * 교사별 주간 수업 요약. 수업이 1개 이상인 교사만 포함하며,
 * 모든 수업이 더미 과목(자율/창체 등)뿐인 항목은 isDummy로 표시한다.
 */
export function summarizeTeachers(
  lessons: readonly ComciganLesson[],
): readonly ComciganTeacherSummary[] {
  const byTeacher = new Map<number, { name: string; hours: number; subjects: Set<string> }>();
  for (const lesson of lessons) {
    let entry = byTeacher.get(lesson.teacherIndex);
    if (!entry) {
      entry = { name: lesson.teacherName, hours: 0, subjects: new Set() };
      byTeacher.set(lesson.teacherIndex, entry);
    }
    entry.hours += 1;
    entry.subjects.add(lesson.subject);
  }

  return [...byTeacher.entries()]
    .map(([index, { name, hours, subjects }]) => ({
      index,
      name,
      weeklyHours: hours,
      subjects: [...subjects],
      isDummy: [...subjects].every((s) => COMCIGAN_DUMMY_SUBJECTS.includes(s)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

/** buildTeacherSchedule 결과 */
export interface BuiltTeacherSchedule {
  readonly schedule: TeacherScheduleData;
  readonly maxPeriod: number;
  readonly totalHours: number;
}

/**
 * 특정 교사의 수업만 추려 쌤핀 교사 시간표(TeacherScheduleData)로 변환한다.
 * - 요일 키: '월'~'금', 교시는 0-베이스 배열(1교시 = index 0), 공강은 null
 * - classroom에는 '학년-반' 표기를 넣는다 (예: '3-1')
 * - 같은 칸에 같은 과목 수업이 여러 반이면 반 표기를 '·'로 합친다 (분반 합반)
 */
export function buildTeacherSchedule(
  lessons: readonly ComciganLesson[],
  teacherIndex: number,
): BuiltTeacherSchedule {
  const mine = lessons.filter((l) => l.teacherIndex === teacherIndex);
  const maxPeriod = mine.reduce((max, l) => Math.max(max, l.period), 0);

  const grid: (TeacherPeriod | null)[][] = DAYS_OF_WEEK.map(() =>
    Array.from({ length: maxPeriod }, () => null),
  );

  for (const lesson of mine) {
    const dayIdx = lesson.day - 1;
    const periodIdx = lesson.period - 1;
    const row = grid[dayIdx];
    if (!row || periodIdx < 0 || periodIdx >= row.length) continue;
    const classroom = `${lesson.grade}-${lesson.classNum}`;
    const existing = row[periodIdx];
    if (existing && existing.subject === lesson.subject) {
      row[periodIdx] = { ...existing, classroom: `${existing.classroom}·${classroom}` };
    } else if (!existing) {
      row[periodIdx] = { subject: lesson.subject, classroom };
    }
    // 같은 칸에 다른 과목이 이미 있으면 먼저 온 수업을 유지 (데이터 이상 방어)
  }

  const schedule: Record<string, readonly (TeacherPeriod | null)[]> = {};
  DAYS_OF_WEEK.forEach((day, i) => {
    schedule[day] = grid[i] ?? [];
  });

  return { schedule: schedule as TeacherScheduleData, maxPeriod, totalHours: mine.length };
}
