/**
 * SessionedWebSocketServer — 공용 HTTP + WebSocket 서버 베이스.
 *
 * realtime-wall과 interactive-slides가 공유. 두 feature 모두:
 * - 메인 프로세스에서 http.Server + ws.WebSocketServer를 띄운다
 * - 학생 클라이언트가 HTTP로 SPA를 받고 WS로 메시지 송수신
 * - Zod 검증 → onClientMessage dispatch
 * - sliding-window rate limit (Per-key)
 * - 'closed' broadcast 후 cleanup
 *
 * 본 모듈은 위 공통 로직만 제공한다. HTTP 라우팅·도메인 로직·캐싱은
 * feature 모듈이 callback으로 주입한다.
 *
 * Plan §3 (재구조화 권장) + Design §5.3.1 베이스 추출 매핑.
 */

import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────

export interface SessionedWebSocketServerConfig<TClientMsg, TServerMsg> {
  /** 0이면 OS가 임의 포트 할당 */
  readonly port: number;
  /** WebSocket frame 최대 바이트 (realtime-wall: 20MB, interactive-slides: 2MB) */
  readonly maxPayloadBytes: number;
  /** 클라이언트 → 서버 메시지 Zod 스키마 (모든 외부 입력 신뢰 불가) */
  readonly clientMessageSchema: z.ZodType<TClientMsg>;
  /** 0.0.0.0(전체 NIC) 외 다른 host로 listen하고 싶을 때 */
  readonly host?: string;

  /**
   * HTTP 라우터. 반환 true면 응답 처리 완료, false면 base가 404로 응답.
   * 비동기 가능 (학생 PDF 같은 fs 접근).
   *
   * 미지정 시 모든 HTTP 요청은 404.
   */
  readonly handleHttpRequest?: (
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ) => boolean | Promise<boolean>;

  /**
   * 클라이언트 메시지 핸들러. base가 Zod 검증 통과 후 호출.
   * Rate limit·도메인 분기는 feature가 자체 처리.
   *
   * 본 콜백은 try/catch로 래핑되어 예외가 발생해도 다른 클라이언트에 전파되지 않는다.
   */
  readonly onClientMessage: (
    ws: WebSocket,
    msg: TClientMsg,
  ) => void | Promise<void>;

  readonly onClientConnect?: (ws: WebSocket) => void;
  readonly onClientDisconnect?: (ws: WebSocket) => void;

  /**
   * close() 시 모든 클라이언트에 broadcast할 메시지.
   * 미지정 시 `{ type: 'closed' }`.
   */
  readonly closedMessage?: TServerMsg;

  /** 디버그 로그 prefix (예: '[realtime-wall]', '[interactive-slides]') */
  readonly debugTag?: string;
}

// ─────────────────────────────────────────────────────────────
// Handle
// ─────────────────────────────────────────────────────────────

export interface SessionedWebSocketServerHandle<TServerMsg> {
  readonly httpServer: http.Server;
  readonly port: number;

  clientCount(): number;

  /**
   * 모든 OPEN 클라이언트에 송신.
   * 개별 client 실패는 swallow — 한 명 때문에 broadcast가 멈추지 않게.
   * sentAt(epoch ms) 자동 첨부.
   */
  broadcast(msg: TServerMsg): void;

  /** 단일 클라이언트 송신 (sentAt 자동 첨부) */
  sendTo(ws: WebSocket, msg: TServerMsg): void;

  /** 표준 에러 메시지 송신 (`{ type: 'error', message }`) */
  sendError(ws: WebSocket, message: string): void;

  /**
   * Sliding-window rate limit primitive.
   *
   * @param key sessionToken/role/타입 등을 조합한 고유 key
   * @param limit windowMs 동안 허용 횟수
   * @param now 현재 epoch ms (테스트용 주입 가능 — feature가 Date.now() 전달)
   * @param windowMs 윈도우 길이 (기본 60000)
   * @returns true면 차단, false면 통과
   */
  isRateLimited(
    key: string,
    limit: number,
    now: number,
    windowMs?: number,
  ): boolean;

  /** 다음 세션을 위해 rate-limit 버킷 초기화 */
  resetRateLimits(): void;

  /**
   * 서버 종료. 'closed' broadcast 후 모든 WS close + http.Server close + rate-limit reset.
   * 멱등 — 이미 닫혔으면 noop.
   */
  close(): Promise<void>;
}

// ─────────────────────────────────────────────────────────────
// 구현
// ─────────────────────────────────────────────────────────────

const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;

export function startSessionedWebSocketServer<TClientMsg, TServerMsg>(
  config: SessionedWebSocketServerConfig<TClientMsg, TServerMsg>,
): Promise<SessionedWebSocketServerHandle<TServerMsg>> {
  return new Promise((resolve, reject) => {
    const tag = config.debugTag ?? '[sessioned-ws]';
    const log = (msg: string, payload?: Record<string, unknown>): void => {
      try {
        if (payload) {
          // eslint-disable-next-line no-console
          console.log(`${tag} ${msg}`, payload);
        } else {
          // eslint-disable-next-line no-console
          console.log(`${tag} ${msg}`);
        }
      } catch {
        /* noop */
      }
    };

    const clients = new Set<WebSocket>();
    const rateLimitBuckets = new Map<string, number[]>();
    let closed = false;

    const httpServer = http.createServer((req, res) => {
      // base가 자체 처리할 default 라우트가 없으므로 모두 위임.
      // feature가 정상 라우팅했으면 true 반환 → 끝. 아니면 404.
      const tryHandle = config.handleHttpRequest?.(req, res);
      Promise.resolve(tryHandle).then(
        (handled) => {
          if (handled) return;
          if (!res.writableEnded) {
            res.writeHead(404);
            res.end('Not Found');
          }
        },
        (err) => {
          log('http-handler-error', { error: String(err) });
          if (!res.writableEnded) {
            res.writeHead(500);
            res.end('Internal Server Error');
          }
        },
      );
    });

    const wss = new WebSocketServer({
      server: httpServer,
      maxPayload: config.maxPayloadBytes,
    });

    wss.on('connection', (ws: WebSocket) => {
      if (closed) {
        try {
          ws.close();
        } catch {
          /* noop */
        }
        return;
      }
      clients.add(ws);
      try {
        config.onClientConnect?.(ws);
      } catch (err) {
        log('onClientConnect-error', { error: String(err) });
      }

      ws.on('message', async (data: Buffer | ArrayBuffer | Buffer[]) => {
        if (closed) return;
        let parsed: unknown;
        try {
          const raw = Buffer.isBuffer(data)
            ? data.toString('utf-8')
            : String(data);
          parsed = JSON.parse(raw);
        } catch {
          // 파싱 실패는 silent drop — 정상 클라이언트에서 발생 X
          return;
        }
        const result = config.clientMessageSchema.safeParse(parsed);
        if (!result.success) {
          sendErrorImpl(ws, '잘못된 요청입니다.');
          return;
        }
        try {
          await config.onClientMessage(ws, result.data);
        } catch (err) {
          log('onClientMessage-error', { error: String(err) });
        }
      });

      ws.on('close', () => {
        clients.delete(ws);
        try {
          config.onClientDisconnect?.(ws);
        } catch (err) {
          log('onClientDisconnect-error', { error: String(err) });
        }
      });

      ws.on('error', () => {
        // ws 라이브러리가 내부적으로 close를 트리거하므로 별도 처리 X.
        // 단지 상위로 throw되지 않게 catch만.
      });
    });

    function sendErrorImpl(ws: WebSocket, message: string): void {
      if (ws.readyState !== WebSocket.OPEN) return;
      try {
        ws.send(JSON.stringify({ type: 'error', message }));
      } catch {
        /* noop */
      }
    }

    function sendToImpl(ws: WebSocket, msg: TServerMsg): void {
      if (ws.readyState !== WebSocket.OPEN) return;
      try {
        ws.send(JSON.stringify({ ...msg, sentAt: Date.now() }));
      } catch {
        /* noop */
      }
    }

    function broadcastImpl(msg: TServerMsg): void {
      const payload = JSON.stringify({ ...msg, sentAt: Date.now() });
      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(payload);
          } catch {
            /* noop */
          }
        }
      }
    }

    function isRateLimitedImpl(
      key: string,
      limit: number,
      now: number,
      windowMs: number = DEFAULT_RATE_LIMIT_WINDOW_MS,
    ): boolean {
      const windowStart = now - windowMs;
      const existing = rateLimitBuckets.get(key) ?? [];
      const fresh = existing.filter((t) => t >= windowStart);
      if (fresh.length >= limit) {
        rateLimitBuckets.set(key, fresh);
        return true;
      }
      fresh.push(now);
      rateLimitBuckets.set(key, fresh);
      return false;
    }

    function closeImpl(): Promise<void> {
      if (closed) return Promise.resolve();
      closed = true;

      // 1) 'closed' broadcast (또는 closedMessage)
      const closedMsg = (config.closedMessage ?? { type: 'closed' }) as TServerMsg;
      const payload = JSON.stringify({ ...closedMsg, sentAt: Date.now() });
      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(payload);
          } catch {
            /* noop */
          }
          try {
            client.close();
          } catch {
            /* noop */
          }
        }
      }
      clients.clear();
      rateLimitBuckets.clear();

      // 2) 서버 close. wss.close → http.close → resolve.
      return new Promise<void>((resolveClose) => {
        wss.close(() => {
          httpServer.close(() => {
            resolveClose();
          });
        });
      });
    }

    httpServer.on('error', (err) => {
      if (!closed) {
        reject(err);
      }
    });

    httpServer.listen(config.port, config.host ?? '0.0.0.0', () => {
      const address = httpServer.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to get server address'));
        return;
      }
      const handle: SessionedWebSocketServerHandle<TServerMsg> = {
        httpServer,
        port: address.port,
        clientCount: () => clients.size,
        broadcast: broadcastImpl,
        sendTo: sendToImpl,
        sendError: sendErrorImpl,
        isRateLimited: isRateLimitedImpl,
        resetRateLimits: () => rateLimitBuckets.clear(),
        close: closeImpl,
      };
      resolve(handle);
    });
  });
}
