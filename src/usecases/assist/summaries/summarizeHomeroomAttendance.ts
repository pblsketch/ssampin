/**
 * 담임 학급 출결을 **기간**으로 집계한다(순수 함수).
 *
 * 하루짜리 `summarizeAttendance` 의 기간판이다(계획서 §2 B그룹 "기존 출결 요약 기간 확장").
 * 판정은 `attendanceStatusOf` 하나만 쓴다 — 복사해 두면 "오늘 출결"과 "이번 달 출결"의
 * 숫자가 갈린다.
 *
 * ★**출석 인원을 세지 않는다.** 하루짜리는 "정원 − 이상 인원"으로 셀 수 있지만, 기간에서는
 * 그 셈이 성립하지 않는다 — 수업일이 며칠인지 앱이 모르기 때문이다(주말·공휴일·재량휴업).
 * 세지 못하는 것을 0 이나 어림수로 내보내면 모델이 **사실이 아닌 출석률**을 지어낸다.
 * 질병 결석을 뺐던 것과 같은 판단이다.
 */
import type { AttendanceStatus } from '@domain/entities/Attendance';

import { attendanceStatusOf, type AttendanceRecordSource } from './toAttendanceRoll';

export interface SummarizeHomeroomAttendanceOptions {
  /** 결과에 표시할 학급명 */
  readonly className: string;
  /** YYYY-MM-DD (포함) */
  readonly from: string;
  /** YYYY-MM-DD (포함) */
  readonly to: string;
  /** 학급 인원. 모델이 "30명 중 2명"처럼 말할 수 있게 함께 보낸다 */
  readonly rosterSize: number;
  /** 담을 날 수 상한. 기본 60일 — 기간 자체는 무상한(오너 결정 ④)이라 잘리면 표시한다 */
  readonly maxDays?: number;
}

interface DayRow {
  readonly date: string;
  readonly absent: number;
  readonly late: number;
  readonly early: number;
  readonly classAbsence: number;
}

export interface HomeroomAttendanceSummary {
  readonly className: string;
  readonly period: string;
  readonly rosterSize: number;
  /** 기간 안 **연인원** 합계 — "며칠에 걸쳐 몇 명"이 아니라 "총 몇 건" */
  readonly absent: number;
  readonly late: number;
  readonly early: number;
  readonly classAbsence: number;
  /** 이상이 하나라도 있었던 날 수 */
  readonly daysWithIssue: number;
  readonly truncated: boolean;
  /** 이상이 있었던 날만. 전원 출석한 날은 담지 않는다 — 보내 봐야 토큰만 쓴다 */
  readonly days: readonly DayRow[];
}

/** 세는 칸 이름만. `date` 까지 포함하면 숫자를 날짜 칸에 더하려 든다(타입이 잡아 준다). */
type CountField = 'absent' | 'late' | 'early' | 'classAbsence';

/** 출석은 세지 않는다(null) — 위 주석 참조. */
const FIELD_OF: Readonly<Record<AttendanceStatus, CountField | null>> = {
  present: null,
  absent: 'absent',
  late: 'late',
  earlyLeave: 'early',
  classAbsence: 'classAbsence',
};

export function summarizeHomeroomAttendance(
  records: readonly AttendanceRecordSource[],
  opts: SummarizeHomeroomAttendanceOptions,
): HomeroomAttendanceSummary {
  const maxDays = opts.maxDays ?? 60;

  const byDate = new Map<string, Record<CountField, number>>();
  // 한 학생이 같은 날 여러 건이면 첫 건만 센다 — 하루짜리 집계와 같은 규칙이다.
  const seen = new Set<string>();

  for (const record of records) {
    if (record.date < opts.from || record.date > opts.to) continue;
    const key = `${record.date}|${record.studentId}`;
    if (seen.has(key)) continue;

    const status = attendanceStatusOf(record);
    if (!status) continue;
    const field = FIELD_OF[status];
    if (!field) continue;

    seen.add(key);
    const row = byDate.get(record.date) ?? { absent: 0, late: 0, early: 0, classAbsence: 0 };
    row[field] += 1;
    byDate.set(record.date, row);
  }

  const sorted = [...byDate.entries()]
    .map(([date, counts]) => ({ date, ...counts }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    className: opts.className,
    period: `${opts.from} ~ ${opts.to}`,
    rosterSize: opts.rosterSize,
    // 합계는 **잘리기 전 전체**로 낸다. 잘린 날을 빼고 더하면 사실과 달라진다.
    absent: sorted.reduce((n, d) => n + d.absent, 0),
    late: sorted.reduce((n, d) => n + d.late, 0),
    early: sorted.reduce((n, d) => n + d.early, 0),
    classAbsence: sorted.reduce((n, d) => n + d.classAbsence, 0),
    daysWithIssue: sorted.length,
    truncated: sorted.length > maxDays,
    days: sorted.slice(0, maxDays),
  };
}
