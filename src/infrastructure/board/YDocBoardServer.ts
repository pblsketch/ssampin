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
import { createRequire } from 'module';
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
 * y-websocket 2.x의 setupWSConnection 은 CJS export라 ESM에서 import 하면
 * ERR_PACKAGE_PATH_NOT_EXPORTED 발생 (spike s1 검증). createRequire 로 로드.
 */
const nodeRequire = createRequire(import.meta.url);
const ywsUtils = nodeRequire('y-websocket/bin/utils') as {
  setupWSConnection: (
    ws: WebSocket,
    req: http.IncomingMessage,
    opts?: { readonly docName?: string; readonly gc?: boolean },
  ) => void;
  docs: Map<string, {
    readonly awareness: {
      on: (ev: 'change', cb: () => void) => void;
      getStates: () => Map<number, unknown>;
    };
  }>;
};

export type HtmlProvider = (ctx: {
  readonly boardName: string;
  readonly authToken: BoardAuthToken;
  readonly sessionCode: BoardSessionCode;
}) => string;

interface RunningSession {
  readonly boardId: BoardId;
  readonly httpServer: http.Server;
  readonly wss: WebSocketServer;
  readonly ydoc: Y.Doc;
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
    const ydoc = new Y.Doc();
    if (opts.initialState) {
      Y.applyUpdate(ydoc, opts.initialState);
    }

    const roomName = String(opts.boardId);
    const participants = new Map<number, string>();

    const html = this.htmlProvider({
      boardName: roomName,
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

      if (!verifyJoinCredentials(providedToken, providedCode, { token: authToken, code: sessionCode })) {
        socket.write(
          `HTTP/1.1 ${WS_CLOSE_AUTH_FAILED} Policy Violation\r\n` +
          'Connection: close\r\nContent-Length: 0\r\n\r\n',
        );
        socket.destroy();
        return;
      }
      if (wss.clients.size >= MAX_PARTICIPANTS) {
        socket.write(
          `HTTP/1.1 ${WS_CLOSE_SERVER_FULL} Too Many\r\n` +
          'Connection: close\r\nContent-Length: 0\r\n\r\n',
        );
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    });

    wss.on('connection', (ws, req) => {
      ywsUtils.setupWSConnection(ws, req, { docName: roomName, gc: true });
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

    ydoc.on('update', () => {
      opts.onStateChange();
    });

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
      ydoc,
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
      encodeState: () => Y.encodeStateAsUpdate(ydoc),
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

    s.ydoc.destroy();
    this.session = null;
  }

  /** before-quit 동기 저장 경로 — Design §3.2-bis */
  encodeStateSync(boardId: BoardId): Uint8Array | null {
    if (!this.session || this.session.boardId !== boardId) return null;
    return Y.encodeStateAsUpdate(this.session.ydoc);
  }

  getActiveBoardId(): BoardId | null {
    return this.session?.boardId ?? null;
  }
}
