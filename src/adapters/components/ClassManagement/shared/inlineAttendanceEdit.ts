import type {
  AttendanceRecord,
  AttendanceReason,
  AttendanceStatus,
  StudentAttendance,
} from '@domain/entities/Attendance';
import { studentKey } from '@domain/entities/TeachingClass';

export interface AttendancePatch {
  readonly status: AttendanceStatus;
  readonly reason?: AttendanceReason;
  readonly memo?: string;
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
 */
export function mergeSingleStudentAttendance(
  existing: AttendanceRecord,
  targetStudentKey: string,
  patch: AttendancePatch,
): AttendanceRecord {
  const nextStudents: StudentAttendance[] = existing.students.map((sa) => {
    if (studentKey(sa) !== targetStudentKey) return sa; // 다른 학생: 참조 그대로 유지
    if (patch.status === 'present') {
      return { ...sa, status: 'present', reason: undefined, memo: undefined };
    }
    return { ...sa, status: patch.status, reason: patch.reason, memo: patch.memo };
  });
  return { ...existing, students: nextStudents };
}
