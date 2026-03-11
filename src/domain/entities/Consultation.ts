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
  readonly createdAt: string;
}

/** 상담 가능 날짜/시간대 */
export interface ConsultationDate {
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
}

/** 상담 슬롯 (자동 생성) */
export interface ConsultationSlot {
  readonly id: string;
  readonly scheduleId: string;
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly status: SlotStatus;
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
