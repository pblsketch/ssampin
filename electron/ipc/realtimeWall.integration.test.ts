/**
 * realtimeWall 통합 테스트 — Design §10.2 시나리오 1~6
 *
 * 절충 사항 (Design §10.2 주석):
 * `registerRealtimeWallHandlers`는 Electron `ipcMain` / `BrowserWindow`에
 * 강하게 결합되어 있어 단위 테스트 환경에서 직접 호출하면 모킹 복잡도가 높아진다.
 * 따라서 이 파일은 **WebSocket 서버 내부 동작만** in-process로 검증한다:
 *   - 실제 `ws` 패키지의 WebSocketServer를 in-process로 생성
 *   - `buildWallStateForStudents` 순수 함수를 통한 hidden 필터 검증
 *   - `broadcastToStudents` 패턴을 직접 구현하여 latency 측정
 *   - P2 시나리오 4~6: 학생 좋아요 동기화 / rate limit / unlike 토글
 *
 * ipcMain 등록 / BrowserWindow.send('connection-count') 경로는
 * 별도 매뉴얼 QA (앱 실행 후 UI 확인)로 위임한다.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

// buildWallStateForStudents는 순수 함수 — electron/ 에서 src/ 직접 import는
// tsconfig 경로 alias 미적용 환경이므로 상대 경로로 참조한다.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// src/usecases/realtimeWall/BroadcastWallState를 상대 경로로 로드
// vitest는 ts를 직접 처리하므로 .ts 확장자 명시
const { buildWallStateForStudents } = await import(
  path.resolve(__dirname, '../../src/usecases/realtimeWall/BroadcastWallState.ts')
);

// P2 도메인 규칙 — 상대 경로로 로드 (경로 alias 미적용 환경)
const { toggleStudentLike } = await import(
  path.resolve(__dirname, '../../src/domain/rules/realtimeWallRules.ts')
);

// ---------------------------------------------------------------------------
// 헬퍼: in-process WebSocket 서버 생성 + 간단한 join/broadcast 핸들러
// ---------------------------------------------------------------------------

interface WallSession {
  server: http.Server;
  wss: WebSocketServer;
  clients: Set<WebSocket>;
  lastWallState: Record<string, unknown> | null;
}

function createTestServer(): Promise<{ session: WallSession; port: number }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    const wss = new WebSocketServer({ server });

    const session: WallSession = {
      server,
      wss,
      clients: new Set(),
      lastWallState: null,
    };

    wss.on('connection', (ws: WebSocket) => {
      session.clients.add(ws);

      ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
        let parsed: unknown;
        try {
          const raw = Buffer.isBuffer(data) ? data.toString('utf-8') : String(data);
          parsed = JSON.parse(raw);
        } catch {
          return;
        }
        if (typeof parsed !== 'object' || parsed === null) return;
        const msg = parsed as Record<string, unknown>;

        if (msg['type'] === 'join') {
          // 'wall' legacy + cached wall-state 송신
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'wall', title: '테스트 담벼락', maxTextLength: 200 }));
            if (session.lastWallState) {
              ws.send(JSON.stringify({ ...session.lastWallState, sentAt: Date.now() }));
            }
          }
        }
      });

      ws.on('close', () => {
        session.clients.delete(ws);
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('서버 주소 획득 실패'));
        return;
      }
      resolve({ session, port: addr.port });
    });
  });
}

function broadcastToClients(
  session: WallSession,
  msg: Record<string, unknown>,
): void {
  if (msg['type'] === 'wall-state') {
    session.lastWallState = msg;
  }
  const payload = JSON.stringify({ ...msg, sentAt: Date.now() });
  for (const client of session.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
      } catch {
        // 개별 실패는 무시
      }
    }
  }
}

function connectClient(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function waitForMessage(
  ws: WebSocket,
  predicate: (msg: Record<string, unknown>) => boolean,
  timeoutMs = 2000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`메시지 대기 timeout (${timeoutMs}ms)`));
    }, timeoutMs);

    const handler = (data: unknown) => {
      try {
        const raw = typeof data === 'string' ? data : String(data);
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (predicate(parsed)) {
          clearTimeout(timer);
          ws.off('message', handler);
          resolve(parsed);
        }
      } catch {
        // 파싱 실패는 무시하고 계속 대기
      }
    };
    ws.on('message', handler);
  });
}

// ---------------------------------------------------------------------------
// 테스트 픽스처
// ---------------------------------------------------------------------------

let session: WallSession;
let port: number;

beforeEach(async () => {
  ({ session, port } = await createTestServer());
});

afterEach(() => {
  return new Promise<void>((resolve) => {
    for (const client of session.clients) {
      try {
        client.terminate();
      } catch {
        // noop
      }
    }
    session.wss.close(() => {
      session.server.close(() => resolve());
    });
  });
});

// ---------------------------------------------------------------------------
// 시나리오 1: 학생 3명 join → 각자 'wall-state' 1회 수신
// ---------------------------------------------------------------------------

describe('시나리오 1: 학생 3명 join → wall-state 수신', () => {
  it('join 이전에 broadcast된 wall-state를 신규 클라이언트가 즉시 수신한다', async () => {
    // 사전 준비: 교사가 wall-state를 미리 broadcast (lastWallState 캐시 채우기)
    const wallState = buildWallStateForStudents({
      title: '테스트 담벼락',
      layoutMode: 'freeform',
      columns: [],
      posts: [
        { id: 'p1', columnId: 'c1', nickname: '학생1', text: '안녕하세요', status: 'approved',
          teacherHearts: 0, createdAt: Date.now(), updatedAt: Date.now() },
      ],
    });
    broadcastToClients(session, { type: 'wall-state', board: wallState });

    // 클라이언트 3개: connect → 핸들러 등록 → join 순서로 진행해야 메시지를 놓치지 않음
    const clients: WebSocket[] = [];
    const wallStateReceivedCounts: number[] = [];

    for (let i = 0; i < 3; i++) {
      const ws = await connectClient(port);
      clients.push(ws);
      wallStateReceivedCounts.push(0);

      const idx = i;
      // 메시지 핸들러를 join 전에 등록
      ws.on('message', (data: unknown) => {
        try {
          const raw = typeof data === 'string' ? data : data instanceof Buffer ? data.toString('utf-8') : String(data);
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          if (parsed['type'] === 'wall-state') {
            wallStateReceivedCounts[idx]++;
          }
        } catch {
          // noop
        }
      });

      // join 메시지 송신 (핸들러 등록 후)
      ws.send(JSON.stringify({ type: 'join', sessionToken: `token-${i}` }));
    }

    // 각 클라이언트가 wall-state를 수신할 때까지 대기 (최대 2초)
    // waitForMessage는 join 이전에 등록해야 놓치지 않으므로 polling 방식으로 전환
    await new Promise<void>((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        if (wallStateReceivedCounts.every((c) => c >= 1)) {
          resolve();
          return;
        }
        if (Date.now() - start > 2000) {
          reject(new Error(`wall-state 수신 timeout. counts: ${JSON.stringify(wallStateReceivedCounts)}`));
          return;
        }
        setTimeout(check, 20);
      };
      check();
    });

    // 각 클라이언트가 1회씩만 수신했는지 확인 (약간의 딜레이 후)
    await new Promise((r) => setTimeout(r, 100));
    for (let i = 0; i < 3; i++) {
      expect(wallStateReceivedCounts[i]).toBe(1);
    }

    for (const ws of clients) ws.terminate();
  });
});

// ---------------------------------------------------------------------------
// 시나리오 2: broadcast → 모든 클라이언트가 latency < 100ms 내 수신
// ---------------------------------------------------------------------------

describe('시나리오 2: broadcast latency < 100ms', () => {
  it('교사가 wall-state broadcast 후 3 클라이언트 모두 100ms 이내 수신한다', async () => {
    // 클라이언트 3개 연결 + join
    const clients: WebSocket[] = [];
    for (let i = 0; i < 3; i++) {
      const ws = await connectClient(port);
      clients.push(ws);
      ws.send(JSON.stringify({ type: 'join', sessionToken: `token-${i}` }));
    }

    // 클라이언트들이 연결 완료될 때까지 짧게 대기
    await new Promise((r) => setTimeout(r, 50));

    // broadcast 시점 기록
    const broadcastAt = Date.now();

    const wallState = buildWallStateForStudents({
      title: '지연 테스트',
      layoutMode: 'column',
      columns: [{ id: 'c1', title: '칼럼1', color: 'blue' }],
      posts: [],
    });

    // 모든 클라이언트가 수신할 promise를 먼저 등록한 뒤 broadcast
    const receivePromises = clients.map((ws) =>
      waitForMessage(ws, (m) => m['type'] === 'wall-state', 2000),
    );

    broadcastToClients(session, { type: 'wall-state', board: wallState });

    const receivedAt = await Promise.all(receivePromises.map((p) => p.then(() => Date.now())));

    for (const t of receivedAt) {
      const latency = t - broadcastAt;
      expect(latency).toBeLessThan(100);
    }

    for (const ws of clients) ws.terminate();
  });
});

// ---------------------------------------------------------------------------
// 시나리오 3: hidden post → 학생 board.posts에서 제거됨
// ---------------------------------------------------------------------------

describe('시나리오 3: hidden post는 학생 board에 포함되지 않는다', () => {
  it('buildWallStateForStudents가 hidden/pending 카드를 board.posts에서 제외한다', () => {
    const now = Date.now();
    const posts = [
      { id: 'p-approved', columnId: 'c1', nickname: '학생A', text: '공개 글',
        status: 'approved' as const, teacherHearts: 0, createdAt: now, updatedAt: now },
      { id: 'p-hidden',   columnId: 'c1', nickname: '학생B', text: '숨긴 글',
        status: 'hidden' as const,   teacherHearts: 0, createdAt: now, updatedAt: now },
      { id: 'p-pending',  columnId: 'c1', nickname: '학생C', text: '대기 글',
        status: 'pending' as const,  teacherHearts: 0, createdAt: now, updatedAt: now },
    ];

    const snapshot = buildWallStateForStudents({
      title: 'hidden 필터 테스트',
      layoutMode: 'freeform',
      columns: [],
      posts,
    });

    // 학생 뷰에는 approved 카드만 존재
    expect(snapshot.posts).toHaveLength(1);
    expect(snapshot.posts[0].id).toBe('p-approved');

    // hidden/pending이 섞인 경우 WebSocket으로 broadcast해도 결과 동일
    const postIds = snapshot.posts.map((p: { id: string }) => p.id);
    expect(postIds).not.toContain('p-hidden');
    expect(postIds).not.toContain('p-pending');
  });

  it('wall-state broadcast 후 클라이언트가 hidden 카드 없는 board를 수신한다', async () => {
    const ws = await connectClient(port);
    ws.send(JSON.stringify({ type: 'join', sessionToken: 'token-hidden-test' }));

    // 연결 대기
    await new Promise((r) => setTimeout(r, 30));

    const now = Date.now();
    const wallState = buildWallStateForStudents({
      title: 'hidden 네트워크 테스트',
      layoutMode: 'freeform',
      columns: [],
      posts: [
        { id: 'visible', columnId: 'c1', nickname: '공개', text: '보여요',
          status: 'approved' as const, teacherHearts: 0, createdAt: now, updatedAt: now },
        { id: 'invisible', columnId: 'c1', nickname: '숨겨', text: '안 보여요',
          status: 'hidden' as const,   teacherHearts: 0, createdAt: now, updatedAt: now },
      ],
    });

    const receivePromise = waitForMessage(ws, (m) => m['type'] === 'wall-state');
    broadcastToClients(session, { type: 'wall-state', board: wallState });

    const received = await receivePromise;
    const board = received['board'] as { posts: Array<{ id: string }> };

    expect(board).toBeDefined();
    expect(board.posts).toHaveLength(1);
    expect(board.posts[0].id).toBe('visible');
    expect(board.posts.map((p) => p.id)).not.toContain('invisible');

    ws.terminate();
  });
});

// ---------------------------------------------------------------------------
// P2 시나리오 4~6: 학생 좋아요 동기화, rate limit, unlike 토글
//
// 이 시나리오들은 **P2 like 처리 로직이 내장된 확장 테스트 서버**를 사용한다.
// 실제 realtimeWall.ts의 registerRealtimeWallHandlers는 ipcMain에 의존하므로
// 직접 호출할 수 없다. 대신 동일한 도메인 규칙(toggleStudentLike) + rate limit
// 로직을 in-process 서버에 내장하여 §10.2 시나리오 동등 검증을 수행한다.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// P2 확장 헬퍼: rate limit 포함 테스트 서버
// ---------------------------------------------------------------------------

/** 간소화된 RealtimeWallPost (P2 like 필드 포함) */
interface TestPost {
  id: string;
  likes: number;
  likedBy: readonly string[];
  status: 'approved' | 'hidden' | 'pending';
  teacherHearts: number;
  nickname: string;
  text: string;
  createdAt: number;
  updatedAt: number;
  columnId: string;
  kanban: { columnId: string; order: number };
  freeform: { x: number; y: number; w: number; h: number; zIndex: number };
}

interface P2WallSession {
  server: http.Server;
  wss: WebSocketServer;
  clients: Set<WebSocket>;
  postsCache: Map<string, TestPost>;
  /** rate limit 버킷: `sessionToken:type` → timestamp[] */
  rateBuckets: Map<string, number[]>;
}

const RATE_LIMIT_MS = 60_000;
const RATE_LIKE_LIMIT = 30;

function isRateLimitedLocal(
  buckets: Map<string, number[]>,
  sessionToken: string,
  type: string,
  limit: number,
  now: number,
): boolean {
  const key = `${sessionToken}:${type}`;
  const windowStart = now - RATE_LIMIT_MS;
  const existing = buckets.get(key) ?? [];
  const fresh = existing.filter((t) => t >= windowStart);
  if (fresh.length >= limit) {
    buckets.set(key, fresh);
    return true;
  }
  fresh.push(now);
  buckets.set(key, fresh);
  return false;
}

function broadcastP2(session: P2WallSession, msg: Record<string, unknown>): void {
  const payload = JSON.stringify({ ...msg, sentAt: Date.now() });
  for (const client of session.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
      } catch {
        // noop
      }
    }
  }
}

function createP2TestServer(
  initialPosts: TestPost[],
): Promise<{ session: P2WallSession; port: number }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    const wss = new WebSocketServer({ server });

    const p2Session: P2WallSession = {
      server,
      wss,
      clients: new Set(),
      postsCache: new Map(initialPosts.map((p) => [p.id, p])),
      rateBuckets: new Map(),
    };

    wss.on('connection', (ws: WebSocket) => {
      p2Session.clients.add(ws);

      ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
        let parsed: unknown;
        try {
          const raw = Buffer.isBuffer(data) ? data.toString('utf-8') : String(data);
          parsed = JSON.parse(raw);
        } catch {
          return;
        }
        if (typeof parsed !== 'object' || parsed === null) return;
        const msg = parsed as Record<string, unknown>;
        const type = msg['type'];

        if (type === 'join') {
          // join은 간단히 ack만
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'wall', title: 'P2 테스트' }));
          }
          return;
        }

        if (type === 'student-like') {
          const sessionToken = String(msg['sessionToken'] ?? '');
          const postId = String(msg['postId'] ?? '');

          // rate limit 체크
          if (isRateLimitedLocal(p2Session.rateBuckets, sessionToken, 'student-like', RATE_LIKE_LIMIT, Date.now())) {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'error', message: '너무 빠릅니다. 잠시 후 다시 시도해 주세요.' }));
            }
            return;
          }

          const post = p2Session.postsCache.get(postId);
          if (!post) {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'error', message: '카드를 찾을 수 없습니다.' }));
            }
            return;
          }

          // toggleStudentLike 도메인 규칙 적용
          // toggleStudentLike는 RealtimeWallPost 타입을 요구하지만,
          // TestPost는 구조적으로 동일하므로 타입 단언 사용
          const updated = toggleStudentLike(post as Parameters<typeof toggleStudentLike>[0], sessionToken);
          p2Session.postsCache.set(postId, updated as TestPost);

          // 전체 클라이언트에 like-toggled broadcast
          broadcastP2(p2Session, {
            type: 'like-toggled',
            postId,
            likes: updated.likes ?? 0,
            likedBy: updated.likedBy ?? [],
          });
        }
      });

      ws.on('close', () => {
        p2Session.clients.delete(ws);
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('P2 서버 주소 획득 실패'));
        return;
      }
      resolve({ session: p2Session, port: addr.port });
    });
  });
}

// P2 픽스처
let p2Session: P2WallSession;
let p2Port: number;

const BASE_POST: TestPost = {
  id: 'post-1',
  likes: 0,
  likedBy: [],
  status: 'approved',
  teacherHearts: 0,
  nickname: '학생1',
  text: '테스트 글',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  columnId: 'c1',
  kanban: { columnId: 'c1', order: 0 },
  freeform: { x: 0, y: 0, w: 260, h: 180, zIndex: 1 },
};

// ---------------------------------------------------------------------------
// 시나리오 4: 학생 좋아요 동기화
// ---------------------------------------------------------------------------

describe('시나리오 4: 학생 A like → A·B·C 모두 like-toggled 수신', () => {
  beforeEach(async () => {
    ({ session: p2Session, port: p2Port } = await createP2TestServer([{ ...BASE_POST }]));
  });

  afterEach(() => {
    return new Promise<void>((resolve) => {
      for (const client of p2Session.clients) {
        try { client.terminate(); } catch { /* noop */ }
      }
      p2Session.wss.close(() => {
        p2Session.server.close(() => resolve());
      });
    });
  });

  it('학생 A의 student-like가 A·B·C 전원에게 like-toggled로 broadcast된다', async () => {
    // 3명 연결 + join
    const wsA = await connectClient(p2Port);
    const wsB = await connectClient(p2Port);
    const wsC = await connectClient(p2Port);

    wsA.send(JSON.stringify({ type: 'join', sessionToken: 'token-A' }));
    wsB.send(JSON.stringify({ type: 'join', sessionToken: 'token-B' }));
    wsC.send(JSON.stringify({ type: 'join', sessionToken: 'token-C' }));

    // 연결 안정화 대기
    await new Promise((r) => setTimeout(r, 30));

    // A·B·C 모두 like-toggled 대기 promise 등록 후 A가 like 송신
    const receiveA = waitForMessage(wsA, (m) => m['type'] === 'like-toggled' && m['postId'] === 'post-1');
    const receiveB = waitForMessage(wsB, (m) => m['type'] === 'like-toggled' && m['postId'] === 'post-1');
    const receiveC = waitForMessage(wsC, (m) => m['type'] === 'like-toggled' && m['postId'] === 'post-1');

    wsA.send(JSON.stringify({ type: 'student-like', sessionToken: 'token-A', postId: 'post-1' }));

    const [msgA, msgB, msgC] = await Promise.all([receiveA, receiveB, receiveC]);

    // likes=1, likedBy=['token-A']
    expect(msgA['likes']).toBe(1);
    expect(msgA['likedBy']).toContain('token-A');
    expect(msgB['likes']).toBe(1);
    expect(msgB['likedBy']).toContain('token-A');
    expect(msgC['likes']).toBe(1);
    expect(msgC['likedBy']).toContain('token-A');

    // postsCache도 반영됐는지 확인
    const cached = p2Session.postsCache.get('post-1');
    expect(cached?.likes).toBe(1);
    expect(cached?.likedBy).toContain('token-A');

    wsA.terminate();
    wsB.terminate();
    wsC.terminate();
  });
});

// ---------------------------------------------------------------------------
// 시나리오 5: rate limit (분당 30회 초과 시 error 응답)
// ---------------------------------------------------------------------------

describe('시나리오 5: 학생 B가 31번 연속 student-like → 31번째에 error 수신', () => {
  beforeEach(async () => {
    ({ session: p2Session, port: p2Port } = await createP2TestServer([{ ...BASE_POST }]));
  });

  afterEach(() => {
    return new Promise<void>((resolve) => {
      for (const client of p2Session.clients) {
        try { client.terminate(); } catch { /* noop */ }
      }
      p2Session.wss.close(() => {
        p2Session.server.close(() => resolve());
      });
    });
  });

  it('분당 30회 한도를 초과한 31번째 like 메시지에 error 응답이 온다', async () => {
    const wsB = await connectClient(p2Port);
    wsB.send(JSON.stringify({ type: 'join', sessionToken: 'token-B' }));

    await new Promise((r) => setTimeout(r, 30));

    // rate bucket을 30회로 채운다 (30회 정상 like-toggled 수신 확인 생략, 버킷만 채우기)
    // 같은 postId로 30번 like → unlike → like 반복이 실제 서버에서 일어나지만,
    // rate limit 목적이므로 수신 확인 없이 빠르게 전송한다.
    for (let i = 0; i < 30; i++) {
      wsB.send(JSON.stringify({ type: 'student-like', sessionToken: 'token-B', postId: 'post-1' }));
    }

    // 30회 처리 완료 대기 (짧은 간격)
    await new Promise((r) => setTimeout(r, 100));

    // 31번째 메시지 → error 응답 대기
    const errorPromise = waitForMessage(
      wsB,
      (m) => m['type'] === 'error' && /너무 빠릅니다|rate/i.test(String(m['message'] ?? '')),
      3000,
    );

    wsB.send(JSON.stringify({ type: 'student-like', sessionToken: 'token-B', postId: 'post-1' }));

    const errMsg = await errorPromise;
    expect(errMsg['type']).toBe('error');
    expect(String(errMsg['message'])).toMatch(/너무 빠릅니다|rate/i);

    wsB.terminate();
  });
});

// ---------------------------------------------------------------------------
// 시나리오 6: 같은 sessionToken으로 두 번 like → unlike (likes=0)
// ---------------------------------------------------------------------------

describe('시나리오 6: 같은 sessionToken 두 번 like → 두 번째에 unlike (likes=0)', () => {
  beforeEach(async () => {
    ({ session: p2Session, port: p2Port } = await createP2TestServer([{ ...BASE_POST }]));
  });

  afterEach(() => {
    return new Promise<void>((resolve) => {
      for (const client of p2Session.clients) {
        try { client.terminate(); } catch { /* noop */ }
      }
      p2Session.wss.close(() => {
        p2Session.server.close(() => resolve());
      });
    });
  });

  it('첫 번째 like-toggled의 likes=1, 두 번째 like-toggled의 likes=0 (unlike)', async () => {
    const wsA = await connectClient(p2Port);
    wsA.send(JSON.stringify({ type: 'join', sessionToken: 'token-A' }));

    await new Promise((r) => setTimeout(r, 30));

    // 첫 번째 like
    const firstLike = waitForMessage(
      wsA,
      (m) => m['type'] === 'like-toggled' && m['postId'] === 'post-1',
    );
    wsA.send(JSON.stringify({ type: 'student-like', sessionToken: 'token-A', postId: 'post-1' }));
    const first = await firstLike;

    expect(first['likes']).toBe(1);
    expect(first['likedBy']).toContain('token-A');

    // 두 번째 like (같은 토큰 → unlike)
    const secondLike = waitForMessage(
      wsA,
      (m) => m['type'] === 'like-toggled' && m['postId'] === 'post-1' && m['likes'] === 0,
    );
    wsA.send(JSON.stringify({ type: 'student-like', sessionToken: 'token-A', postId: 'post-1' }));
    const second = await secondLike;

    expect(second['likes']).toBe(0);
    expect((second['likedBy'] as string[]).length).toBe(0);
    expect(second['likedBy']).not.toContain('token-A');

    // postsCache도 unlike 반영
    const cached = p2Session.postsCache.get('post-1');
    expect(cached?.likes).toBe(0);
    expect(cached?.likedBy).not.toContain('token-A');

    wsA.terminate();
  });
});

// ---------------------------------------------------------------------------
// P3 시나리오 7: 학생 카드 추가 패들렛화
//
// 7a: approvalMode='auto' → submit → submitted 응답 + post-added(학생 측 관점)
//     교사 renderer가 setPosts 후 wall-state broadcast하면 post-added 대신
//     wall-state 재송신으로 반영 — 여기서는 서버 관점만 검증(submitted 응답
//     + 교사 renderer에 submission 전달 + locked 거부) 하여 테스트 복잡도를 낮춘다.
//
// 7b: approvalMode='manual' → submit → submitted 응답만 / post-added 없음
//     (approvalMode는 서버가 아닌 renderer가 관장 — 서버는 'submitted' ack만 전송)
//
// 7c: studentFormLocked=true → submit → error "잠금" 메시지, submitted 없음
//
// 본 테스트 서버는 realtimeWall.ts의 submit 핸들러 로직(잠금 체크 + submitted
// 응답)을 in-process로 복제한다. ipcMain/BrowserWindow 경로는 매뉴얼 QA.
// ---------------------------------------------------------------------------

interface P3WallSession {
  server: http.Server;
  wss: WebSocketServer;
  clients: Set<WebSocket>;
  studentFormLocked: boolean;
  /** 교사 renderer 측에 전달된 submission 로그 (mainWindow.webContents.send 모의) */
  rendererSubmissions: Array<{ sessionToken: string; nickname: string; text: string }>;
}

function createP3TestServer(
  initialLocked: boolean,
): Promise<{ session: P3WallSession; port: number }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    const wss = new WebSocketServer({ server });

    const p3Session: P3WallSession = {
      server,
      wss,
      clients: new Set(),
      studentFormLocked: initialLocked,
      rendererSubmissions: [],
    };

    wss.on('connection', (ws: WebSocket) => {
      p3Session.clients.add(ws);

      ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
        let parsed: unknown;
        try {
          const raw = Buffer.isBuffer(data) ? data.toString('utf-8') : String(data);
          parsed = JSON.parse(raw);
        } catch {
          return;
        }
        if (typeof parsed !== 'object' || parsed === null) return;
        const msg = parsed as Record<string, unknown>;
        const type = msg['type'];

        if (type === 'join') {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'wall', title: 'P3 테스트', maxTextLength: 1000 }));
          }
          return;
        }

        if (type === 'submit') {
          const sessionToken = String(msg['sessionToken'] ?? '');
          const nickname = String(msg['nickname'] ?? '').trim();
          const text = String(msg['text'] ?? '').trim();

          if (p3Session.studentFormLocked) {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'error',
                message: '선생님이 카드 추가를 잠깐 멈췄어요.',
              }));
            }
            return;
          }
          if (text.length === 0) {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'error', message: '내용을 입력해주세요.' }));
            }
            return;
          }

          p3Session.rendererSubmissions.push({ sessionToken, nickname, text });

          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'submitted' }));
          }
        }
      });

      ws.on('close', () => {
        p3Session.clients.delete(ws);
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('P3 서버 주소 획득 실패'));
        return;
      }
      resolve({ session: p3Session, port: addr.port });
    });
  });
}

let p3Session: P3WallSession;
let p3Port: number;

describe('시나리오 7a: approvalMode=auto — submit → submitted 응답 + 교사 renderer 전달', () => {
  beforeEach(async () => {
    ({ session: p3Session, port: p3Port } = await createP3TestServer(false));
  });

  afterEach(() => {
    return new Promise<void>((resolve) => {
      for (const client of p3Session.clients) {
        try { client.terminate(); } catch { /* noop */ }
      }
      p3Session.wss.close(() => {
        p3Session.server.close(() => resolve());
      });
    });
  });

  it('학생 submit → submitted 응답 수신 + 교사 renderer에 submission 전달', async () => {
    const wsA = await connectClient(p3Port);
    wsA.send(JSON.stringify({ type: 'join', sessionToken: 'token-A' }));

    await new Promise((r) => setTimeout(r, 30));

    const receivedSubmitted = waitForMessage(
      wsA,
      (m) => m['type'] === 'submitted',
      2000,
    );

    wsA.send(JSON.stringify({
      type: 'submit',
      sessionToken: 'token-A',
      nickname: '민수',
      text: '안녕하세요, 첫 카드입니다',
    }));

    const resp = await receivedSubmitted;
    expect(resp['type']).toBe('submitted');

    // 교사 renderer에 submission 도달
    expect(p3Session.rendererSubmissions).toHaveLength(1);
    expect(p3Session.rendererSubmissions[0].nickname).toBe('민수');
    expect(p3Session.rendererSubmissions[0].text).toBe('안녕하세요, 첫 카드입니다');

    wsA.terminate();
  });

  it('한 학생이 여러 장의 카드를 연속 제출할 수 있다 (v1.13 already_submitted 폐기)', async () => {
    const wsA = await connectClient(p3Port);
    wsA.send(JSON.stringify({ type: 'join', sessionToken: 'token-A' }));

    await new Promise((r) => setTimeout(r, 30));

    // 3장 연속 제출
    const responses: string[] = [];
    const collect = (data: unknown) => {
      try {
        const raw = typeof data === 'string' ? data : data instanceof Buffer ? data.toString('utf-8') : String(data);
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (typeof parsed['type'] === 'string' && parsed['type'] !== 'wall') {
          responses.push(parsed['type'] as string);
        }
      } catch { /* noop */ }
    };
    wsA.on('message', collect);

    for (let i = 0; i < 3; i++) {
      wsA.send(JSON.stringify({
        type: 'submit',
        sessionToken: 'token-A',
        nickname: '민수',
        text: `카드 ${i + 1}`,
      }));
    }

    await new Promise((r) => setTimeout(r, 150));

    // 모두 submitted 응답 (already_submitted 없음)
    const submittedCount = responses.filter((t) => t === 'submitted').length;
    const alreadyCount = responses.filter((t) => t === 'already_submitted').length;
    expect(submittedCount).toBe(3);
    expect(alreadyCount).toBe(0);
    expect(p3Session.rendererSubmissions).toHaveLength(3);

    wsA.off('message', collect);
    wsA.terminate();
  });
});

describe('시나리오 7b: approvalMode=manual — submit → submitted 응답만 / post-added 없음', () => {
  beforeEach(async () => {
    ({ session: p3Session, port: p3Port } = await createP3TestServer(false));
  });

  afterEach(() => {
    return new Promise<void>((resolve) => {
      for (const client of p3Session.clients) {
        try { client.terminate(); } catch { /* noop */ }
      }
      p3Session.wss.close(() => {
        p3Session.server.close(() => resolve());
      });
    });
  });

  it('학생 B에게는 submitter A의 submit에 대한 post-added broadcast가 도착하지 않는다', async () => {
    // 서버는 approvalMode 몰라도 동작한다 — 서버는 renderer에 'realtime-wall:student-submitted'
    // IPC만 발송. renderer는 approvalMode='manual'이면 status='pending'으로 setPosts.
    // 본 테스트는 "서버가 post-added를 자체 broadcast하지 않는다"를 검증.

    const wsA = await connectClient(p3Port);
    const wsB = await connectClient(p3Port);
    wsA.send(JSON.stringify({ type: 'join', sessionToken: 'token-A' }));
    wsB.send(JSON.stringify({ type: 'join', sessionToken: 'token-B' }));

    await new Promise((r) => setTimeout(r, 30));

    // B는 post-added 메시지를 수신하면 안 됨 — 모든 수신 메시지 타입 수집
    const bReceived: string[] = [];
    const bCollector = (data: unknown) => {
      try {
        const raw = typeof data === 'string' ? data : data instanceof Buffer ? data.toString('utf-8') : String(data);
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (typeof parsed['type'] === 'string') bReceived.push(parsed['type'] as string);
      } catch { /* noop */ }
    };
    wsB.on('message', bCollector);

    wsA.send(JSON.stringify({
      type: 'submit',
      sessionToken: 'token-A',
      nickname: 'A',
      text: 'manual 모드 테스트',
    }));

    // 500ms 대기 후 검증 — 서버가 post-added를 자체 broadcast하지 않음
    await new Promise((r) => setTimeout(r, 500));

    expect(bReceived).not.toContain('post-added');
    // renderer에는 도착
    expect(p3Session.rendererSubmissions).toHaveLength(1);

    wsB.off('message', bCollector);
    wsA.terminate();
    wsB.terminate();
  });
});

describe('시나리오 7c: studentFormLocked=true — submit 거부 + error 응답', () => {
  beforeEach(async () => {
    ({ session: p3Session, port: p3Port } = await createP3TestServer(true));
  });

  afterEach(() => {
    return new Promise<void>((resolve) => {
      for (const client of p3Session.clients) {
        try { client.terminate(); } catch { /* noop */ }
      }
      p3Session.wss.close(() => {
        p3Session.server.close(() => resolve());
      });
    });
  });

  it('잠금 상태에서 submit 시 error 메시지 수신 + 교사 renderer에 submission 전달되지 않음', async () => {
    const wsA = await connectClient(p3Port);
    wsA.send(JSON.stringify({ type: 'join', sessionToken: 'token-A' }));

    await new Promise((r) => setTimeout(r, 30));

    const receivedError = waitForMessage(
      wsA,
      (m) => m['type'] === 'error' && /잠깐 멈췄|잠금/.test(String(m['message'] ?? '')),
      2000,
    );

    wsA.send(JSON.stringify({
      type: 'submit',
      sessionToken: 'token-A',
      nickname: '민수',
      text: '잠금 테스트',
    }));

    const errMsg = await receivedError;
    expect(errMsg['type']).toBe('error');
    expect(String(errMsg['message'])).toMatch(/잠깐 멈췄|잠금/);

    // 교사 renderer에는 도달하지 않음
    expect(p3Session.rendererSubmissions).toHaveLength(0);

    wsA.terminate();
  });

  it('잠금 해제 후 submit 시 정상 처리된다', async () => {
    const wsA = await connectClient(p3Port);
    wsA.send(JSON.stringify({ type: 'join', sessionToken: 'token-A' }));

    await new Promise((r) => setTimeout(r, 30));

    // 1차 시도 — 거부
    wsA.send(JSON.stringify({
      type: 'submit',
      sessionToken: 'token-A',
      nickname: '민수',
      text: '1차',
    }));
    await new Promise((r) => setTimeout(r, 100));
    expect(p3Session.rendererSubmissions).toHaveLength(0);

    // 잠금 해제
    p3Session.studentFormLocked = false;

    // 2차 시도 — 정상
    const receivedSubmitted = waitForMessage(
      wsA,
      (m) => m['type'] === 'submitted',
      2000,
    );
    wsA.send(JSON.stringify({
      type: 'submit',
      sessionToken: 'token-A',
      nickname: '민수',
      text: '2차',
    }));
    const resp = await receivedSubmitted;
    expect(resp['type']).toBe('submitted');
    expect(p3Session.rendererSubmissions).toHaveLength(1);
    expect(p3Session.rendererSubmissions[0].text).toBe('2차');

    wsA.terminate();
  });
});
