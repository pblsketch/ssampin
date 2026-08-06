export type AttendanceStatus = 'present' | 'absent' | 'late' | 'earlyLeave' | 'classAbsence';

export type AttendanceReason = '질병' | '인정' | '미인정' | '기타';

export const ATTENDANCE_REASONS: readonly AttendanceReason[] = [
  '질병',
  '인정',
  '미인정',
  '기타',
] as const;

/** 출결 상태 순환 순서 (present → absent → late → earlyLeave → classAbsence → present) */
export const ATTENDANCE_STATUS_ORDER: readonly AttendanceStatus[] = [
  'present',
  'absent',
  'late',
  'earlyLeave',
  'classAbsence',
] as const;

export interface StudentAttendance {
  readonly number: number;
  readonly status: AttendanceStatus;
  readonly reason?: AttendanceReason;
  readonly memo?: string;
  readonly grade?: number;
  readonly classNum?: number;
}

export interface AttendanceRecord {
  readonly classId: string;
  /** 그룹 출결: 이 값이 있으면 groupId 기준 조회 우선 */
  readonly groupId?: string;
  readonly date: string;
  readonly period: number;
  readonly students: readonly StudentAttendance[];
  /**
   * 이 레코드가 마지막으로 수정된 시각(ISO).
   * 기기 간 동기화에서 레코드 단위 병합의 승자 판정에 사용한다.
   * 과거 데이터에는 없을 수 있다(부재 시 병합에서 가장 오래된 것으로 취급).
   */
  readonly updatedAt?: string;
  /**
   * 학기 epoch 스탬프(S2.2·ADR-034) — `date`(사건 발생일)에서 파생한 '2026-1' 형식.
   * buildAttendanceSaveData가 저장 시 자동 부착한다(withDerivedTerm — createdAt/updatedAt 금지).
   * 구 데이터에는 없다(부재 = 현행 병합 폴백, 추측 부착 금지). 계약 분류: notMirrored(동기화 메타).
   */
  readonly term?: string;
}

/**
 * 삭제 전파용 툼스톤.
 * 레코드를 지울 때 "언제 지웠는지"를 남겨, 기기 간 병합에서
 * 상대 기기에 남아 있던 옛 사본이 부활하지 않게 한다.
 */
export interface AttendanceTombstone {
  /** attendanceRecordKey 결과 */
  readonly key: string;
  /** 삭제 시각(ISO) */
  readonly deletedAt: string;
}

/** 툼스톤 보존 기간 — 지난 툼스톤은 저장/병합 시 정리(GC)된다 */
export const ATTENDANCE_TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export interface AttendanceData {
  readonly records: readonly AttendanceRecord[];
  /** 삭제 전파용 툼스톤 목록 (과거 데이터에는 없음) */
  readonly deleted?: readonly AttendanceTombstone[];
}

/**
 * 출결 레코드의 고유 식별 키.
 * 저장 시 변경 감지(stampChangedRecords)와 기기 간 병합(mergeAttendance)이
 * 같은 규칙을 써야 하므로 도메인에 단일 정의한다.
 */
export function attendanceRecordKey(r: AttendanceRecord): string {
  return `${r.classId}|${r.groupId ?? ''}|${r.date}|${r.period}`;
}

/**
 * 학급 관점의 (날짜, 교시) 출결 레코드 조회 — 그룹 학급(같은 교실의 여러 과목)은
 * 그룹 키를 우선한다(물리 classId 무관).
 *
 * 그룹 레코드를 classId로만 찾으면 다른 과목 명의로 저장된 공유 레코드를 놓치고,
 * 그 상태로 부분 페이로드를 저장하면 기존 학생 출결이 통째로 교체·유실된다
 * (2026-07 QA2 B2). 저장 전 existing 탐색은 반드시 이 함수를 쓸 것.
 */
export function findAttendanceRecordForClass(
  records: readonly AttendanceRecord[],
  cls: { readonly id: string; readonly groupId?: string },
  date: string,
  period?: number,
): AttendanceRecord | null {
  const candidates = records.filter(
    (r) => r.date === date && (period === undefined || r.period === period),
  );
  if (cls.groupId) {
    return (
      candidates.find((r) => r.groupId === cls.groupId) ??
      candidates.find((r) => r.classId === cls.id && !r.groupId) ??
      candidates.find((r) => r.classId === cls.id) ??
      null
    );
  }
  return (
    candidates.find((r) => r.classId === cls.id && !r.groupId) ??
    candidates.find((r) => r.classId === cls.id) ??
    null
  );
}

/** 조회(아침 조회) — 1교시 전 담임 점검 시간대 */
export const PERIOD_MORNING = 0;
/** 종례(하교 종례) — 8교시 후 담임 점검 시간대 */
export const PERIOD_CLOSING = 9;

/** 교시 번호 → 표시 라벨 ("1교시" / "조회" / "종례") */
export function formatPeriodLabel(period: number): string {
  if (period === PERIOD_MORNING) return '조회';
  if (period === PERIOD_CLOSING) return '종례';
  return `${period}교시`;
}

/** 교시 번호 → 짧은 라벨 ("1" / "조회" / "종례") — 좁은 칸에서 사용 */
export function formatPeriodShort(period: number): string {
  if (period === PERIOD_MORNING) return '조회';
  if (period === PERIOD_CLOSING) return '종례';
  return String(period);
}
