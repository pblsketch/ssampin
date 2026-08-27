/**
 * 증빙서류 요구 정책 (M4, attendance-neis-audit-suite D-1).
 *
 * 어떤 출결 기록이 증빙서류(신청서·진단서 등) 수합 대상인지 학교 방침으로
 * 판정한다. 기존에는 모든 출결 기록이 '서류 미제출'로 집계되는 과다 카운트가
 * 있었다 — 이 순수 함수(requiresDocument)가 배너·통계·검토 큐·조회 필터의
 * 단일 게이트가 된다.
 *
 * 기본 정책: 출석인정('인정')과 '질병' 사유를 전 상태 요구(교외체험학습 신청서·보고서, 진단서 등).
 * '기타'는 정의가 학교마다 달라 기본 꺼짐 — 설정에서 상태별로 켠다.
 * '미인정'(무단)은 증빙서류를 걷지 않는 것이 학교 공통이라 정책보다 우선해 항상 제외한다.
 *
 * 다중 교시 집약: attendancePeriods는 교시별 (status, reason) 배열이라 한 기록이
 * 서로 다른 축을 동시에 가질 수 있다 → **OR 집약**(어느 한 교시라도 요구면 요구).
 * 결측(레거시): subcategory("결석 (질병)" 형식)에서 상태·사유를 추론하고,
 * 추론 불가면 **보수적 false**(과다 카운트 재유입 방지).
 */
import type { StudentRecord, AttendanceDocumentItem } from '@domain/entities/StudentRecord';

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

/**
 * 증빙서류를 걷지 않는 사유 축 — 학교 공통(오너 확정 2026-08-27).
 * 정책 설정보다 **우선**한다: 저장된 설정에 켜져 있어도 무시되므로 마이그레이션이 필요 없다.
 */
export const DOC_EXEMPT_REASON_AXES: readonly DocReasonAxis[] = ['미인정'];

/** 설정 화면에서 편집 가능한 사유 축 — 공통 면제 축은 아예 노출하지 않는다. */
export const EDITABLE_DOC_REASON_AXES: readonly DocReasonAxis[] = DOC_REASON_AXES.filter(
  (axis) => !DOC_EXEMPT_REASON_AXES.includes(axis),
);

/** 사유 축별로 서류를 요구할 상태 집합. 키가 없는 축은 요구하지 않음. */
export interface AttendanceDocumentPolicy {
  readonly requiredBy: Partial<Record<DocReasonAxis, readonly DocStatusKey[]>>;
}

/**
 * 기본 정책 — 출석인정·질병을 전 상태 요구.
 *
 * '인정만'이던 기존 기본값은 진단서를 걷는 학교에서 서류 기능이 통째로 안 보이는 원인이었다
 * (분석: docs/03-analysis/attendance-document-checkbox-discoverability.analysis.md §2).
 * '기타'는 정의가 학교마다 달라 보수적으로 꺼 둔다. '미인정'은 DOC_EXEMPT_REASON_AXES가 막는다.
 */
export const DEFAULT_ATTENDANCE_DOCUMENT_POLICY: AttendanceDocumentPolicy = {
  requiredBy: { 인정: ALL_DOC_STATUSES, 질병: ALL_DOC_STATUSES },
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
  // 공통 면제가 정책보다 우선 — 설정에 남아 있는 값이 되살아나지 않게 여기서 먼저 막는다.
  if (DOC_EXEMPT_REASON_AXES.includes(axis)) return false;
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

/**
 * 이 기록이 **공통 면제 축(미인정)만으로** 이뤄져 있는가.
 *
 * 화면에서 "방침을 바꾸면 걷을 수 있어요" 안내를 띄울지 가르는 데 쓴다 —
 * 공통 면제는 학교 방침을 바꿔도 달라지지 않으므로, 그 경우 안내는 거짓말이 된다.
 * (설계: docs/02-design/features/attendance-document-discoverability.design.md §4-2)
 *
 * 다중 교시는 **AND 집약**(전 교시가 면제일 때만 면제) — requiresDocument의 OR 집약과 짝을 이룬다.
 */
export function isDocumentExemptByRule(
  record: Pick<StudentRecord, 'category' | 'subcategory' | 'attendancePeriods'>,
): boolean {
  if (record.category !== 'attendance') return false;
  const periods = record.attendancePeriods;
  if (periods != null && periods.length > 0) {
    return periods.every((p) => DOC_EXEMPT_REASON_AXES.includes(axisOf(p.reason)));
  }
  return DOC_EXEMPT_REASON_AXES.includes(axisOf(record.subcategory));
}

/* ── M6 (D-2): 서류 종류별 체크리스트 ── */

/** 기본 서류 종류 — 사용자가 종류를 따로 정의하기 전의 표준 3종. */
export const DEFAULT_DOCUMENT_KINDS: readonly string[] = ['신청서', '보고서', '증빙자료'];

/**
 * documents → documentSubmitted 파생 (하위호환 규칙의 단일 정의).
 * documents가 있으면 "전 종류 제출"이 곧 제출 완료다. 없으면(구 데이터) 기존 boolean 단독.
 */
export function deriveDocumentSubmitted(
  documents: readonly AttendanceDocumentItem[] | undefined,
  fallback?: boolean,
): boolean {
  if (documents == null || documents.length === 0) return fallback ?? false;
  return documents.every((d) => d.submitted);
}

/**
 * 종류 하나를 토글한 다음 상태를 계산한다 (순수 함수 — 스토어 액션이 그대로 적용).
 *
 * - documents 미존재(구 데이터): 기본 3종으로 초기화하되, 기존 documentSubmitted가
 *   true였다면 전 종류 제출 상태에서 출발한다(하위호환 — 완료 기록이 미완료로 튀지 않게).
 * - 알 수 없는 kind는 submitted=true로 추가한다(사용자 정의 종류 허용).
 * - 반환된 documentSubmitted는 항상 파생 불변식(전 종류 제출)을 만족한다.
 */
export function toggleDocumentKind(args: {
  documents?: readonly AttendanceDocumentItem[];
  documentSubmitted?: boolean;
  kind: string;
  defaultKinds?: readonly string[];
}): { documents: readonly AttendanceDocumentItem[]; documentSubmitted: boolean } {
  const { documents, documentSubmitted, kind, defaultKinds = DEFAULT_DOCUMENT_KINDS } = args;
  const base: AttendanceDocumentItem[] =
    documents != null && documents.length > 0
      ? [...documents]
      : defaultKinds.map((k) => ({ kind: k, submitted: documentSubmitted === true }));

  const idx = base.findIndex((d) => d.kind === kind);
  if (idx >= 0) {
    const cur = base[idx]!;
    base[idx] = { kind: cur.kind, submitted: !cur.submitted };
  } else {
    base.push({ kind, submitted: true });
  }

  return { documents: base, documentSubmitted: deriveDocumentSubmitted(base) };
}

/**
 * 표시용 체크리스트 — documents 미존재 기록도 기본 3종을 (기존 boolean 승계 상태로) 보여준다.
 */
export function documentChecklist(
  record: Pick<StudentRecord, 'documents' | 'documentSubmitted'>,
  defaultKinds: readonly string[] = DEFAULT_DOCUMENT_KINDS,
): readonly AttendanceDocumentItem[] {
  if (record.documents != null && record.documents.length > 0) return record.documents;
  return defaultKinds.map((k) => ({ kind: k, submitted: record.documentSubmitted === true }));
}
