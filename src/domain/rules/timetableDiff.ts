/**
 * 시간표 변경 감지 (순수 함수).
 *
 * 컴시간/나이스에서 다시 받아온 시간표가 현재 저장본과 "의미 있게" 달라졌는지 판정한다.
 * 표기 차이(교실 병합 순서, 끝쪽 공강 패딩 길이)는 변경으로 보지 않도록 정규화한 뒤 비교한다.
 * 이 파일은 domain 순수 규칙이므로 react/zustand/adapters/usecases/infra 를 import 하지 않는다.
 */
import type {
  ClassPeriod,
  ClassScheduleData,
  TeacherPeriod,
  TeacherScheduleData,
} from '../entities/Timetable';

/** 변경된 한 칸 (요일·교시와 이전/이후 표기) */
export interface TimetableChange {
  readonly day: string;
  /** 1-베이스 교시 */
  readonly period: number;
  /** 이전 칸 정규화 표기 (공강은 빈 문자열) */
  readonly before: string;
  /** 이후 칸 정규화 표기 (공강은 빈 문자열) */
  readonly after: string;
}

/** diff 결과 */
export interface TimetableDiffResult {
  readonly changed: boolean;
  readonly changes: readonly TimetableChange[];
}

/**
 * 교실 토큰 정규화 — '1-2·1-1'(합반 병합)과 '1-1·1-2'를 같게 본다.
 * '·'로 나눠 공백/빈 토큰을 버리고 한국어 정렬 후 다시 합친다.
 */
function normalizeClassroom(classroom: string): string {
  return classroom
    .split('·')
    .map((t) => t.trim())
    .filter((t) => t !== '')
    .sort((a, b) => a.localeCompare(b, 'ko'))
    .join('·');
}

/** 교사 시간표 한 칸 → 비교 키. 공강(null/빈 과목)은 빈 문자열. */
function teacherCellKey(cell: TeacherPeriod | null | undefined): string {
  if (!cell || cell.subject.trim() === '') return '';
  const room = normalizeClassroom(cell.classroom ?? '');
  const subject = cell.subject.trim();
  return room ? `${subject}@${room}` : subject;
}

/** 학급 시간표 한 칸 → 비교 키. 빈 칸({subject:'',teacher:''})은 빈 문자열. */
function classCellKey(cell: ClassPeriod | null | undefined): string {
  if (!cell || cell.subject.trim() === '') return '';
  const subject = cell.subject.trim();
  const teacher = cell.teacher?.trim() ?? '';
  return teacher ? `${subject}/${teacher}` : subject;
}

/**
 * 두 시간표를 칸 단위로 비교한다. 각 요일에서 더 긴 쪽 길이만큼 순회하되
 * 없는 칸/공강은 모두 빈 문자열로 정규화되므로 끝쪽 패딩 길이차는 변경으로 잡히지 않는다.
 */
function diffSchedules<T>(
  a: { readonly [day: string]: readonly T[] },
  b: { readonly [day: string]: readonly T[] },
  cellKey: (cell: T | undefined) => string,
): TimetableDiffResult {
  const days = new Set<string>([...Object.keys(a), ...Object.keys(b)]);
  const changes: TimetableChange[] = [];
  for (const day of days) {
    const rowA = a[day] ?? [];
    const rowB = b[day] ?? [];
    const len = Math.max(rowA.length, rowB.length);
    for (let i = 0; i < len; i++) {
      const before = cellKey(rowA[i]);
      const after = cellKey(rowB[i]);
      if (before !== after) changes.push({ day, period: i + 1, before, after });
    }
  }
  // 결정적 출력(요일·교시 순)
  changes.sort((x, y) => x.day.localeCompare(y.day, 'ko') || x.period - y.period);
  return { changed: changes.length > 0, changes };
}

/** 교사 시간표 변경 감지 */
export function diffTeacherSchedule(
  a: TeacherScheduleData,
  b: TeacherScheduleData,
): TimetableDiffResult {
  return diffSchedules<TeacherPeriod | null>(a, b, teacherCellKey);
}

/** 학급 시간표 변경 감지 */
export function diffClassSchedule(a: ClassScheduleData, b: ClassScheduleData): TimetableDiffResult {
  return diffSchedules<ClassPeriod>(a, b, classCellKey);
}
