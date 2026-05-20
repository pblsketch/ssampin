import type { SeatingData } from '../entities/Seating';

/**
 * 자리배치 저장소.
 *
 * `seating`: 현재 표시되는 배치 (단일)
 * `preset`: 교사가 미리 설정한 "우연을 가장한 배치" (Phase 3b). 1회 사용 후 자동 소멸.
 */
export interface ISeatingRepository {
  getSeating(): Promise<SeatingData | null>;
  saveSeating(data: SeatingData): Promise<void>;

  /** 프리셋 조회 — 미설정 시 null */
  getPreset(): Promise<SeatingData | null>;
  /** 프리셋 저장 (덮어쓰기) */
  savePreset(data: SeatingData): Promise<void>;
  /** 프리셋 제거 (랜덤 셔플로 적용 후 자동 호출 또는 사용자 수동) */
  clearPreset(): Promise<void>;
}
