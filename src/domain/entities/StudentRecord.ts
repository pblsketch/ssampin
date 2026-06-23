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

export interface StudentRecord {
  readonly id: string;
  readonly studentId: string;
  readonly category: string;
  readonly subcategory: string;
  readonly content: string;
  readonly date: string;
  readonly createdAt: string;
  readonly method?: CounselingMethod;
  readonly followUp?: string;
  readonly followUpDate?: string;
  readonly followUpDone?: boolean;
  readonly reportedToNeis?: boolean;
  readonly documentSubmitted?: boolean;
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
