/**
 * 교과 수업반 출결을 날짜별로 집계한다(순수 함수).
 *
 * ★담임 출결과 **저장 구조가 다르다.** 담임은 "이상이 있는 학생만 기록"이지만, 수업반은
 * (수업반 · 날짜 · 교시)마다 학생 전원의 상태가 든 명부 한 장이 통째로 저장된다. 그래서
 * 여기서는 출석 인원도 셀 수 있다 — 어림짐작이 아니라 명부에 적힌 사실이기 때문이다.
 *
 * ★명부 안에는 학생 번호·학년·반이 들어 있다(`StudentAttendance.number` 등). 이 함수는
 * **상태만 세고 그 필드들은 손도 대지 않는다** — 인자 타입에서 아예 받지 않는다.
 */
import type { AttendanceStatus } from '@domain/entities/Attendance';

/** summarizeClassAttendance 가 필요로 하는 최소 필드 (AttendanceRecord 와 호환) */
export interface ClassAttendanceRecordLike {
  readonly classId: string;
  /** YYYY-MM-DD */
  readonly date: string;
  readonly period: number;
  /** ★상태 말고는 받지 않는다. 번호·학년·반은 인자 타입에 존재하지 않는다 */
  readonly students: readonly { readonly status: AttendanceStatus }[];
}

export interface SummarizeClassAttendanceOptions {
  /** YYYY-MM-DD (포함) */
  readonly from: string;
  /** YYYY-MM-DD (포함) */
  readonly to: string;
  /** classId → 수업반 이름 */
  readonly classNames: Readonly<Record<string, string>>;
  /** 특정 수업반만 볼 때의 이름. 생략하면 전부 */
  readonly className?: string;
  /** 담을 줄 수 상한. 기본 60줄 */
  readonly maxRows?: number;
}

interface DayRow {
  readonly date: string;
  readonly className: string;
  /** 그날 그 반에서 출결을 적은 교시 수 */
  readonly lessons: number;
  readonly present: number;
  readonly absent: number;
  readonly late: number;
  readonly early: number;
  readonly classAbsence: number;
}

export interface ClassAttendanceSummary {
  readonly period: string;
  /** 어떤 반을 봤는가. 좁히지 않았으면 '전체 수업반' */
  readonly className: string;
  /** 기간 안 **연인원** 합계 */
  readonly present: number;
  readonly absent: number;
  readonly late: number;
  readonly early: number;
  readonly classAbsence: number;
  /** 출결을 적은 (날짜 × 교시) 수 */
  readonly lessons: number;
  readonly truncated: boolean;
  /** 날짜 × 반 한 줄씩. 반을 좁히지 않으면 줄마다 반 이름이 붙는다 */
  readonly days: readonly DayRow[];
}

/** 세는 칸 이름만. `date`·`className` 까지 포함하면 숫자를 글자 칸에 더하려 든다. */
type CountField = 'present' | 'absent' | 'late' | 'early' | 'classAbsence';

const FIELD_OF: Readonly<Record<AttendanceStatus, CountField>> = {
  present: 'present',
  absent: 'absent',
  late: 'late',
  earlyLeave: 'early',
  classAbsence: 'classAbsence',
};

export function summarizeClassAttendance(
  records: readonly ClassAttendanceRecordLike[],
  opts: SummarizeClassAttendanceOptions,
): ClassAttendanceSummary {
  const maxRows = opts.maxRows ?? 60;

  const rows = new Map<
    string,
    { date: string; className: string; lessons: number } & Record<CountField, number>
  >();

  for (const record of records) {
    if (record.date < opts.from || record.date > opts.to) continue;
    const className = opts.classNames[record.classId] ?? '(삭제된 수업반)';
    if (opts.className !== undefined && className !== opts.className) continue;

    const key = `${record.date}|${className}`;
    const row = rows.get(key) ?? {
      date: record.date,
      className,
      lessons: 0,
      present: 0,
      absent: 0,
      late: 0,
      early: 0,
      classAbsence: 0,
    };
    row.lessons += 1;
    for (const student of record.students) row[FIELD_OF[student.status]] += 1;
    rows.set(key, row);
  }

  const sorted = [...rows.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.className.localeCompare(b.className),
  );
  const sum = (pick: (row: DayRow) => number): number => sorted.reduce((n, r) => n + pick(r), 0);

  return {
    period: `${opts.from} ~ ${opts.to}`,
    className: opts.className ?? '전체 수업반',
    present: sum((r) => r.present),
    absent: sum((r) => r.absent),
    late: sum((r) => r.late),
    early: sum((r) => r.early),
    classAbsence: sum((r) => r.classAbsence),
    lessons: sum((r) => r.lessons),
    truncated: sorted.length > maxRows,
    days: sorted.slice(0, maxRows),
  };
}
