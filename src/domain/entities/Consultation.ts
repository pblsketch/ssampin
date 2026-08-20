/** 상담 예약 */

export type ConsultationType = 'parent' | 'student';
export type ConsultationMethod = 'face' | 'phone' | 'video';
export type SlotStatus = 'available' | 'booked' | 'blocked';

/** 상담 일정 (교사가 생성) */
export interface ConsultationSchedule {
  readonly id: string;
  readonly title: string;
  readonly type: ConsultationType;
  readonly methods: readonly ConsultationMethod[];
  readonly slotMinutes: number; // 10 | 15 | 20 | 30
  readonly dates: readonly ConsultationDate[];
  readonly targetClassName: string;
  readonly targetStudents: readonly { readonly number: number }[];
  readonly message?: string;
  readonly shareUrl: string;
  readonly shortUrl?: string;
  readonly adminKey: string;
  readonly isArchived: boolean;
  /** 담임이 수동으로 예약을 마감한 시각 (ISO). undefined = 마감 안 됨(예약 진행 중) */
  readonly closedAt?: string;
  /** 자동 만료 시각 (ISO). 이 시각이 지나면 예약 링크가 마감된다. undefined = 자동 만료 없음 */
  readonly expiresAt?: string;
  readonly createdAt: string;
}

/** 상담 가능 날짜/시간대 */
export interface ConsultationDate {
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
}

/**
 * 슬롯을 차단한 주체.
 *
 * - `'teacher'` — 교사가 직접 막았다. **자동 재계산이 절대 건드리지 않는다.**
 * - `'auto'`    — 일정표·시간표와 겹쳐 앱이 막았다. 겹침이 사라지면 자동으로 풀린다.
 *
 * 이 구분이 없던 시절에는 교사가 막아 둔 슬롯을 재계산이 "잘못 막힌 것"으로 보고
 * 되돌려서, 막아 둔 시간에 학부모 예약이 들어올 수 있었다(2026-08-20 사용자 신고).
 *
 * 사람이 읽는 차단 사유(겹친 일정 제목 등)는 여기 **저장하지 않는다** —
 * `consultation_slots` 는 공개 읽기 테이블이라 교사의 일정 제목이 노출된다(ADR-060).
 */
export type SlotBlockedBy = 'teacher' | 'auto';

/** 상담 슬롯 (자동 생성) */
export interface ConsultationSlot {
  readonly id: string;
  readonly scheduleId: string;
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly status: SlotStatus;
  /** status === 'blocked' 일 때만 의미가 있다. 그 외에는 undefined. */
  readonly blockedBy?: SlotBlockedBy;
}

/** 상담 예약 건 */
export interface ConsultationBooking {
  readonly id: string;
  readonly scheduleId: string;
  readonly slotId: string;
  readonly studentNumber: number;
  readonly bookerInfoEncrypted?: string;
  readonly method: ConsultationMethod;
  readonly memoEncrypted?: string;
  readonly createdAt: string;
}

/** 전체 상담 저장 데이터 (로컬) */
export interface ConsultationsData {
  readonly schedules: readonly ConsultationSchedule[];
}

/**
 * 상담 일정 부분 갱신 패치.
 * 모든 필드 optional — 변경하려는 항목만 채워서 전달한다.
 * id/adminKey/shareUrl/createdAt/isArchived/targetClassName/targetStudents 는 불변.
 */
export interface ScheduleUpdatePatch {
  readonly title?: string;
  readonly type?: ConsultationType;
  readonly methods?: readonly ConsultationMethod[];
  readonly slotMinutes?: number;
  readonly dates?: readonly ConsultationDate[];
  readonly message?: string;
  /** 차단 슬롯 명시 추가 (date_startTime). Phase 2 동기화에서 주로 활용. */
  readonly blockedSlots?: readonly { readonly date: string; readonly startTime: string }[];
}

/** 상담 일정 패치 시 영향받는 예약 사유 */
export type ScheduleUpdateAffectReason = 'slot_removed' | 'slot_blocked' | 'method_unsupported';

/**
 * `analyzeScheduleUpdateImpact` 결과.
 * - preserved: 패치 후에도 슬롯이 그대로 살아 있고 method도 지원되는 예약
 * - affected: 슬롯이 사라지거나 차단되거나 method가 더 이상 지원되지 않는 예약 — 사용자 결정 필요
 */
export interface ScheduleUpdateImpact {
  readonly preserved: readonly ConsultationBooking[];
  readonly affected: readonly {
    readonly booking: ConsultationBooking;
    readonly reason: ScheduleUpdateAffectReason;
  }[];
}
