/**
 * 증빙서류 요구 정책 (M4, attendance-neis-audit-suite D-1).
 *
 * 어떤 출결 기록이 증빙서류(신청서·진단서 등) 수합 대상인지 학교 방침으로
 * 판정한다. 기존에는 모든 출결 기록이 '서류 미제출'로 집계되는 과다 카운트가
 * 있었다 — 이 순수 함수(requiresDocument)가 배너·통계·검토 큐·조회 필터의
 * 단일 게이트가 된다.
 *
 * 기본 정책: 출석인정('인정') 사유만 전 상태 요구(교외체험학습 신청서·보고서 등).
 * 질병/미인정/기타는 학교 방침에 따라 설정에서 상태별로 켠다.
 *
 * 다중 교시 집약: attendancePeriods는 교시별 (status, reason) 배열이라 한 기록이
 * 서로 다른 축을 동시에 가질 수 있다 → **OR 집약**(어느 한 교시라도 요구면 요구).
 * 결측(레거시): subcategory("결석 (질병)" 형식)에서 상태·사유를 추론하고,
 * 추론 불가면 **보수적 false**(과다 카운트 재유입 방지).
 */
import type { StudentRecord } from '@domain/entities/StudentRecord';

export type DocReasonAxis = '질병' | '미인정' | '기타' | '인정';
export type DocStatusKey = 'absent' | 'late' | 'earlyLeave' | 'classAbsence';

export const ALL_DOC_STATUSES: readonly DocStatusKey[] = [
  'absent',
  'late',
  'earlyLeave',
  'classAbsence',
];

export const DOC_STATUS_LABELS: Record<DocStatusKey, string> = {
  absent: '결석',
  late: '지각',
  earlyLeave: '조퇴',
  classAbsence: '결과',
};

export const DOC_REASON_AXES: readonly DocReasonAxis[] = ['인정', '질병', '미인정', '기타'];

/** 사유 축별로 서류를 요구할 상태 집합. 키가 없는 축은 요구하지 않음. */
export interface AttendanceDocumentPolicy {
  readonly requiredBy: Partial<Record<DocReasonAxis, readonly DocStatusKey[]>>;
}

/** 기본 정책 — 출석인정만 전 상태 요구. 나머지 축은 학교 방침 선택. */
export const DEFAULT_ATTENDANCE_DOCUMENT_POLICY: AttendanceDocumentPolicy = {
  requiredBy: { 인정: ALL_DOC_STATUSES },
};

function axisOf(reason?: string): DocReasonAxis {
  const r = (reason ?? '').trim();
  if (r.includes('미인정') || r.includes('무단')) return '미인정';
  if (r.includes('질병')) return '질병';
  if (r.includes('인정')) return '인정';
  return '기타';
}

function isRequired(
  policy: AttendanceDocumentPolicy,
  axis: DocReasonAxis,
  status: DocStatusKey,
): boolean {
  return policy.requiredBy[axis]?.includes(status) ?? false;
}

/** 레거시(attendancePeriods 결측) 기록의 subcategory에서 상태 추론. 예: "결석 (질병)" */
function statusFromSubcategory(subcategory: string): DocStatusKey | null {
  if (subcategory.includes('결석')) return 'absent';
  if (subcategory.includes('지각')) return 'late';
  if (subcategory.includes('조퇴')) return 'earlyLeave';
  if (subcategory.includes('결과')) return 'classAbsence';
  return null;
}

/**
 * 이 출결 기록이 증빙서류 수합 대상인가.
 *
 * - 출결 카테고리가 아니면 false.
 * - attendancePeriods 있음: 교시별 (사유 축, 상태)에 정책 적용 후 OR 집약.
 * - 결측/빈 배열(레거시): subcategory에서 상태·사유 추론, 추론 불가 시 보수적 false.
 */
export function requiresDocument(
  record: Pick<StudentRecord, 'category' | 'subcategory' | 'attendancePeriods'>,
  policy: AttendanceDocumentPolicy = DEFAULT_ATTENDANCE_DOCUMENT_POLICY,
): boolean {
  if (record.category !== 'attendance') return false;

  const periods = record.attendancePeriods;
  if (periods != null && periods.length > 0) {
    return periods.some((p) => isRequired(policy, axisOf(p.reason), p.status));
  }

  // 레거시 — subcategory 추론 (예: "결석 (인정)"). 상태 추론 실패 시 보수적 false.
  const status = statusFromSubcategory(record.subcategory ?? '');
  if (status == null) return false;
  return isRequired(policy, axisOf(record.subcategory), status);
}
