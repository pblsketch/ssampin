import type { Board } from '../entities/Board';
import type { BoardId } from '../valueObjects/BoardId';

/**
 * 협업 보드 메타데이터 + Y.Doc 스냅샷 저장소.
 *
 * adapters 레이어의 FileBoardRepository가 구현.
 * Electron `userData/data/boards/` 하위에 파일 단위로 저장한다.
 */
export interface IBoardRepository {
  /** 저장된 보드 전체 (최신순 정렬 권장) */
  listAll(): Promise<Board[]>;
  /** 단일 보드 조회 */
  get(id: BoardId): Promise<Board | null>;
  /** 새 보드 생성 (id는 구현체가 부여) */
  create(input: { readonly name: string }): Promise<Board>;
  /** 이름 변경 */
  rename(id: BoardId, name: string): Promise<Board>;
  /** 보드 삭제 (세션 실행 중이면 거부) */
  delete(id: BoardId): Promise<void>;
  /** Y.Doc 바이너리 저장 (Y.encodeStateAsUpdate 결과) */
  saveSnapshot(id: BoardId, update: Uint8Array): Promise<void>;
  /** Y.Doc 바이너리 로드. 없으면 null */
  loadSnapshot(id: BoardId): Promise<Uint8Array | null>;
  /** 참여자 이름 히스토리 병합 저장 (canonical 기준 중복 제거는 구현체가) */
  appendParticipantHistory(id: BoardId, names: ReadonlyArray<string>): Promise<void>;
}
