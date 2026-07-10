import type {
  AttendanceRecord,
  AttendanceStatus,
  StudentAttendance,
} from '@domain/entities/Attendance';
import { PERIOD_MORNING, PERIOD_CLOSING } from '@domain/entities/Attendance';
import { buildAttendanceMatrix } from '@domain/rules/attendanceRules';
import { studentKey } from '@domain/entities/TeachingClass';

/**
 * 출결 그리드 공용 프레젠테이션 코어 — 담임/수업관리 셸이 함께 소비하는 중립 모듈.
 * 날짜·저장·dirty 같은 셸 상태는 여기에 두지 않는다(각 기능 셸이 소유).
 */

export const DEFAULT_PERIODS = [PERIOD_MORNING, 1, 2, 3, 4, 5, 6, 7, 8, PERIOD_CLOSING] as const;

export function isSpecialPeriod(p: number): boolean {
  return p === PERIOD_MORNING || p === PERIOD_CLOSING;
}

export const STATUS_CONFIG: Record<
  AttendanceStatus,
  { label: string; icon: string; cell: string }
> = {
  present: { label: '출석', icon: 'check_circle', cell: 'text-sp-muted/50 hover:bg-sp-surface' },
  absent: {
    label: '결석',
    icon: 'cancel',
    cell: 'bg-red-500/15 text-red-400 border border-red-500/30',
  },
  late: {
    label: '지각',
    icon: 'schedule',
    cell: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  },
  earlyLeave: {
    label: '조퇴',
    icon: 'exit_to_app',
    cell: 'bg-orange-500/15 text-orange-400 border border-orange-500/30',
  },
  classAbsence: {
    label: '결과',
    icon: 'event_busy',
    cell: 'bg-purple-500/15 text-purple-400 border border-purple-500/30',
  },
};

export const STAT_COLORS: Record<AttendanceStatus, string> = {
  present: 'text-green-400',
  absent: 'text-red-400',
  late: 'text-amber-400',
  earlyLeave: 'text-orange-400',
  classAbsence: 'text-purple-400',
};

/** 그리드 행 학생 (담임은 grade/classNum 없이 number 기반) */
export interface MatrixStudent {
  key?: string; // 이미 계산된 studentKey (선택적)
  number: number;
  name: string;
  grade?: number;
  classNum?: number;
  labelPrefix?: string; // "1-3" 같은 소속 라벨 (optional)
}

/** 로컬 편집 상태 엔트리 */
export interface LocalStudentAttendance extends StudentAttendance {
  grade?: number;
  classNum?: number;
}

export type MatrixState = Record<
  string /* studentKey */,
  Record<number /* period */, LocalStudentAttendance | undefined>
>;

/** 저장된 레코드로부터 그리드 편집 초기 상태를 시드한다. */
export function buildInitialMatrix(
  records: readonly AttendanceRecord[],
  classId: string,
  date: string,
  students: readonly { number: number; name: string; grade?: number; classNum?: number }[],
  periods: readonly number[],
): MatrixState {
  const mapResult = buildAttendanceMatrix(records, classId, date, students, periods);
  const obj: MatrixState = {};
  for (const [key, periodMap] of mapResult) {
    obj[key] = {};
    for (const [p, att] of periodMap) {
      const student = students.find((s) => studentKey(s) === key);
      if (att) {
        obj[key]![p] = { ...att, grade: student?.grade, classNum: student?.classNum };
      } else {
        obj[key]![p] = undefined;
      }
    }
  }
  return obj;
}
