/**
 * 학생 기록 → 하루치 학급 출결 명부(`AttendanceRecordLike`)로 바꾼다.
 *
 * ★왜 필요했나 (UltraQA Cycle 2 에서 드러남)
 * `summarizeAttendance` 는 "하루 · 한 학급 · 학생별 상태" 모양을 받게 설계됐는데,
 * 이 앱은 출결을 그렇게 저장하지 않는다. **결석·지각한 학생만** 기록으로 남고,
 * 나머지는 아무 기록이 없다(= 출석). 그래서 집계 함수가 만들어져 있는데도
 * **부를 방법이 없어 도구가 통째로 놀고 있었다.**
 *
 * 여기서 그 간극을 메운다 — 기록이 있는 학생은 그 상태로, 없는 학생은 출석으로 채운다.
 *
 * ★판정은 `extractAttendanceType` 하나만 쓴다.
 * 같은 파싱을 복사해 두면 소분류 형식이 바뀔 때 한쪽만 고쳐져 화면 숫자와 AI 숫자가 갈린다.
 */
import type { AttendanceStatus } from '../../../domain/entities/Attendance';
import { extractAttendanceType } from '../../../domain/rules/studentRecordRules';
import type { AttendanceRecordLike } from './summarizeAttendance';

/** 이 함수가 필요로 하는 기록의 최소 모양. 스토어를 import 하지 않으려고 좁게 받는다. */
export interface AttendanceRecordSource {
  readonly studentId: string;
  readonly category: string;
  readonly subcategory: string;
  readonly date: string;
}

/** 소분류 유형 → 집계용 상태. 모르는 유형은 세지 않는다(출석으로 넘긴다). */
const TYPE_TO_STATUS: Readonly<Record<string, AttendanceStatus>> = {
  결석: 'absent',
  지각: 'late',
  조퇴: 'earlyLeave',
  결과: 'classAbsence',
};

export interface ToAttendanceRollOptions {
  readonly classId: string;
  readonly date: string;
  /** 그날 학급 전체 인원. 기록이 없는 학생은 출석으로 채운다. */
  readonly rosterSize: number;
}

/**
 * @returns `summarizeAttendance` 에 그대로 넣을 수 있는 하루치 명부 한 건.
 *   해당 날짜 기록이 없어도 **빈 배열이 아니라** 전원 출석 명부를 돌려준다 —
 *   "기록이 없다"와 "모두 출석했다"는 선생님에게 같은 뜻이기 때문이다.
 */
export function toAttendanceRoll(
  records: readonly AttendanceRecordSource[],
  opts: ToAttendanceRollOptions,
): AttendanceRecordLike {
  const seen = new Set<string>();
  const students: { status: AttendanceStatus }[] = [];

  for (const record of records) {
    if (record.category !== 'attendance' || record.date !== opts.date) continue;
    // 한 학생이 같은 날 여러 건이면 첫 건만 센다 — 인원 합이 정원을 넘지 않게 한다.
    if (seen.has(record.studentId)) continue;

    const status = TYPE_TO_STATUS[extractAttendanceType(record.subcategory)];
    if (!status) continue;

    seen.add(record.studentId);
    students.push({ status });
  }

  const presentCount = Math.max(0, opts.rosterSize - students.length);
  for (let i = 0; i < presentCount; i += 1) students.push({ status: 'present' });

  return { classId: opts.classId, date: opts.date, students };
}
