import type { BoardId } from '../valueObjects/BoardId';

/**
 * Board — 저장된 협업 보드 메타데이터
 *
 * 실제 드로잉 데이터(Y.Doc 바이너리)는 Repository 구현체가
 * 별도 `.ybin` 파일로 보관한다. 이 엔티티는 목록·이름·참여 이력 등
 * 메타정보만 담는다.
 */
export interface Board {
  readonly id: BoardId;
  readonly name: string;
  /** 생성 시각 (Unix ms) */
  readonly createdAt: number;
  /** 마지막 내용 변경 시각 (Unix ms) */
  readonly updatedAt: number;
  /** 마지막 세션 종료 시각. 한 번도 실행된 적 없으면 null */
  readonly lastSessionEndedAt: number | null;
  /**
   * 참여자 이름 히스토리 (canonical 형태로 중복 제거)
   * 교사 UI의 "이 보드를 썼던 학생들" 표시용.
   */
  readonly participantHistory: readonly string[];
  /** 저장된 Y.Doc 스냅샷 존재 여부 (Repository 구현이 채움) */
  readonly hasSnapshot: boolean;
}
