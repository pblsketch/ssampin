/**
 * 학생 SPA WS 클라이언트.
 *
 * - 자동 재연결 (지수 백오프, 최대 60초)
 * - sessionStorage에 studentToken 보관 → 재접속 시 rejoin
 * - 메시지 송수신은 PROTOCOL_VERSION 동일 (메타테스트 MT-3 대상)
 *
 * Plan §3 + Design §6 매핑.
 */

import {
  PROTOCOL_VERSION,
  type ClientToServerMsg,
} from '@shared/wsProtocol/interactiveSlides';

// 메인 프로세스가 보낸 메시지 — Server → Student. JSON 구조만 alias.
export type StudentReceivedMessage =
  | {
      type: 'session-joined';
      studentToken: string;
      sessionStatus: 'lobby' | 'active' | 'archived';
      currentSlideIndex: number;
    }
  | {
      type: 'late-join-state';
      state: {
        slideIndex: number;
        activeOverlays: { id: string; activatedAt: number; deadline?: number }[];
        closedOverlays: { id: string; closedAt: number; results: unknown }[];
        studentList: { totalOnline: number };
        myResponses: { overlayId: string; submittedAt: number }[];
      };
    }
  | {
      type: 'slide-changed';
      slideIndex: number;
      slide: {
        id: string;
        pageNumber: number;
        imagePath: string; // /slide-image/... HTTP 경로
        overlays: unknown[];
      };
    }
  | {
      type: 'overlay-activated';
      overlayId: string;
      config: unknown;
      position: { xPercent: number; yPercent: number; widthPercent: number; heightPercent: number };
      activatedAt: number;
    }
  | { type: 'overlay-deactivated'; overlayId: string; results: unknown }
  | { type: 'lesson-ended'; reason?: string }
  | { type: 'teacher-disconnected'; gracePeriodMs: number }
  | { type: 'teacher-reconnected' }
  | { type: 'overlay-deadline'; overlayId: string; deadline: number }
  | { type: 'error'; code?: string; message: string }
  | {
      type: 'response-accepted';
      overlayId: string;
      status: 'recorded' | 'late' | 'rejected';
    };

const TOKEN_STORAGE_KEY = 'ssampin.slides.studentToken';
const RECONNECT_INITIAL_MS = 1000;
const RECONNECT_MAX_MS = 60_000;

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'closed';

export interface SlidesStudentWsHandlers {
  readonly onMessage: (msg: StudentReceivedMessage) => void;
  readonly onConnectionStateChange: (state: ConnectionState) => void;
}

export interface JoinOptions {
  readonly sessionCode: string;
  readonly studentName: string;
  /** 강제로 새 학생으로 시작 (이름 변경 등) */
  readonly forceNewIdentity?: boolean;
}

export class SlidesStudentWsClient {
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'idle';
  private reconnectDelay = RECONNECT_INITIAL_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastJoin: JoinOptions | null = null;
  private explicitClose = false;

  constructor(
    private readonly url: string,
    private readonly handlers: SlidesStudentWsHandlers,
  ) {}

  // ─────────────────────────────────────────────────────────────
  join(options: JoinOptions): void {
    this.lastJoin = options;
    this.explicitClose = false;
    this.connect();
  }

  send(msg: ClientToServerMsg): boolean {
    if (this.ws == null || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify({ ...msg, _v: PROTOCOL_VERSION }));
      return true;
    } catch {
      return false;
    }
  }

  close(): void {
    this.explicitClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* noop */
      }
      this.ws = null;
    }
    this.setState('closed');
  }

  /** sessionStorage에서 token 강제 삭제 (이름 변경 등) */
  clearStoredToken(): void {
    try {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      /* noop */
    }
  }

  // ─────────────────────────────────────────────────────────────
  private connect(): void {
    if (!this.lastJoin) return;
    this.setState(this.state === 'idle' ? 'connecting' : 'reconnecting');
    try {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.addEventListener('open', () => this.handleOpen());
      ws.addEventListener('message', (e) =>
        this.handleMessage(typeof e.data === 'string' ? e.data : ''),
      );
      ws.addEventListener('close', () => this.handleClose());
      ws.addEventListener('error', () => {
        // close가 따라옴 — 별도 처리 X
      });
    } catch {
      this.scheduleReconnect();
    }
  }

  private handleOpen(): void {
    this.setState('open');
    this.reconnectDelay = RECONNECT_INITIAL_MS;
    if (!this.lastJoin) return;
    const previousToken = this.lastJoin.forceNewIdentity ? null : this.readStoredToken();
    const joinMsg: ClientToServerMsg = {
      type: 'join-session',
      sessionCode: this.lastJoin.sessionCode,
      studentName: this.lastJoin.studentName,
      ...(previousToken ? { rejoin: { previousToken } } : {}),
    };
    this.send(joinMsg);
  }

  private handleMessage(raw: string): void {
    if (!raw) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== 'object') return;
    const msg = parsed as StudentReceivedMessage;
    if (msg.type === 'session-joined') {
      this.storeToken(msg.studentToken);
    }
    this.handlers.onMessage(msg);
  }

  private handleClose(): void {
    this.ws = null;
    if (this.explicitClose) return;
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    this.setState('reconnecting');
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = this.reconnectDelay;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
  }

  private setState(state: ConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    this.handlers.onConnectionStateChange(state);
  }

  private storeToken(token: string): void {
    try {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    } catch {
      /* noop */
    }
  }

  private readStoredToken(): string | null {
    try {
      return sessionStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  }
}

/**
 * 현재 페이지의 location 기반 WS URL.
 * - HTTP 페이지 → ws://
 * - HTTPS 페이지 (Cloudflared 터널) → wss://
 */
export function inferWsUrl(): string {
  if (typeof window === 'undefined') return '';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}`;
}
