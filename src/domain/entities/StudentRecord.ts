import type { RecordCategoryItem } from '../valueObjects/RecordCategory';
import type { AttendanceStatus, AttendanceReason } from './Attendance';

export type CounselingMethod = 'phone' | 'face' | 'online' | 'visit' | 'text' | 'other';

/**
 * 출결 카테고리 기록에서 교시별 상세를 보존하기 위한 엔트리.
 * 대표 subcategory 1건으로 뭉치기 전의 원천 정보 — 교시·상태·사유를 구조화된 형태로 유지한다.
 * `status`가 `present`인 교시는 기록하지 않는다(이상 출결만 보존).
 */
export interface AttendancePeriodEntry {
  readonly period: number;
  readonly status: Exclude<AttendanceStatus, 'present'>;
  readonly reason?: AttendanceReason;
  readonly memo?: string;
}

/**
 * 증빙서류 종류별 체크 항목 (M6, D-2) — 예: 신청서/보고서/증빙자료.
 * documents가 존재하는 기록의 documentSubmitted는 "전 종류 제출 완료"의 파생값이며,
 * 쓰기 경로가 항상 함께 갱신한다(attendanceDocumentPolicy.toggleDocumentKind 불변식).
 */
export interface AttendanceDocumentItem {
  readonly kind: string;
  readonly submitted: boolean;
}

/**
 * 추적 항목별 마지막 수정 시각(ISO) — 동기화가 기록 통째(record-LWW)가 아니라
 * 항목 단위로 "가장 최근 수정"을 판별하는 근거(sync-hardening-2 B트랙).
 *
 * - `documentGroup` = documents + documentSubmitted 한 그룹(문서 묶음 단위 병합).
 * - `followUpDone` = followUpDone + followUp + followUpDate 한 그룹(동반 세팅 UX).
 * - 지연(lazy) 스탬프: 구 기록엔 없다가 해당 항목을 실제 편집할 때만 붙는다
 *   (일괄 마이그레이션 금지 — 대량 재업로드 방지).
 * - 반드시 최상위 `type` 별칭으로 유지할 것 — StudentRecord 안에 인라인 객체로
 *   넣으면 계약 메타테스트(extractInterfaceFields)가 첫 닫는 중괄호에서 본문을
 *   잘라 이후 필드를 유령 필드로 오검출한다.
 * - 계약 분류: notMirrored(동기화 메타 — 외부 AI 미노출, updatedAt 선례).
 */
export type FieldUpdatedAt = {
  readonly reportedToNeis?: string;
  readonly documentGroup?: string;
  readonly followUpDone?: string;
};

export interface StudentRecord {
  readonly id: string;
  readonly studentId: string;
  readonly category: string;
  readonly subcategory: string;
  readonly content: string;
  readonly date: string;
  readonly createdAt: string;
  /**
   * 마지막 수정 시각(ISO). 동기화 병합이 "가장 최근 수정"을 판별하는 근거.
   * 없으면(구 데이터) 병합은 createdAt·tags 로 폴백한다. 쓰기 경로에서 매번 갱신한다.
   */
  readonly updatedAt?: string;
  readonly method?: CounselingMethod;
  readonly followUp?: string;
  readonly followUpDate?: string;
  readonly followUpDone?: boolean;
  readonly reportedToNeis?: boolean;
  readonly documentSubmitted?: boolean;
  /**
   * 증빙서류 종류별 체크(M6) — 미존재(구 데이터)면 documentSubmitted 단독 사용.
   * 존재하면 documentSubmitted는 파생값 — 재계산은 반드시 정본
   * deriveDocumentSubmitted(attendanceDocumentPolicy)를 경유한다(빈 배열=미존재로
   * 취급해 fallback 보존 — 원시 documents.every()는 빈 배열에서 true가 되는 함정).
   */
  readonly documents?: readonly AttendanceDocumentItem[];
  /**
   * 추적 항목별 수정 시각 — 항목 단위 동기화 병합의 근거(위 FieldUpdatedAt 참조).
   * 추적 항목(reportedToNeis/documentGroup/followUpDone 그룹)을 바꾸는 쓰기 경로는
   * ManageStudentRecords가 before→after 의도 diff로 자동 스탬프한다.
   */
  readonly fieldUpdatedAt?: FieldUpdatedAt;
  /** 출결 카테고리 전용: 어떤 교시에 어떤 상태가 있었는지 보존 (period 오름차순) */
  readonly attendancePeriods?: readonly AttendancePeriodEntry[];
  /** 통합 입력 폼(S4)에서 부여하는 태그 목록. 기존 레코드는 undefined — additive optional. */
  readonly tags?: readonly string[];
}

export interface StudentRecordsData {
  readonly records: readonly StudentRecord[];
  readonly categories?: readonly RecordCategoryItem[];
}

export interface AttendanceStats {
  readonly absent: number;
  readonly late: number;
  readonly earlyLeave: number;
  readonly resultAbsent: number;
  readonly praise: number;
}

/**
 * 담임 누가기록 통합 입력(S4)의 태그 후보.
 * 교과 관찰 태그(DEFAULT_OBSERVATION_TAGS)에 대응하는 담임 맥락 서술 라벨 — 분류(category)와 직교(P3).
 */
export const DEFAULT_HOMEROOM_RECORD_TAGS = [
  '수업태도',
  '교우관계',
  '생활습관',
  '특이사항',
] as const;
