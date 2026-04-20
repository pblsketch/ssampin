import type { BoardId } from '../valueObjects/BoardId';
import type { BoardAuthToken } from '../valueObjects/BoardAuthToken';
import type { BoardSessionCode } from '../valueObjects/BoardSessionCode';

/**
 * YDocBoardServer (infrastructure 레이어)가 반환하는 런타임 핸들.
 * domain은 Y.js 타입을 모르므로 Uint8Array·함수 래핑만 노출한다.
 */
export interface BoardServerHandle {
  readonly boardId: BoardId;
  readonly localPort: number;
  readonly authToken: BoardAuthToken;
  readonly sessionCode: BoardSessionCode;
  /** 현재 접속 학생 수 */
  readonly participantCount: () => number;
  /** 현재 접속 학생 이름 목록 (참여 시점 순) */
  readonly getParticipantNames: () => string[];
  /**
   * Y.Doc 현재 상태를 바이너리로 직렬화 (자동 저장용).
   * 반환값은 `IBoardRepository.saveSnapshot`에 그대로 전달 가능.
   */
  readonly encodeState: () => Uint8Array;
}

export interface BoardServerStartOpts {
  readonly boardId: BoardId;
  /**
   * 학생 HTML 제목과 입장 모달에 노출될 사용자-대면 보드 이름.
   * (boardId는 `bd-xxx` 형태이므로 학생에게 직접 노출하면 안 됨 — Design §2.1)
   */
  readonly boardName: string;
  /** 이전 세션 Y.Doc 바이너리 (없으면 null → 빈 문서로 시작) */
  readonly initialState: Uint8Array | null;
  /**
   * Y.Doc 변경 감지 콜백 (auto-save dirty flag 트리거).
   * 드로잉이 들어올 때마다 호출되므로 StartBoardSession은
   * 내부에서 dirty = true 처리만 한다.
   */
  readonly onStateChange: () => void;
  /**
   * 참여자 변동 콜백 (UI 갱신용).
   * awareness change를 sanitized 이름 배열로 정규화해 전달한다.
   */
  readonly onParticipantsChange: (names: ReadonlyArray<string>) => void;
}

/**
 * Y.js WebSocket 서버 추상화.
 *
 * 구현체(`YDocBoardServer`)는 `ws` + `y-websocket/bin/utils.setupWSConnection`을
 * 사용하며, 내부적으로 25초 주기 heartbeat ping을 돌려 cloudflared idle 드롭을 방어한다.
 */
export interface IBoardServerPort {
  start(opts: BoardServerStartOpts): Promise<BoardServerHandle>;
  stop(boardId: BoardId): Promise<void>;
}
