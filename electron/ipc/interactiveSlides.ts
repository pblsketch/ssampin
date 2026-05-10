/**
 * interactiveSlides WS 서버 + IPC 핸들러.
 *
 * 메인 프로세스에서 `SessionedWebSocketServer<TC, TS>` 베이스 위에 동작.
 * - 학생 클라이언트는 WS로 연결 (join-session/overlay-response 등 6종)
 * - 교사 측 액션은 IPC로 들어옴 (start/advance-slide/activate/deactivate/end)
 *
 * Plan §3 + Design §5.3 매핑.
 *
 * **상태**: WS 인프라 + 학생 lifecycle 동작 가능. UI(LessonEditor/Presenter)와
 *         학생 SPA, 도메인 영속화(JSON)는 별도 PR.
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { WebSocket } from 'ws';
import {
  startSessionedWebSocketServer,
  type SessionedWebSocketServerHandle,
} from './sessionedWebSocketServer';

import {
  ClientToServerMsgSchema,
  RATE_LIMIT_LIMIT,
  RATE_LIMIT_WINDOW_MS,
  type ClientToServerMsg,
} from '../../src/shared/wsProtocol/interactiveSlides';

import {
  asOverlayId,
  asStudentToken,
  type OverlayId,
  type SessionId,
  type ShortCode,
  type StudentToken,
} from '../../src/domain/valueObjects/InteractiveSlidesIds';

import type {
  InteractiveLesson,
  LessonSession,
  ResultsVisibility,
  SessionAccessMode,
} from '../../src/domain/entities/InteractiveSlides';
import type {
  IRealtimeBroadcaster,
  ServerToStudentMessage,
  ServerToTeacherMessage,
} from '../../src/domain/ports/IRealtimeBroadcaster';

import { MemoryLiveResponseStore } from '../../src/adapters/repositories/MemoryLiveResponseStore';
import { JsonInteractiveLessonRepository } from '../../src/infrastructure/storage/JsonInteractiveLessonRepository';

import { ActivateOverlay } from '../../src/usecases/interactiveSlides/ActivateOverlay';
import { AdvanceSlide } from '../../src/usecases/interactiveSlides/AdvanceSlide';
import { DeactivateOverlay } from '../../src/usecases/interactiveSlides/DeactivateOverlay';
import { EndLessonSession } from '../../src/usecases/interactiveSlides/EndLessonSession';
import { RestoreLateJoinState } from '../../src/usecases/interactiveSlides/RestoreLateJoinState';
import {
  ShortCodeCollisionError,
  StartLessonSession,
} from '../../src/usecases/interactiveSlides/StartLessonSession';
import { SubmitStudentResponse } from '../../src/usecases/interactiveSlides/SubmitStudentResponse';

// ─────────────────────────────────────────────────────────────
// Module state — 단일 활성 세션
// ─────────────────────────────────────────────────────────────

interface ActiveSession {
  readonly handle: SessionedWebSocketServerHandle<ServerToStudentMessage>;
  readonly sessionId: SessionId;
  readonly lesson: InteractiveLesson;
  /** WS ↔ studentToken 양방향 매핑 (보안: 외부 노출 X) */
  readonly wsByToken: Map<StudentToken, WebSocket>;
  readonly tokenByWs: WeakMap<WebSocket, StudentToken>;
}

let active: ActiveSession | null = null;
const liveStore = new MemoryLiveResponseStore();

/**
 * 영속 세션 repository.
 * `app.getPath('userData')`는 ready 이벤트 이후에만 호출 가능 — 모듈 top-level에서
 * 평가 못 함. `registerInteractiveSlidesHandlers`(=app.whenReady 후 호출) 내부에서
 * 1회 초기화한다.
 */
let sessionRepo!: JsonInteractiveLessonRepository;

// ─────────────────────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────────────────────

function makeUuid(): string {
  return globalThis.crypto.randomUUID();
}

function safeMain(mainWindow: BrowserWindow, channel: string, payload: unknown): void {
  if (mainWindow.isDestroyed()) return;
  try {
    mainWindow.webContents.send(channel, payload);
  } catch {
    /* noop */
  }
}

// ─────────────────────────────────────────────────────────────
// Broadcaster — 베이스 핸들 + IPC 결합
// ─────────────────────────────────────────────────────────────

function buildBroadcaster(
  mainWindow: BrowserWindow,
  getActive: () => ActiveSession | null,
): IRealtimeBroadcaster {
  return {
    broadcastToStudents(_sessionId, message) {
      const cur = getActive();
      if (!cur) return;
      cur.handle.broadcast(rewriteMessageForStudents(message));
    },
    sendToStudent(_sessionId, token, message) {
      const cur = getActive();
      if (!cur) return;
      const ws = cur.wsByToken.get(token);
      if (ws) cur.handle.sendTo(ws, rewriteMessageForStudents(message));
    },
    sendToTeacher(sessionId, message: ServerToTeacherMessage) {
      // 교사는 WS가 아니라 main → renderer IPC로 받음
      safeMain(mainWindow, 'slides-session:teacher-event', { sessionId, message });
    },
  };
}

/**
 * 학생에게 보내는 메시지의 file:// 슬라이드 이미지 경로를 HTTP 상대경로로 변환.
 *
 * 학생 브라우저는 file:// 접근 불가 → /slide-image/{presId}/{revId}/{pageId}.png 경로로 변환.
 * 같은 HTTP 서버가 캐시 폴더에서 PNG를 읽어 응답.
 */
function rewriteMessageForStudents<T extends ServerToStudentMessage>(message: T): T {
  if (message.type === 'slide-changed') {
    return {
      ...message,
      slide: {
        ...message.slide,
        imagePath: fileUrlToHttpPath(message.slide.imagePath),
      },
    } as T;
  }
  if (message.type === 'late-join-state') {
    // late-join-state.state.activeOverlays / closedOverlays는 imagePath를 직접 가지지 않음.
    // 학생은 slide-changed로 전체 슬라이드를 받기 전까지는 아무 이미지도 표시 X.
    return message;
  }
  return message;
}

/** file:///{userData}/cache/slides/{p}/{r}/{page}.png → /slide-image/{p}/{r}/{page}.png */
export function fileUrlToHttpPath(fileUrl: string): string {
  const idx = fileUrl.indexOf('/cache/slides/');
  if (idx < 0) return fileUrl; // 변환 못 하면 그대로 (fail-safe)
  return '/slide-image' + fileUrl.substring(idx + '/cache/slides'.length);
}

// ─────────────────────────────────────────────────────────────
// HTTP 라우팅: 학생 SPA 정적 파일 + 슬라이드 이미지 서빙
// ─────────────────────────────────────────────────────────────

const SLIDES_STUDENT_DIST_NAME = 'dist-slides-student';
const SLIDE_IMAGE_PATH_PREFIX = '/slide-image/';

function getSlidesStudentDistRoot(): string {
  return path.join(app.getAppPath(), SLIDES_STUDENT_DIST_NAME);
}

function getSlidesCacheRoot(): string {
  return path.join(app.getPath('userData'), 'cache', 'slides');
}

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.js':
    case '.mjs':
      return 'application/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.html':
      return 'text/html; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.ico':
      return 'image/x-icon';
    case '.woff':
      return 'font/woff';
    case '.woff2':
      return 'font/woff2';
    default:
      return 'application/octet-stream';
  }
}

function serveFileIfExists(
  absPath: string,
  res: import('http').ServerResponse,
  cacheControl: string = 'public, max-age=300',
): boolean {
  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) return false;
  try {
    const data = fs.readFileSync(absPath);
    res.writeHead(200, {
      'Content-Type': contentTypeFor(absPath),
      'Cache-Control': cacheControl,
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

function handleSlidesStudentHttp(
  req: import('http').IncomingMessage,
  res: import('http').ServerResponse,
): boolean {
  const pathname = req.url?.split('?')[0] ?? '/';

  if (pathname === '/health') {
    res.writeHead(200);
    res.end('OK');
    return true;
  }

  // 슬라이드 이미지 — userData/cache/slides/<rest>
  if (pathname.startsWith(SLIDE_IMAGE_PATH_PREFIX)) {
    const rest = pathname.substring(SLIDE_IMAGE_PATH_PREFIX.length);
    // path traversal 방지: 디렉토리 부분은 정상 분리, 각 segment는 영숫자/_-만 허용
    const segments = rest.split('/').filter((s) => s.length > 0);
    const segmentRegex = /^[A-Za-z0-9_.-]+$/;
    if (
      segments.length === 0 ||
      segments.some((s) => !segmentRegex.test(s) || s === '..' || s === '.')
    ) {
      res.writeHead(404);
      res.end('Not Found');
      return true;
    }
    const cacheRoot = getSlidesCacheRoot();
    const target = path.join(cacheRoot, ...segments);
    const resolved = path.resolve(target);
    if (!resolved.startsWith(path.resolve(cacheRoot) + path.sep)) {
      res.writeHead(404);
      res.end('Not Found');
      return true;
    }
    if (serveFileIfExists(resolved, res, 'public, max-age=86400')) return true;
    res.writeHead(404);
    res.end('Not Found');
    return true;
  }

  // 학생 SPA 정적 파일 — dist-slides-student
  const distRoot = getSlidesStudentDistRoot();
  if (!fs.existsSync(distRoot)) {
    // dev 환경: dist 미존재 — fallback 안내 페이지
    if (pathname === '/' || pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>인터랙티브 슬라이드</title></head>' +
          '<body style="background:#0a0e17;color:#e2e8f0;font-family:sans-serif;padding:40px;text-align:center;">' +
          '<h1>학생 화면 준비 중</h1>' +
          '<p>학생 SPA가 아직 빌드되지 않았어요. 개발 환경에서는 별도 dev 서버를 사용하세요.</p>' +
          '</body></html>',
      );
      return true;
    }
    return false;
  }

  if (pathname === '/' || pathname === '/index.html') {
    return serveFileIfExists(path.join(distRoot, 'index.html'), res);
  }

  // 정적 자산: 디렉토리 탈출 방지
  const requested = path.normalize(pathname).replace(/^[\\/]+/, '');
  const target = path.resolve(distRoot, requested);
  if (!target.startsWith(path.resolve(distRoot))) {
    res.writeHead(403);
    res.end('Forbidden');
    return true;
  }
  if (serveFileIfExists(target, res)) return true;
  return false; // 베이스가 404
}

// ─────────────────────────────────────────────────────────────
// WS 클라이언트 메시지 dispatch
// ─────────────────────────────────────────────────────────────

async function handleClientMessage(
  ws: WebSocket,
  msg: ClientToServerMsg,
  mainWindow: BrowserWindow,
  broadcaster: IRealtimeBroadcaster,
): Promise<void> {
  if (!active) return;

  switch (msg.type) {
    case 'join-session':
      return handleJoinSession(ws, msg, mainWindow, broadcaster);
    case 'overlay-response':
      return handleOverlayResponse(ws, msg, broadcaster);
    case 'slide-advance':
    case 'overlay-activate':
    case 'overlay-deactivate':
    case 'lesson-end':
      // 교사 액션은 IPC 경로로만 받는다 — WS로 들어온 건 무시 (보안)
      return;
  }
}

async function handleJoinSession(
  ws: WebSocket,
  msg: Extract<ClientToServerMsg, { type: 'join-session' }>,
  mainWindow: BrowserWindow,
  broadcaster: IRealtimeBroadcaster,
): Promise<void> {
  if (!active) return;
  const cur = active;

  if ((cur.lesson.id as string) === '') return; // 방어
  // 세션 코드 검증
  const session = await sessionRepo.loadSession(cur.sessionId);
  if (!session) return;
  if ((session.shortCode as string) !== msg.sessionCode) {
    cur.handle.sendError(ws, '세션 코드가 일치하지 않습니다.');
    return;
  }

  // rejoin 처리: previousToken이 60초 내 disconnect한 학생과 일치하면 그대로 사용
  let token: StudentToken;
  const now = Date.now();
  const rejoinToken = msg.rejoin?.previousToken
    ? asStudentToken(msg.rejoin.previousToken)
    : null;
  if (rejoinToken) {
    const recent = liveStore.findRecentlyDisconnected(
      cur.sessionId,
      rejoinToken,
      now,
      60_000,
    );
    if (recent) {
      token = rejoinToken;
      liveStore.markStudentPresence(cur.sessionId, token, true);
    } else {
      // 신규 발급
      token = asStudentToken(makeUuid());
      liveStore.addStudent(cur.sessionId, {
        studentToken: token,
        displayName: msg.studentName,
        originalName: msg.studentName,
        joinedAt: now,
        presence: 'online',
      });
    }
  } else {
    token = asStudentToken(makeUuid());
    liveStore.addStudent(cur.sessionId, {
      studentToken: token,
      displayName: msg.studentName,
      originalName: msg.studentName,
      joinedAt: now,
      presence: 'online',
    });
  }

  // WS ↔ token 바인딩
  cur.wsByToken.set(token, ws);
  cur.tokenByWs.set(ws, token);

  // session-joined ack (개별)
  cur.handle.sendTo(ws, {
    type: 'session-joined',
    studentToken: token,
    sessionStatus: session.status,
    currentSlideIndex: session.currentSlideIndex,
  });

  // late-join-state (개별, 재참여거나 진행 중 합류 모두 동일)
  const lateState = await RestoreLateJoinState(
    { sessionRepo, liveStore },
    { sessionId: cur.sessionId, studentToken: token },
  );
  if (lateState.ok) {
    cur.handle.sendTo(ws, { type: 'late-join-state', state: lateState.state });
  }

  // 교사에게 student-joined + presence-changed
  broadcaster.sendToTeacher(cur.sessionId, {
    type: 'student-joined',
    studentToken: token,
    studentName: msg.studentName,
    totalCount: liveStore.studentCount(cur.sessionId),
  });
}

async function handleOverlayResponse(
  ws: WebSocket,
  msg: Extract<ClientToServerMsg, { type: 'overlay-response' }>,
  broadcaster: IRealtimeBroadcaster,
): Promise<void> {
  if (!active) return;
  const cur = active;

  // WS ↔ studentToken 바인딩 검증 (impersonation 차단)
  const bound = cur.tokenByWs.get(ws);
  if (!bound || (bound as string) !== msg.studentToken) {
    cur.handle.sendError(ws, '응답 권한이 없습니다.');
    return;
  }

  // Rate limit (학생당 overlay당 1초 5회)
  const now = Date.now();
  const key = `resp:${msg.studentToken}:${msg.overlayId}`;
  if (cur.handle.isRateLimited(key, RATE_LIMIT_LIMIT, now, RATE_LIMIT_WINDOW_MS)) {
    cur.handle.sendError(ws, '너무 빠릅니다.');
    return;
  }

  const outcome = await SubmitStudentResponse(
    {
      sessionRepo,
      liveStore,
      broadcaster,
      clock: () => Date.now(),
      makeResponseId: makeUuid,
    },
    {
      sessionId: cur.sessionId,
      overlayId: asOverlayId(msg.overlayId),
      studentToken: asStudentToken(msg.studentToken),
      clientResponseId: msg.clientResponseId,
      data: msg.data,
    },
  );

  cur.handle.sendTo(ws, {
    type: 'response-accepted',
    overlayId: asOverlayId(msg.overlayId),
    status: outcome,
  });
}

function handleClientDisconnect(ws: WebSocket, broadcaster: IRealtimeBroadcaster): void {
  if (!active) return;
  const token = active.tokenByWs.get(ws);
  if (!token) return;
  active.tokenByWs.delete(ws);
  active.wsByToken.delete(token);
  liveStore.markStudentPresence(active.sessionId, token, false);

  // 교사에게 presence-changed
  let totalOnline = 0;
  for (const s of liveStore.listStudents(active.sessionId)) {
    if (s.presence === 'online') totalOnline++;
  }
  broadcaster.sendToTeacher(active.sessionId, {
    type: 'student-presence-changed',
    studentToken: token,
    online: false,
    totalOnline,
  });
}

// ─────────────────────────────────────────────────────────────
// 세션 종료
// ─────────────────────────────────────────────────────────────

async function closeActiveSession(): Promise<void> {
  if (!active) return;
  const handle = active.handle;
  active = null;
  await handle.close();
}

// ─────────────────────────────────────────────────────────────
// IPC 등록
// ─────────────────────────────────────────────────────────────

export function registerInteractiveSlidesHandlers(mainWindow: BrowserWindow): void {
  // app.whenReady() 이후 호출이 보장되므로 여기서 1회 초기화 안전.
  if (!sessionRepo) {
    sessionRepo = new JsonInteractiveLessonRepository(app.getPath('userData'));
  }

  const broadcaster = buildBroadcaster(mainWindow, () => active);

  ipcMain.handle(
    'slides-session:start',
    async (
      _event,
      args: {
        lesson: InteractiveLesson;
        sessionName: string;
        accessMode: SessionAccessMode;
        resultsVisibility?: ResultsVisibility;
      },
    ): Promise<{
      port: number;
      sessionId: SessionId;
      shortCode: ShortCode;
    }> => {
      await closeActiveSession();

      const handle = await startSessionedWebSocketServer<
        ClientToServerMsg,
        ServerToStudentMessage
      >({
        port: 0,
        maxPayloadBytes: 2 * 1024 * 1024, // Plan §3 페이로드 한도
        clientMessageSchema: ClientToServerMsgSchema,
        debugTag: '[interactive-slides]',
        handleHttpRequest: handleSlidesStudentHttp,
        onClientMessage: async (ws, msg) => {
          await handleClientMessage(ws, msg, mainWindow, broadcaster);
        },
        onClientDisconnect: (ws) => {
          handleClientDisconnect(ws, broadcaster);
        },
        closedMessage: { type: 'lesson-ended' } as ServerToStudentMessage,
      });

      try {
        const session: LessonSession = await StartLessonSession(
          {
            sessionRepo,
            liveStore,
            clock: () => Date.now(),
            random: Math.random,
            makeSessionId: makeUuid,
            findActiveByShortCode: (code) =>
              Promise.resolve(sessionRepo.findActiveByShortCode(code as string)),
          },
          {
            lesson: args.lesson,
            sessionName: args.sessionName,
            accessMode: args.accessMode,
            ...(args.resultsVisibility ? { resultsVisibility: args.resultsVisibility } : {}),
          },
        );

        active = {
          handle,
          sessionId: session.id,
          lesson: args.lesson,
          wsByToken: new Map(),
          tokenByWs: new WeakMap(),
        };

        return {
          port: handle.port,
          sessionId: session.id,
          shortCode: session.shortCode,
        };
      } catch (err) {
        await handle.close();
        if (err instanceof ShortCodeCollisionError) {
          throw new Error('세션 코드 발급에 실패했습니다. 다시 시도해 주세요.');
        }
        throw err;
      }
    },
  );

  ipcMain.handle('slides-session:stop', async (): Promise<void> => {
    if (active) {
      // 진행 중이면 종료 처리(스냅샷 저장 + 학생 broadcast)
      try {
        await EndLessonSession(
          { sessionRepo, liveStore, broadcaster, clock: () => Date.now() },
          { sessionId: active.sessionId, lesson: active.lesson, reason: 'teacher-stop' },
        );
      } catch {
        /* swallow — 어차피 close로 정리 */
      }
    }
    await closeActiveSession();
  });

  ipcMain.handle(
    'slides-session:advance-slide',
    async (_event, args: { sessionId: SessionId; targetIndex: number }): Promise<void> => {
      if (!active || (active.sessionId as string) !== (args.sessionId as string)) return;
      await AdvanceSlide(
        { sessionRepo, broadcaster },
        {
          sessionId: args.sessionId,
          lesson: active.lesson,
          targetIndex: args.targetIndex,
          requesterRole: 'teacher',
        },
      );
    },
  );

  ipcMain.handle(
    'slides-session:activate-overlay',
    async (_event, args: { sessionId: SessionId; overlayId: OverlayId }): Promise<void> => {
      if (!active || (active.sessionId as string) !== (args.sessionId as string)) return;
      await ActivateOverlay(
        { sessionRepo, liveStore, broadcaster, clock: () => Date.now() },
        {
          sessionId: args.sessionId,
          lesson: active.lesson,
          overlayId: args.overlayId,
        },
      );
    },
  );

  ipcMain.handle(
    'slides-session:deactivate-overlay',
    async (
      _event,
      args: {
        sessionId: SessionId;
        overlayId: OverlayId;
        visibility?: ResultsVisibility;
      },
    ): Promise<void> => {
      if (!active || (active.sessionId as string) !== (args.sessionId as string)) return;
      await DeactivateOverlay(
        { sessionRepo, liveStore, broadcaster, clock: () => Date.now() },
        {
          sessionId: args.sessionId,
          overlayId: args.overlayId,
          ...(args.visibility ? { visibility: args.visibility } : {}),
        },
      );
    },
  );

  ipcMain.handle(
    'slides-session:end-lesson',
    async (_event, args: { sessionId: SessionId }): Promise<void> => {
      if (!active || (active.sessionId as string) !== (args.sessionId as string)) return;
      await EndLessonSession(
        { sessionRepo, liveStore, broadcaster, clock: () => Date.now() },
        { sessionId: args.sessionId, lesson: active.lesson, reason: 'teacher-ended' },
      );
      await closeActiveSession();
    },
  );
}

// 테스트/디버그용 export — 라이프사이클 외부 검증
export const __test__ = {
  liveStore,
  getSessionRepo: (): JsonInteractiveLessonRepository => sessionRepo,
  getActive: (): ActiveSession | null => active,
  closeActiveSession,
};

