/**
 * StartBoardSession — 협업 보드 세션 기동 유스케이스
 *
 * Design §3.1. 절차:
 *   1. 터널 점유 충돌 감지 → TunnelBusyError
 *   2. loadSnapshot (이전 세션 Y.Doc 복원)
 *   3. IBoardServerPort.start (ws 서버 + http html 서빙 + 인증 필터 + heartbeat)
 *   4. IBoardTunnelPort.acquire (cloudflared 터널)
 *   5. tunnel onExit 구독 (cloudflared 비정상 종료 감지)
 *   6. 30초 주기 자동 저장 타이머 (dirty flag 기반)
 *   7. QR 생성 후 결과 반환
 *
 * 실패 시 역순 롤백 (보드 서버 → 터널 포함).
 */
import qrcode from 'qrcode';

import type { BoardId } from '@domain/valueObjects/BoardId';
import type { BoardAuthToken } from '@domain/valueObjects/BoardAuthToken';
import type { BoardSessionCode } from '@domain/valueObjects/BoardSessionCode';
import type { IBoardRepository } from '@domain/repositories/IBoardRepository';
import type {
  IBoardServerPort,
  BoardServerHandle,
} from '@domain/ports/IBoardServerPort';
import type { IBoardTunnelPort } from '@domain/ports/IBoardTunnelPort';

/** Design §4.2 BoardSessionStartResult */
export interface BoardSessionStartResult {
  readonly boardId: BoardId;
  readonly publicUrl: string;
  readonly sessionCode: BoardSessionCode;
  readonly authToken: BoardAuthToken;
  readonly qrDataUrl: string;
  readonly startedAt: number;
}

/**
 * 기동 중인 세션의 내부 런타임 상태. IPC 이벤트 emit 측에서 참조하기 위해
 * 유스케이스 외부로 노출 (infrastructure가 핸들을 보관하도록 할 수도 있으나,
 * Design §4.4 `registerBoardHandlers`에서 여러 메서드가 공유해야 하므로
 * 유스케이스 차원에서 맵 관리).
 */
export interface ActiveBoardSessionRuntime {
  result: BoardSessionStartResult;
  handle: BoardServerHandle;
  /** onStateChange 콜백에서 true로 flip. 자동 저장 타이머가 저장 후 false로. */
  dirty: boolean;
  autoSaveTimer: NodeJS.Timeout | null;
  unsubscribeTunnelExit: (() => void) | null;
}

/** 세션 이벤트 리스너 — electron/ipc/board.ts에서 주입 */
export interface StartBoardSessionListeners {
  readonly onParticipantsChange: (boardId: BoardId, names: ReadonlyArray<string>) => void;
  readonly onAutoSave: (boardId: BoardId, savedAt: number) => void;
  readonly onSessionError: (boardId: BoardId, reason: string) => void;
}

export class StartBoardSession {
  constructor(
    private readonly repo: IBoardRepository,
    private readonly serverPort: IBoardServerPort,
    private readonly tunnelPort: IBoardTunnelPort,
    private readonly autoSaveIntervalMs: number,
  ) {}

  async execute(
    boardId: BoardId,
    listeners: StartBoardSessionListeners,
  ): Promise<{ result: BoardSessionStartResult; runtime: ActiveBoardSessionRuntime }> {
    // 1. 터널 점유 충돌 감지
    if (this.tunnelPort.isBusy()) {
      const current = this.tunnelPort.getCurrent();
      if (!current || current.owner !== 'board' || current.localPort !== 0) {
        // owner='board' 재진입 idempotent 허용이지만, 여기서는 newSession이므로 거부
        throw new Error('BOARD_TUNNEL_BUSY');
      }
    }

    // 2. 보드 메타·스냅샷 로드
    const board = await this.repo.get(boardId);
    if (!board) {
      throw new Error('BOARD_NOT_FOUND');
    }
    const initialState = await this.repo.loadSnapshot(boardId);

    // 3. Y.js 서버 기동 — dirty flag는 runtime에 후속 할당
    const runtime: ActiveBoardSessionRuntime = {
      // 아래 값들은 4·5·6 단계에서 채움
      result: null as unknown as BoardSessionStartResult,
      handle: null as unknown as BoardServerHandle,
      dirty: false,
      autoSaveTimer: null,
      unsubscribeTunnelExit: null,
    };

    let handle: BoardServerHandle;
    try {
      handle = await this.serverPort.start({
        boardId,
        boardName: board.name, // B-1 fix: Design §2.1 사용자-대면 이름 전달
        initialState,
        onStateChange: () => {
          runtime.dirty = true;
        },
        onParticipantsChange: (names) => {
          listeners.onParticipantsChange(boardId, names);
        },
      });
    } catch (err) {
      throw normalizeError(err, 'BOARD_SERVER_LISTEN_FAILED');
    }

    // 4. 터널 획득 — 실패 시 서버 정리
    let publicUrl: string;
    try {
      publicUrl = await this.tunnelPort.acquire('board', handle.localPort);
    } catch (err) {
      await this.serverPort.stop(boardId);
      throw err;
    }

    // 5. 터널 exit 구독 → 세션 stopping 통지
    runtime.unsubscribeTunnelExit = this.tunnelPort.onExit((reason) => {
      listeners.onSessionError(boardId, `BOARD_TUNNEL_EXIT:${reason}`);
    });

    // 6. QR 생성
    let qrDataUrl: string;
    try {
      qrDataUrl = await qrcode.toDataURL(
        `${publicUrl}?t=${handle.authToken}&code=${handle.sessionCode}`,
        { errorCorrectionLevel: 'M', margin: 2, width: 320 },
      );
    } catch (err) {
      runtime.unsubscribeTunnelExit?.();
      this.tunnelPort.release('board');
      await this.serverPort.stop(boardId);
      throw normalizeError(err, 'BOARD_QR_FAILED');
    }

    const result: BoardSessionStartResult = {
      boardId,
      publicUrl,
      sessionCode: handle.sessionCode,
      authToken: handle.authToken,
      qrDataUrl,
      startedAt: Date.now(),
    };
    runtime.result = result;
    runtime.handle = handle;

    // 7. 자동 저장 타이머 — dirty일 때만 저장, 저장 중 발생한 변경은 localDirty로 보존
    runtime.autoSaveTimer = setInterval(() => {
      if (!runtime.dirty) return;
      runtime.dirty = false; // 캡처 후 flip (저장 중 변경은 다시 true 됨)
      const update = handle.encodeState();
      this.repo
        .saveSnapshot(boardId, update)
        .then(() => listeners.onAutoSave(boardId, Date.now()))
        .catch((err) => {
          runtime.dirty = true; // 실패 시 복구
          listeners.onSessionError(boardId, `BOARD_PERSISTENCE_FAILED:${String(err)}`);
        });
    }, this.autoSaveIntervalMs);

    return { result, runtime };
  }
}

function normalizeError(err: unknown, fallbackCode: string): Error {
  if (err instanceof Error) {
    // 인프라가 명시적 코드로 던진 경우 그대로
    if (err.message === 'BOARD_SESSION_ALREADY_RUNNING' || err.message === 'BOARD_SERVER_LISTEN_FAILED') {
      return err;
    }
    return new Error(`${fallbackCode}:${err.message}`);
  }
  return new Error(fallbackCode);
}
