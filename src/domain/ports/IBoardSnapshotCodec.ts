import type { OpaqueBoardElement } from '../entities/UserTemplate';

/**
 * 보드 Y.Doc 스냅샷 ↔ Excalidraw 요소 배열 변환 포트 (PDCA-4 / G006)
 *
 * y-excalidraw 저장 형식(Y.Array<Y.Map{pos, el}>, ADR-012)을 아는 쪽은
 * infrastructure(boardSnapshotCodec)뿐이다. 도메인·유스케이스는 이 포트로
 * "스냅샷에서 요소 꺼내기"와 "요소로 새 스냅샷 만들기"만 다룬다.
 */
export interface IBoardSnapshotCodec {
  /**
   * 스냅샷에서 살아있는 요소만 추출 (isDeleted=true 제외).
   * 클라이언트 yjsToExcalidraw 와 동일하게 pos 정렬 순서를 보존한다.
   */
  extractElements(snapshot: Uint8Array): OpaqueBoardElement[];
  /**
   * 요소 배열을 새 Y.Doc 스냅샷으로 직렬화 — 보드 생성 시점 시딩용.
   * 요소는 verbatim 보존 (id 재생성 금지 — containerId/boundElements 참조 유지).
   */
  buildSnapshot(elements: ReadonlyArray<OpaqueBoardElement>): Uint8Array;
}
