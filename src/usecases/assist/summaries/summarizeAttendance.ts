import type { AttendanceStatus } from '@domain/entities/Attendance';

/**
 * summarizeAttendance가 필요로 하는 최소 필드만 갖는 로컬 입력 타입.
 * (adapters 레이어의 AttendanceRecord 전체를 import하지 않고 구조적 타이핑으로 받는다.)
 */
export interface AttendanceRecordLike {
  readonly classId: string;
  readonly date: string;
  readonly students: readonly { readonly status: AttendanceStatus }[];
}

export interface SummarizeAttendanceOptions {
  /** 집계 대상 학급 id (AttendanceRecordLike.classId와 매칭) */
  readonly classId: string;
  /** 결과에 표시할 학급명 (조회는 호출자 책임 — 이 함수는 매칭 키와 표시명을 분리해서 받는다) */
  readonly className: string;
  readonly date: string;
}

export interface AttendanceSummary {
  readonly date: string;
  readonly className: string;
  readonly present: number;
  readonly absent: number;
  readonly late: number;
  readonly early: number;
  /** 결과(수업에 안 들어온 것). 원래 스키마의 sick 자리를 대체한다. */
  readonly classAbsence: number;
}

/**
 * 특정 학급·날짜의 출결 레코드를 상태별 인원수로 집계한다(순수 함수).
 *
 * - 같은 (classId, date)의 여러 교시 레코드를 모두 합산한다(학생 실명·번호는 결과에 담지 않는다).
 * - 계획서 §4.2 원안의 `sick`(질병)은 뺐다. 이 앱에서 질병은 status 가 아니라 reason 이라
 *   집계할 수 없는데, 0 을 고정으로 내보내면 모델이 "질병 결석 0명"이라고 **사실과 다르게**
 *   답하고 인원 합도 학급 인원과 안 맞는다. 대신 실제로 세고 있던 `classAbsence`(결과)를 낸다.
 */
export function summarizeAttendance(
  records: readonly AttendanceRecordLike[],
  opts: SummarizeAttendanceOptions,
): AttendanceSummary {
  const counts: Record<AttendanceStatus, number> = {
    present: 0,
    absent: 0,
    late: 0,
    earlyLeave: 0,
    classAbsence: 0,
  };

  for (const record of records) {
    if (record.classId !== opts.classId || record.date !== opts.date) continue;
    for (const student of record.students) {
      counts[student.status] += 1;
    }
  }

  return {
    date: opts.date,
    className: opts.className,
    present: counts.present,
    absent: counts.absent,
    late: counts.late,
    early: counts.earlyLeave,
    classAbsence: counts.classAbsence,
  };
}
