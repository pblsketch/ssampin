import type {
  AttendanceRecord,
  AttendanceReason,
  AttendanceStatus,
  StudentAttendance,
} from '@domain/entities/Attendance';
import { studentKey } from '@domain/entities/TeachingClass';
import {
  createAttendanceRosterMatcher,
  type AttendanceStudentRef,
  type ResolvedAttendanceEntry,
} from '@domain/rules/attendanceStudentMatch';

export interface AttendancePatch {
  readonly status: AttendanceStatus;
  readonly reason?: AttendanceReason;
  readonly memo?: string;
}

/**
 * 조회 화면이 띄운 학생 키(`targetStudentKey`)가 가리키는 저장 항목들.
 *
 * 조회 화면은 번호만 저장된 옛 항목을 명단 학생에 이어 그 학생의 키로 띄운다. 그래서
 * 저장된 항목의 키 문자열만 비교하면 그 항목을 못 찾아 **편집이 아무 일도 안 하고**
 * "저장했습니다"가 뜬다. 띄울 때와 같은 규칙(`createAttendanceRosterMatcher`)으로 찾는다.
 * 명단에서 못 정한 항목은 저장된 키 그대로 비교한다(명단을 안 넘기면 전부 이 길이다).
 */
function resolveTargets(
  existing: AttendanceRecord,
  targetStudentKey: string,
  roster: readonly AttendanceStudentRef[],
): ResolvedAttendanceEntry<StudentAttendance, AttendanceStudentRef>[] {
  return createAttendanceRosterMatcher(roster)
    .resolveEntries(existing.students)
    .filter((item) => (item.key ?? studentKey(item.entry)) === targetStudentKey);
}

/** 그 학생의 저장 항목 하나(되돌리기용 스냅샷 등). 없으면 undefined */
export function findStudentAttendance(
  existing: AttendanceRecord,
  targetStudentKey: string,
  roster: readonly AttendanceStudentRef[] = [],
): StudentAttendance | undefined {
  return resolveTargets(existing, targetStudentKey, roster)[0]?.entry;
}

/**
 * 한 출결 레코드(한 교시)에서 대상 학생 1명의 status/reason/memo만 안전하게 갱신한다.
 *
 * 데이터 안전 핵심: `existing.students` 배열 전체를 보존하고 대상 학생만 새 객체로 교체한다.
 * 같은 교시의 다른 학생 객체는 참조(===) 그대로 유지 → 통째 교체형 저장(`saveAttendanceRecord`)에서
 * 같은 교시 다른 학생이 유실되지 않는다. `classId`/`groupId`/`date`/`period` 식별 필드도 보존.
 *
 * present 전환 시 reason/memo를 함께 제거한다(비출결만 사유/메모 — 입력 화면 규칙과 일치).
 * 조회 화면의 부분 뷰모델로 record를 재구성하지 말고 반드시 store 원본 레코드를 넘길 것.
 *
 * `roster`(그 수업반 명단 전체)를 넘기면 번호만 저장된 옛 항목도 대상 학생의 것으로 찾아
 * 고치고, 고치는 김에 명단의 학년·반을 실어 준다 — 항목을 새로 만들지 않고 **그 자리에서**
 * 바꾸므로 한 학생이 두 줄이 되지 않는다.
 */
export function mergeSingleStudentAttendance(
  existing: AttendanceRecord,
  targetStudentKey: string,
  patch: AttendancePatch,
  roster: readonly AttendanceStudentRef[] = [],
): AttendanceRecord {
  const targets = new Map<StudentAttendance, AttendanceStudentRef | null>();
  for (const item of resolveTargets(existing, targetStudentKey, roster)) {
    targets.set(item.entry, item.student);
  }
  const nextStudents: StudentAttendance[] = existing.students.map((sa) => {
    if (!targets.has(sa)) return sa; // 다른 학생: 참조 그대로 유지
    const student = targets.get(sa) ?? null;
    const identity = {
      ...(student?.grade != null ? { grade: student.grade } : {}),
      ...(student?.classNum != null ? { classNum: student.classNum } : {}),
    };
    if (patch.status === 'present') {
      return { ...sa, ...identity, status: 'present', reason: undefined, memo: undefined };
    }
    return { ...sa, ...identity, status: patch.status, reason: patch.reason, memo: patch.memo };
  });
  return { ...existing, students: nextStudents };
}
