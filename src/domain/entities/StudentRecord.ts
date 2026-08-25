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

/**
 * 추적 그룹 → 멤버 필드 정본. 스탬프(쓰기: 멤버 중 하나라도 바뀌면 그룹 스탬프)와
 * 채택(병합: 멤버 전부 함께 이동)이 모두 이 레지스트리에서 파생된다 —
 * 새 추적 그룹은 여기(+FieldUpdatedAt 키)만 추가하면 양쪽이 자동 정합된다.
 * 한쪽에만 추가하면 "스탬프는 찍히는데 병합이 채택 안 함"(또는 반대) 소실 버그가 재발한다.
 */
export const TRACKED_GROUP_FIELDS = {
  reportedToNeis: ['reportedToNeis'],
  documentGroup: ['documents', 'documentSubmitted'],
  followUpDone: ['followUpDone', 'followUp', 'followUpDate'],
} as const satisfies Record<keyof FieldUpdatedAt, readonly (keyof StudentRecord)[]>;

export type TrackedGroup = keyof typeof TRACKED_GROUP_FIELDS;
export const TRACKED_GROUPS = Object.keys(TRACKED_GROUP_FIELDS) as readonly TrackedGroup[];

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
  /**
   * 관찰 슬롯(`domain/rules/observationSlots.ts` HOMEROOM_SLOTS) — "어떤 장면인가".
   * ★`tags` 와 섞지 않는다 — 담임의 tags 는 이미 "세부 분류"다(InlineRecordEditor).
   * 구 데이터에는 없다. **부재는 빈 배열이 아니다**(병합에서 덮지 말 것).
   */
  readonly slots?: readonly string[];
  /**
   * 학기 epoch 스탬프(S2.2·ADR-034) — `date`(사건 발생일)에서 파생한 '2026-1' 형식.
   * buildStudentRecordsSaveData가 저장 시 자동 부착한다(withDerivedTerm — createdAt/updatedAt 금지).
   * 구 데이터에는 없다(부재 = 현행 병합 폴백, 추측 부착 금지). 계약 분류: notMirrored(동기화 메타).
   */
  readonly term?: string;
}

/**
 * 삭제 전파용 툼스톤.
 * 기록을 지울 때 "언제 지웠는지"를 남겨, 기기 간 병합에서
 * 상대 기기에 남아 있던 옛 사본이 부활하지 않게 한다.
 * 계약 분류: notMirrored 계열(동기화 메타 — 외부 AI 미노출, updatedAt 선례).
 * entity-samples 픽스처에 넣지 말 것.
 */
export interface StudentRecordTombstone {
  /** StudentRecord.id */
  readonly id: string;
  /**
   * 삭제 시각(ISO 문자열) — StudentRecord.updatedAt 과 동일 축.
   * 관찰기록 툼스톤(deletedAt: number/ms)과 달리 여기는 문자열이다 —
   * 숫자로 정의하면 updatedAt(string)과의 부활 비교가 조용히 항상 오판한다.
   */
  readonly deletedAt: string;
}

/** 툼스톤 보존 기간(90일, 관찰기록과 동일) — 지난 툼스톤은 저장 시 정리(GC)된다 */
export const STUDENT_RECORD_TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export interface StudentRecordsData {
  readonly records: readonly StudentRecord[];
  readonly categories?: readonly RecordCategoryItem[];
  /** 삭제 전파용 툼스톤 목록 (과거 데이터에는 없음 — optional 유지) */
  readonly deleted?: readonly StudentRecordTombstone[];
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
