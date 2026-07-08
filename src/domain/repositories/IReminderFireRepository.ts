import type { ReminderFireData } from '../entities/RecordReminder';

/**
 * 관찰 기록 알림 발화 장부 저장소.
 * 같은 학생·같은 날 중복 발화를 막기 위한 dedup 키(`studentId:YYYY-MM-DD`)를 영속한다.
 * 로컬 전용(syncRegistry 미등록) — 크로스기기 중복은 유계 허용(기기·일당 ≤ +1).
 */
export interface IReminderFireRepository {
  load(): Promise<ReminderFireData | null>;
  save(data: ReminderFireData): Promise<void>;
}
