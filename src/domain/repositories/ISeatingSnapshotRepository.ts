import type { SeatingSnapshot } from '../entities/SeatingSnapshot';

/**
 * 자리배치 스냅샷 저장소 인터페이스.
 *
 * 구현체는 `JsonSeatingSnapshotRepository` (adapters 레이어).
 * 스토리지 키: 'seating-snapshots'. 최대 50개 보관, 초과 시 가장 오래된 것 자동 삭제.
 */
export interface ISeatingSnapshotRepository {
  /** 최신순(timestamp DESC) 정렬된 전체 목록을 반환한다. 미존재 시 빈 배열. */
  getSnapshots(): Promise<readonly SeatingSnapshot[]>;

  /**
   * 스냅샷 추가 저장.
   * 저장 후 전체 개수가 50개를 초과하면 가장 오래된 항목들을 자동 삭제한다.
   */
  saveSnapshot(snapshot: SeatingSnapshot): Promise<void>;

  /** 지정 ID 스냅샷 삭제. 미존재 ID는 no-op. */
  deleteSnapshot(id: string): Promise<void>;

  /** 전체 스냅샷 비우기 (설정 → 데이터 초기화 시 사용). */
  clearAll(): Promise<void>;
}
