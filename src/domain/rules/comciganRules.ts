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
import type {
  ClassPeriod,
  ClassScheduleData,
  TeacherPeriod,
  TeacherScheduleData,
} from '../entities/Timetable';
import type { SchoolLevel } from '../entities/Settings';
import type { PeriodTime } from '../valueObjects/PeriodTime';
import { DAYS_OF_WEEK } from '../valueObjects/DayOfWeek';
import {
  PERIOD_DURATION,
  formatTime,
  inferLunchAfterPeriod,
  validatePeriodTimes,
} from './periodRules';

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

  const base = [...byTeacher.entries()].map(([index, { name, hours, subjects }]) => ({
    index,
    name,
    weeklyHours: hours,
    subjects: [...subjects],
    isDummy: [...subjects].every((s) => COMCIGAN_DUMMY_SUBJECTS.includes(s)),
  }));

  // 마스킹 동명이인: 선택 가능한(더미 아님) 교사 중 같은 이름이 2명 이상이면 충돌 표시.
  // (컴시간이 이름 끝 글자를 '*'로 가려 서로 다른 교사가 목록에 같게 보인다 — 병합 아님)
  const realNameCounts = new Map<string, number>();
  for (const t of base) {
    if (!t.isDummy) realNameCounts.set(t.name, (realNameCounts.get(t.name) ?? 0) + 1);
  }

  return base
    .map((t) => ({
      ...t,
      maskedNameCollision: !t.isDummy && (realNameCounts.get(t.name) ?? 0) > 1,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

/** detectDecodeAnomaly 결과 — 해석 신뢰도 경고 */
export interface DecodeAnomalyReport {
  /** 하나라도 이상 신호가 잡히면 true (비차단 경고용) */
  readonly suspicious: boolean;
  /** 사용자에게 보여줄 이상 사유(사람 언어). suspicious=false면 빈 배열 */
  readonly reasons: readonly string[];
}

/** 실제 교사 1명의 주간 수업 시수 상한(초과 시 인덱스 병합 의심) */
const MAX_REASONABLE_WEEKLY_HOURS = 30;
/** 실제 교사 1명이 담당하는 과목 종류 상한(초과 시 인덱스 병합 의심) */
const MAX_REASONABLE_SUBJECTS = 8;
/** 격자 셀 중 교사·과목 목록 범위를 벗어난 비율 상한(초과 시 구조 변경 의심) */
const MAX_OUT_OF_RANGE_RATIO = 0.15;
/** 등장 교사 인덱스 종류 수 / 등록 교사 수 하한(미만이면 대량 병합 의심) — 소규모 학교 오탐 방지용 최소 등록 교사 수 */
const MIN_TEACHERS_FOR_COVERAGE_CHECK = 12;

/**
 * 컴시간 수업 코드 해석이 이 학교에서 어긋났을 가능성을 보수적으로 진단한다(순수).
 *
 * `decodeLessonCode`의 `teacherIndex = n % 1000` 가정은 대부분의 학교에서 맞지만,
 * 편성 방식이 다른 일부 학교에서 깨지면 서로 다른 교사가 한 인덱스로 병합돼
 * 과목·시수가 뭉쳐 보인다. 여기서는 **공식을 바꾸지 않고** 결과의 이상 징후만 잡아
 * 모달이 비차단 경고를 띄우도록 신호를 준다(오탐 최소가 목표 — 정상 학교는 통과).
 */
export function detectDecodeAnomaly(
  data: ComciganRawSchoolData,
  lessons: readonly ComciganLesson[],
): DecodeAnomalyReport {
  const reasons: string[] = [];
  const { baseGrid, teachers, subjects, separator } = data;

  // (iii) 범위초과 셀 비율 — decode는 되지만 teachers/subjects 목록 밖을 가리키는 셀
  //       (decodeTimetable이 조용히 버리는 셀을 여기서 세어 구조 변경을 표면화)
  let decodable = 0;
  let outOfRange = 0;
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
          decodable++;
          if (!teachers[decoded.teacherIndex] || !subjects[decoded.subjectIndex]) outOfRange++;
        }
      }
    }
  }
  if (decodable > 0 && outOfRange / decodable > MAX_OUT_OF_RANGE_RATIO) {
    reasons.push(
      `시간표 칸의 약 ${Math.round((outOfRange / decodable) * 100)}%가 교사·과목 목록 범위를 벗어났어요`,
    );
  }

  // (ii) 비정상 주시수 / 과목 과다 — 실제 교사(더미 제외) 기준
  const realTeachers = summarizeTeachers(lessons).filter((t) => !t.isDummy);
  const overloaded = realTeachers.find((t) => t.weeklyHours > MAX_REASONABLE_WEEKLY_HOURS);
  if (overloaded) {
    reasons.push(
      `한 선생님에게 수업이 비정상적으로 몰려 있어요 (예: ${overloaded.name} 주 ${overloaded.weeklyHours}시간)`,
    );
  }
  const tooManySubjects = realTeachers.find((t) => t.subjects.length > MAX_REASONABLE_SUBJECTS);
  if (tooManySubjects) {
    reasons.push(
      `한 선생님이 맡은 과목 수가 비정상적으로 많아요 (예: ${tooManySubjects.name} ${tooManySubjects.subjects.length}과목)`,
    );
  }

  // (i) 등장 교사 인덱스 종류 수 vs 등록 교사 수의 큰 괴리 (대량 병합 의심)
  //     — 소규모 학교 오탐을 막으려 등록 교사가 충분히 많을 때만 검사
  const nonEmptyTeachers = teachers.filter((t) => t.trim() !== '').length;
  const distinctIndices = new Set(lessons.map((l) => l.teacherIndex)).size;
  if (
    nonEmptyTeachers >= MIN_TEACHERS_FOR_COVERAGE_CHECK &&
    distinctIndices > 0 &&
    distinctIndices < nonEmptyTeachers / 3
  ) {
    reasons.push('시간표에 등장하는 선생님 수가 등록된 교사 수보다 지나치게 적어요');
  }

  return { suspicious: reasons.length > 0, reasons };
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

/** 학급 참조 (교사 시간표와 달리 특정 학년-반 하나를 가리킴) */
export interface ComciganClassRef {
  readonly grade: number;
  readonly classNum: number;
}

/**
 * 수업 목록에 실제로 등장하는 학년-반 목록을 학년·반 오름차순으로 반환한다.
 * (선택 UI가 존재하지 않는 반을 고르지 못하도록 격자에서 직접 파생 — 추정 없음)
 */
export function listComciganClasses(
  lessons: readonly ComciganLesson[],
): readonly ComciganClassRef[] {
  const seen = new Set<string>();
  const result: ComciganClassRef[] = [];
  for (const l of lessons) {
    const key = `${l.grade}-${l.classNum}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ grade: l.grade, classNum: l.classNum });
  }
  return result.sort((a, b) => a.grade - b.grade || a.classNum - b.classNum);
}

/** buildClassSchedule 결과 */
export interface BuiltClassSchedule {
  readonly schedule: ClassScheduleData;
  readonly maxPeriod: number;
}

/**
 * 특정 학년-반의 수업만 추려 쌤핀 학급 시간표(ClassScheduleData)로 변환한다.
 * - 나이스 변환(transformToClassSchedule)과 동일 규약: 모든 칸을 `{subject:'', teacher:''}`로
 *   초기화하고 수업이 있는 칸만 채운다. 요일 키는 '월'~'금'(컴시간 격자는 월~금만 제공).
 * - 나이스 학급 시간표엔 없는 담당 교사명(마스킹된 컴시간 이름)을 함께 채운다.
 */
export function buildClassSchedule(
  lessons: readonly ComciganLesson[],
  grade: number,
  classNum: number,
): BuiltClassSchedule {
  const mine = lessons.filter((l) => l.grade === grade && l.classNum === classNum);
  const maxPeriod = mine.reduce((max, l) => Math.max(max, l.period), 0);

  const grid: ClassPeriod[][] = DAYS_OF_WEEK.map(() =>
    Array.from({ length: maxPeriod }, () => ({ subject: '', teacher: '' })),
  );

  for (const lesson of mine) {
    const dayIdx = lesson.day - 1;
    const periodIdx = lesson.period - 1;
    const row = grid[dayIdx];
    if (!row || periodIdx < 0 || periodIdx >= row.length) continue;
    row[periodIdx] = { subject: lesson.subject, teacher: lesson.teacherName };
  }

  const schedule: Record<string, readonly ClassPeriod[]> = {};
  DAYS_OF_WEEK.forEach((day, i) => {
    schedule[day] = grid[i] ?? [];
  });

  return { schedule: schedule as ClassScheduleData, maxPeriod };
}

/** parseComciganPeriodTimes 결과 */
export interface ParsedComciganPeriodTimes {
  readonly periodTimes: readonly PeriodTime[];
  /** 점심 직전 교시(1-베이스). 추정 불가 시 null. */
  readonly lunchAfterPeriod: number | null;
}

/** '5(13:40)' → { period:5, hh:13, mm:40 } 매칭 (앞 숫자 = 교시 번호) */
const DAY_TIME_RE = /^(\d+)\s*\(\s*(\d{1,2}):(\d{2})\s*\)/;

/** 한국 학교 표준 쉬는 시간(분) — 교시 시작 간격에서 수업 길이를 역산할 때 사용 */
const STANDARD_BREAK_MIN = 10;

/**
 * 연속 교시(번호 차이 1)의 시작 간격에서 실제 수업 길이(분)를 역산한다.
 * 연속 간격의 최솟값 = 수업 + 쉬는시간(점심 갭은 항상 더 커서 자연히 제외)이므로
 * 표준 쉬는시간을 빼면 수업 길이가 나온다. 학교급 설정이 실제와 달라도 자동 교정된다.
 * 데이터가 부족하거나(연속 교시 없음) 결과가 비정상(30~60분 밖)이면 fallback을 쓴다.
 */
function deriveClassDuration(sorted: readonly [number, number][], fallback: number): number {
  let normalGap = Infinity;
  for (let i = 1; i < sorted.length; i++) {
    const [prevPeriod, prevStart] = sorted[i - 1]!;
    const [currPeriod, currStart] = sorted[i]!;
    if (currPeriod !== prevPeriod + 1) continue;
    const gap = currStart - prevStart;
    if (gap > 0 && gap < normalGap) normalGap = gap;
  }
  if (!Number.isFinite(normalGap)) return fallback;
  const derived = normalGap - STANDARD_BREAK_MIN;
  return derived >= 30 && derived <= 60 ? derived : fallback;
}

/**
 * 컴시간 '일과시간' 문자열 배열을 쌤핀 교시 시각(PeriodTime[])으로 변환한다.
 * - 컴시간은 교시별 '시작 시각'만 제공 → 끝 시각은 데이터에서 역산한 수업 길이로 채운다
 *   (연속 교시 시작 간격 − 표준 쉬는시간; 실패 시 학교급 기본값). 점심 종료(오후 첫
 *   교시 시작)는 컴시간 값이라 정확하고, 점심 길이는 학교마다 다른 실제 갭 그대로 반영된다.
 * - 점심 위치는 시각 간 갭(≥30분)에서 추정(inferLunchAfterPeriod).
 * - 배열 위치가 아니라 문자열 앞 숫자를 교시 번호로 사용한다.
 * - 미제공·불량 입력은 null 을 반환한다(호출부가 조용히 폴백).
 */
export function parseComciganPeriodTimes(
  dayTimes: readonly string[] | undefined | null,
  schoolLevel: SchoolLevel,
): ParsedComciganPeriodTimes | null {
  if (!Array.isArray(dayTimes) || dayTimes.length === 0) return null;

  const byPeriod = new Map<number, number>();
  for (const entry of dayTimes) {
    const m = DAY_TIME_RE.exec(String(entry).trim());
    if (!m) continue;
    const period = Number(m[1]);
    const hh = Number(m[2]);
    const mm = Number(m[3]);
    if (!Number.isInteger(period) || period <= 0 || hh > 23 || mm > 59) continue;
    if (!byPeriod.has(period)) byPeriod.set(period, hh * 60 + mm);
  }
  if (byPeriod.size === 0) return null;

  const sorted = [...byPeriod.entries()].sort((a, b) => a[0] - b[0]);
  const duration = deriveClassDuration(sorted, PERIOD_DURATION[schoolLevel]);

  const periodTimes: PeriodTime[] = sorted.map(([period, startMin]) => ({
    period,
    start: formatTime(startMin),
    end: formatTime(startMin + duration),
  }));

  if (!validatePeriodTimes(periodTimes)) return null;

  return { periodTimes, lunchAfterPeriod: inferLunchAfterPeriod(periodTimes) };
}

/** parseComciganPeriodTimes 결과 → 설정(Settings) 부분 갱신 payload */
export interface ComciganPeriodTimesPatch {
  readonly periodTimes: readonly PeriodTime[];
  readonly lunchAfterPeriod?: number;
  readonly lunchStart?: string;
  readonly lunchEnd?: string;
}

/**
 * 파싱된 교시 시각을 설정 갱신 payload로 변환한다.
 * 점심 위치를 알면 점심 시작(직전 교시 끝)·끝(다음 교시 시작)까지 함께 채운다.
 * (학급·교사 컴시간 불러오기 양쪽이 동일 규칙을 쓰도록 공용화)
 */
export function periodTimesToSettingsPatch(
  parsed: ParsedComciganPeriodTimes,
): ComciganPeriodTimesPatch {
  const { periodTimes, lunchAfterPeriod } = parsed;
  if (lunchAfterPeriod == null) return { periodTimes };
  const idx = periodTimes.findIndex((p) => p.period === lunchAfterPeriod);
  if (idx < 0 || idx + 1 >= periodTimes.length) return { periodTimes };
  return {
    periodTimes,
    lunchAfterPeriod,
    lunchStart: periodTimes[idx]!.end,
    lunchEnd: periodTimes[idx + 1]!.start,
  };
}
