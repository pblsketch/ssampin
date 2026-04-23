/**
 * IWallBoardRepository — 영속 담벼락(WallBoard) 저장소 포트
 *
 * adapters 레이어의 `JsonWallBoardRepository`가 구현.
 * Electron `userData/data/` 하위에 아래 파일 구조로 저장된다:
 *
 *   wall-boards-index.json    # 경량 WallBoardMeta 배열 (목록 화면용)
 *   wall-boards/{boardId}     # 각 보드 전체(posts 포함). IStoragePort가
 *                               파일명 규칙상 '/' 안전하게 저장한다.
 *
 * Design §3.1 / §3.2 — 영속화.
 */
import type {
  WallBoard,
  WallBoardId,
  WallBoardMeta,
} from '@domain/entities/RealtimeWall';

export interface IWallBoardRepository {
  /** 모든 보드의 경량 메타 배열 (목록 화면용) */
  listAllMeta(): Promise<readonly WallBoardMeta[]>;

  /** 단일 보드 전체 로드 (posts 포함) — 재열기용 */
  load(id: WallBoardId): Promise<WallBoard | null>;

  /**
   * shortCode로 보드 역조회 — 중복 검사 및 학생 접속 URL 해석에 사용.
   * 없으면 null.
   */
  getByShortCode(shortCode: string): Promise<WallBoard | null>;

  /**
   * 보드 저장 (전체 덮어쓰기). 저장 시:
   *   - `updatedAt`은 호출자가 설정 (규칙 함수가 갱신)
   *   - index.json의 해당 entry도 `toWallBoardMeta`로 재계산하여 동기화
   *   - posts 마이그레이션(likes → teacherHearts)은 load 시점에만 적용
   */
  save(board: WallBoard): Promise<void>;

  /** 삭제 — 파일 시스템에서 완전 제거 + index entry 제거 */
  delete(id: WallBoardId): Promise<void>;
}
