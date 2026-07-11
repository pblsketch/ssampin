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

/**
 * 매트릭스 → 교시별 저장 페이로드(byPeriod) 투영.
 * 예외(비-present) 엔트리만 담고, 출석(빈칸=undefined)은 저장하지 않는다.
 * 자동 저장·수동 저장이 같은 투영을 쓰도록 단일 정의한다(§3.10-1).
 */
export function buildByPeriodFromMatrix(
  matrix: MatrixState,
  students: readonly { number: number; name: string }[],
  periods: readonly number[],
): Map<number, StudentAttendance[]> {
  const byPeriod = new Map<number, StudentAttendance[]>();
  for (const p of periods) {
    const arr: StudentAttendance[] = [];
    for (const [sKey, row] of Object.entries(matrix)) {
      const att = row?.[p];
      if (att) {
        const student = students.find((s) => studentKey(s) === sKey);
        arr.push({
          number: att.number || (student?.number ?? 0),
          status: att.status,
          ...(att.reason ? { reason: att.reason } : {}),
          ...(att.memo ? { memo: att.memo } : {}),
        });
      }
    }
    byPeriod.set(p, arr);
  }
  return byPeriod;
}

/**
 * 하루치 출결의 canonical 내용 다이제스트 — 자기 저장 서명(§3.10-1).
 *
 * 빈 교시 제외 · 교시 정렬 · 학생 정렬 · reason/memo 정규화를 저장측·재시드측에
 * **동일 적용**한다. `saveDayAttendance`가 빈 교시를 삭제하므로 보낸 byPeriod와 읽은
 * records의 형태가 달라도 이 투영을 거치면 같은 문자열이 된다. 카운트류 요약이 아니라
 * 내용 다이제스트여야 서로 다른 편집을 구분한다.
 */
export function canonicalDaySignature(
  byPeriod: ReadonlyMap<number, readonly StudentAttendance[]>,
): string {
  const rows: [number, string[]][] = [];
  const sortedPeriods = [...byPeriod.keys()].sort((a, b) => a - b);
  for (const p of sortedPeriods) {
    const entries = byPeriod.get(p) ?? [];
    if (entries.length === 0) continue;
    // number/status/reason 는 구분자(:)를 포함할 수 없고 memo 는 항상 tail 이라 엔트리 내부는
    // 모호하지 않다. 다만 자유 입력 memo 가 교시/엔트리 경계 구분자(, ; |)를 포함하면 서로 다른
    // 상태가 같은 문자열이 될 수 있으므로, 문자열 join 대신 JSON 구조로 직렬화해 경계를 보존한다.
    const parts = entries
      .map((s) => `${s.number}:${s.status}:${s.reason ?? ''}:${s.memo ?? ''}`)
      .sort();
    rows.push([p, parts]);
  }
  return JSON.stringify(rows);
}

/** AttendanceRecord[] → 교시별 Map (재시드측 canonical 서명 계산용). */
export function recordsToByPeriod(
  records: readonly AttendanceRecord[],
): Map<number, StudentAttendance[]> {
  const m = new Map<number, StudentAttendance[]>();
  for (const r of records) {
    m.set(r.period, [...r.students]);
  }
  return m;
}
