/**
 * YDocBoardServer — Y.js WebSocket 서버 구현 (IBoardServerPort)
 *
 * - Node `http.createServer` → 학생 HTML 서빙 (기존 쌤도구 패턴)
 * - 같은 포트에 WebSocket upgrade → `ws.WebSocketServer`
 * - URL 쿼리(`?t=<token>&code=<code>`) 인증 통과 시 `y-websocket` setupWSConnection 호출
 * - Design §3.1 step 5 `onStateChange`, `onParticipantsChange` 콜백 주입
 * - 25초 주기 heartbeat ping (Plan R3 / Design FR-11)
 * - Design §7.4 MAX_PARTICIPANTS 초과 시 close 1013
 */
import http from 'http';
import crypto from 'crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import * as Y from 'yjs';

import type {
  IBoardServerPort,
  BoardServerHandle,
  BoardServerStartOpts,
} from '@domain/ports/IBoardServerPort';
import type { BoardAuthToken } from '@domain/valueObjects/BoardAuthToken';
import type { BoardSessionCode } from '@domain/valueObjects/BoardSessionCode';
import type { BoardId } from '@domain/valueObjects/BoardId';
import { generateSessionCode } from '@domain/valueObjects/BoardSessionCode';
import {
  sanitizeParticipantName,
  verifyJoinCredentials,
} from '@domain/rules/boardRules';

import {
  HEARTBEAT_INTERVAL_MS,
  MAX_PARTICIPANTS,
  WS_CLOSE_AUTH_FAILED,
  WS_CLOSE_SERVER_FULL,
} from './constants';

/**
 * y-websocket 2.x의 `/bin/utils` 는 CJS export(`./bin/utils` → `./bin/utils.cjs`).
 * Electron main은 CJS로 번들되므로 ESM default import + esModuleInterop 경로로 접근.
 * spike s1에서는 createRequire(import.meta.url)를 썼지만 packaged 환경의
 * `import.meta.url` 비어있는 경고로 인해 default import로 전환.
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — y-websocket 패키지가 /bin/utils 타입을 제공하지 않음
import ywsDefault from 'y-websocket/bin/utils';

interface YwsSharedDoc extends Y.Doc {
  readonly awareness: {
    on: (ev: 'change', cb: () => void) => void;
    getStates: () => Map<number, unknown>;
  };
}

interface YwsUtilsShape {
  readonly setupWSConnection: (
    ws: WebSocket,
    req: http.IncomingMessage,
    opts?: { readonly docName?: string; readonly gc?: boolean },
  ) => void;
  readonly docs: Map<string, YwsSharedDoc>;
}

const ywsUtils = ywsDefault as unknown as YwsUtilsShape;

export type HtmlProvider = (ctx: {
  /** 서버 측 docName과 동기화용 (WebsocketProvider room name). `bd-xxx` 형태 */
  readonly boardId: BoardId;
  /** 학생 HTML 제목·입장 모달에 노출될 사용자-대면 이름 */
  readonly boardName: string;
  readonly authToken: BoardAuthToken;
  readonly sessionCode: BoardSessionCode;
}) => string;

interface RunningSession {
  readonly boardId: BoardId;
  readonly httpServer: http.Server;
  readonly wss: WebSocketServer;
  readonly authToken: BoardAuthToken;
  readonly sessionCode: BoardSessionCode;
  readonly roomName: string;
  readonly participants: Map<number, string>;
  heartbeatTimer: NodeJS.Timeout | null;
  awarenessPoll: NodeJS.Timeout | null;
}

export class YDocBoardServer implements IBoardServerPort {
  private session: RunningSession | null = null;

  constructor(private readonly htmlProvider: HtmlProvider) {}

  async start(opts: BoardServerStartOpts): Promise<BoardServerHandle> {
    if (this.session) {
      throw new Error('BOARD_SESSION_ALREADY_RUNNING');
    }

    const authToken = crypto.randomBytes(16).toString('hex') as BoardAuthToken;
    const sessionCode = generateSessionCode();

    const roomName = String(opts.boardId);
    const participants = new Map<number, string>();

    const html = this.htmlProvider({
      boardId: opts.boardId,
      boardName: opts.boardName,
      authToken,
      sessionCode,
    });

    const httpServer = http.createServer((req, res) => {
      if (!req.url) { res.writeHead(404).end(); return; }
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/' || url.pathname === '/board.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }
      if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          boardId: opts.boardId,
          participantCount: participants.size,
        }));
        return;
      }
      res.writeHead(404).end();
    });

    // OS에 포트 선택 위임 (기존 쌤도구 관습)
    await new Promise<void>((resolve, reject) => {
      httpServer.once('error', (err) => reject(err));
      httpServer.listen(0, '0.0.0.0', () => resolve());
    });
    const addr = httpServer.address();
    if (!addr || typeof addr === 'string') {
      httpServer.close();
      throw new Error('BOARD_SERVER_LISTEN_FAILED');
    }
    const localPort = addr.port;

    const wss = new WebSocketServer({ noServer: true });

    httpServer.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url ?? '/', `http://localhost:${localPort}`);
      const providedToken = url.searchParams.get('t') ?? '';
      const providedCode = url.searchParams.get('code') ?? '';

      const authOk = verifyJoinCredentials(providedToken, providedCode, {
        token: authToken,
        code: sessionCode,
      });

      if (!authOk) {
        // 진단 로그 — 디버깅 후 제거/downgrade 가능. 토큰 전체는 로그에 남기지 않는다.
        // eslint-disable-next-line no-console
        console.warn('[board] auth failed', {
          path: url.pathname,
          providedTokenLen: providedToken.length,
          providedTokenHead: providedToken.slice(0, 6),
          providedCode,
          expectedTokenHead: authToken.slice(0, 6),
          expectedCode: sessionCode,
        });
        // HTTP 상태 코드는 반드시 유효(100~599). WebSocket close code 1008을 그대로
        // 쓰면 프로토콜 위반 → cloudflared가 502로 변환할 수 있음.
        // handleUpgrade 후 ws.close(1008)로 클라이언트가 정확한 close code를 받게 한다.
        wss.handleUpgrade(req, socket, head, (ws) => {
          try {
            ws.close(WS_CLOSE_AUTH_FAILED, 'auth failed');
          } catch {
            /* noop */
          }
        });
        return;
      }

      if (wss.clients.size >= MAX_PARTICIPANTS) {
        wss.handleUpgrade(req, socket, head, (ws) => {
          try {
            ws.close(WS_CLOSE_SERVER_FULL, 'server full');
          } catch {
            /* noop */
          }
        });
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    });

    // iter #5 (R-7): y-websocket의 setupWSConnection은 내부 docs 맵에
    //   자체 Y.Doc(WSSharedDoc)을 생성한다. 외부에서 별도로 new Y.Doc()을
    //   만들어 update 리스너를 걸어도 **클라이언트 드로잉은 내부 문서에만**
    //   반영되어 dirty flag가 영원히 false, 자동 저장이 실질 동작하지 않았다.
    //   첫 연결 직후 실제 문서를 획득해 initialState 적용 + update 구독 수행.
    let initializedDoc = false;
    wss.on('connection', (ws, req) => {
      ywsUtils.setupWSConnection(ws, req, { docName: roomName, gc: true });
      if (initializedDoc) return;
      const doc = ywsUtils.docs.get(roomName);
      if (!doc) return;
      initializedDoc = true;
      if (opts.initialState) {
        try {
          Y.applyUpdate(doc, opts.initialState);
        } catch {
          /* applyUpdate 실패는 세션을 막지 않는다 (복원만 실패) */
        }
      }
      doc.on('update', () => {
        opts.onStateChange();
      });
    });

    // awareness 변경 감지 → participants 갱신 + onParticipantsChange
    const awarenessPoll = setInterval(() => {
      const doc = ywsUtils.docs.get(roomName);
      if (!doc) return;
      participants.clear();
      for (const [clientId, state] of doc.awareness.getStates().entries()) {
        const user = (state as { user?: { name?: string } }).user;
        const raw = typeof user?.name === 'string' ? user.name : '';
        const sanitized = sanitizeParticipantName(raw);
        if (sanitized !== null) {
          participants.set(clientId, sanitized);
        }
      }
      opts.onParticipantsChange([...participants.values()]);
    }, 1000);

    const heartbeatTimer = setInterval(() => {
      for (const ws of wss.clients) {
        if (ws.readyState === ws.OPEN) {
          ws.ping();
        }
      }
    }, HEARTBEAT_INTERVAL_MS);

    this.session = {
      boardId: opts.boardId,
      httpServer,
      wss,
      authToken,
      sessionCode,
      roomName,
      participants,
      heartbeatTimer,
      awarenessPoll,
    };

    return {
      boardId: opts.boardId,
      localPort,
      authToken,
      sessionCode,
      participantCount: () => participants.size,
      getParticipantNames: () => [...participants.values()],
      encodeState: () => {
        // 실제 y-websocket 내부 문서에서 추출. 미접속(첫 학생 오기 전 종료)
        // 상태라면 빈 배열 반환 → 이전 스냅샷이 그대로 보존됨.
        const doc = ywsUtils.docs.get(roomName);
        return doc ? Y.encodeStateAsUpdate(doc) : new Uint8Array();
      },
    };
  }

  async stop(boardId: BoardId): Promise<void> {
    const s = this.session;
    if (!s || s.boardId !== boardId) return;

    if (s.heartbeatTimer) clearInterval(s.heartbeatTimer);
    if (s.awarenessPoll) clearInterval(s.awarenessPoll);

    for (const ws of s.wss.clients) {
      try { ws.close(); } catch { /* noop */ }
    }
    await new Promise<void>((resolve) => s.wss.close(() => resolve()));
    await new Promise<void>((resolve) => s.httpServer.close(() => resolve()));

    // y-websocket 내부 docs 정리 (GC 의존이지만 명시적으로 제거)
    const doc = ywsUtils.docs.get(s.roomName);
    if (doc) {
      try { doc.destroy(); } catch { /* noop */ }
      ywsUtils.docs.delete(s.roomName);
    }
    this.session = null;
  }

  /** before-quit 동기 저장 경로 — Design §3.2-bis */
  encodeStateSync(boardId: BoardId): Uint8Array | null {
    if (!this.session || this.session.boardId !== boardId) return null;
    const doc = ywsUtils.docs.get(this.session.roomName);
    return doc ? Y.encodeStateAsUpdate(doc) : null;
  }

  getActiveBoardId(): BoardId | null {
    return this.session?.boardId ?? null;
  }
}
