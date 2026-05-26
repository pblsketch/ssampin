import { app, BrowserWindow, ipcMain } from 'electron';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { randomUUID } from 'crypto';
import type { WebSocket } from 'ws';
import {
  startSessionedWebSocketServer,
  type SessionedWebSocketServerHandle,
} from './sessionedWebSocketServer';
import { closeTunnel, installTunnel, isTunnelAvailable, openTunnel } from './tunnel';
import type { ClassroomAgreementSession } from '../../src/domain/entities/ClassroomAgreement';
import type { ClassroomAgreementTeacherPhaseCommand } from '../../src/domain/rules/classroomAgreementPhaseRules';
import {
  ClassroomAgreementRealtimeSession,
  type ClassroomAgreementTeacherEvent,
} from '../../src/usecases/classroomAgreement/ClassroomAgreementRealtimeSession';
import { shouldRejectClientMessageForBoundToken } from '../../src/usecases/classroomAgreement/ClassroomAgreementClientTokenGuard';
import {
  ClassroomAgreementClientMessageSchema,
  type ClassroomAgreementClientMessage,
  type ClassroomAgreementServerMessage,
} from '../../src/shared/wsProtocol/classroomAgreement';

type ClassroomAgreementRendererEvent =
  | ClassroomAgreementTeacherEvent
  | { readonly type: 'connection-count'; readonly count: number };

interface ClassroomAgreementElectronSession {
  readonly handle: SessionedWebSocketServerHandle<ClassroomAgreementServerMessage>;
  readonly runtime: ClassroomAgreementRealtimeSession;
}

let session: ClassroomAgreementElectronSession | null = null;
let studentTokensBySocket = new WeakMap<WebSocket, string>();

export function registerClassroomAgreementHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle(
    'classroom-agreement:start',
    async (
      _event,
      args: { session: ClassroomAgreementSession },
    ): Promise<{ port: number; localIPs: string[] }> => {
      closeClassroomAgreementSession();
      studentTokensBySocket = new WeakMap<WebSocket, string>();

      const runtime = new ClassroomAgreementRealtimeSession(args.session, {
        now: () => Date.now(),
        makeId: () => randomUUID(),
        makeStudentToken: () => randomUUID(),
      });

      const handle = await startSessionedWebSocketServer<
        ClassroomAgreementClientMessage,
        ClassroomAgreementServerMessage
      >({
        port: 0,
        maxPayloadBytes: 128 * 1024,
        clientMessageSchema: ClassroomAgreementClientMessageSchema,
        debugTag: '[classroom-agreement]',
        closedMessage: { type: 'closed' },
        handleHttpRequest: handleStudentHttpRequest,
        onClientConnect: () => {
          if (session)
            emitClassroomAgreementEvent(mainWindow, {
              type: 'connection-count',
              count: session.handle.clientCount(),
            });
        },
        onClientDisconnect: () => {
          if (session)
            emitClassroomAgreementEvent(mainWindow, {
              type: 'connection-count',
              count: session.handle.clientCount(),
            });
        },
        onClientMessage: (ws, msg) => {
          if (!session) {
            sendTo(ws, {
              type: 'input-rejected',
              code: 'session-closed',
              message: '활동이 종료되었습니다.',
            });
            return;
          }

          const boundStudentToken = studentTokensBySocket.get(ws);

          if (isRateLimited(session.handle, msg, boundStudentToken)) {
            sendTo(ws, {
              type: 'error',
              message: '요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.',
            });
            return;
          }

          if (shouldRejectClientMessageForBoundToken(msg, boundStudentToken)) {
            sendTo(ws, {
              type: 'input-rejected',
              code: 'session-closed',
              message: '먼저 참여 정보를 다시 확인해 주세요.',
            });
            return;
          }

          const result = session.runtime.handleClientMessage(msg);
          if (msg.type === 'join-session' && result.reply.type === 'session-joined') {
            studentTokensBySocket.set(ws, result.reply.studentToken);
          }
          session.handle.sendTo(ws, result.reply);
          if (result.broadcast) session.handle.broadcast(result.broadcast);
          if (result.teacherEvent) {
            emitClassroomAgreementEvent(mainWindow, result.teacherEvent);
            if (result.teacherEvent.type === 'vote-received') {
              emitClassroomAgreementEvent(mainWindow, {
                type: 'session-state',
                session: session.runtime.getSession(),
              });
            }
          }
        },
      });

      session = { handle, runtime };
      emitClassroomAgreementEvent(mainWindow, {
        type: 'session-state',
        session: runtime.getSession(),
      });
      return { port: handle.port, localIPs: [] };
    },
  );

  ipcMain.handle('classroom-agreement:stop', (): void => {
    closeClassroomAgreementSession();
  });

  ipcMain.handle('classroom-agreement:tunnel-available', (): boolean => {
    return isTunnelAvailable();
  });

  ipcMain.handle('classroom-agreement:tunnel-install', async (): Promise<void> => {
    await installTunnel();
  });

  ipcMain.handle('classroom-agreement:tunnel-start', async (): Promise<{ tunnelUrl: string }> => {
    if (!session) throw new Error('classroom agreement session is not running');
    const tunnelUrl = await openTunnel(session.handle.port);
    return { tunnelUrl };
  });

  ipcMain.handle('classroom-agreement:get-state', (): ClassroomAgreementSession | null => {
    return session?.runtime.getSession() ?? null;
  });

  ipcMain.handle(
    'classroom-agreement:phase-command',
    (_event, args: { command: ClassroomAgreementTeacherPhaseCommand }) => {
      if (!session) throw new Error('classroom agreement session is not running');
      const result = session.runtime.applyTeacherPhaseCommand(args.command);
      if (!result.ok) throw new Error(result.reason);
      session.handle.broadcast(result.broadcast);
      emitClassroomAgreementEvent(mainWindow, {
        type: 'phase-changed',
        phase: session.runtime.getSession().phase,
      });
      return { phase: session.runtime.getSession().phase };
    },
  );

  ipcMain.handle(
    'classroom-agreement:update-session',
    (_event, args: { session: ClassroomAgreementSession }): void => {
      if (!session) throw new Error('classroom agreement session is not running');
      session.runtime.replaceSession(args.session);
      session.handle.broadcast({
        type: 'session-state',
        phase: session.runtime.getSession().phase,
        state: session.runtime.getPublicState(),
      });
      emitClassroomAgreementEvent(mainWindow, {
        type: 'session-state',
        session: session.runtime.getSession(),
      });
    },
  );
}

export function closeClassroomAgreementSession(): void {
  if (!session) return;
  void session.handle.close();
  closeTunnel();
  session = null;
}

function emitClassroomAgreementEvent(
  mainWindow: BrowserWindow,
  event: ClassroomAgreementRendererEvent,
): void {
  if (mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('classroom-agreement:event', event);
}

function sendTo(ws: WebSocket, msg: ClassroomAgreementServerMessage): void {
  if (session) {
    session.handle.sendTo(ws, msg);
    return;
  }
  try {
    ws.send(JSON.stringify({ ...msg, sentAt: Date.now() }));
  } catch (err) {
    console.warn('[classroom-agreement] failed to send direct fallback response', err);
  }
}

function isRateLimited(
  handle: SessionedWebSocketServerHandle<ClassroomAgreementServerMessage>,
  msg: ClassroomAgreementClientMessage,
  boundStudentToken: string | undefined,
): boolean {
  const now = Date.now();
  if (msg.type === 'join-session') {
    return handle.isRateLimited('join-session', 120, now);
  }
  const studentToken = boundStudentToken ?? 'unbound';
  return handle.isRateLimited(`${msg.type}:${studentToken}`, 60, now);
}

function handleStudentHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const pathname = req.url?.split('?')[0] ?? '/';

  if (pathname === '/health') {
    res.writeHead(200);
    res.end('OK');
    return true;
  }

  if (pathname === '/' || pathname === '/index.html' || pathname === '/student.html') {
    if (serveStudentIndexHtml(res)) return true;
  }

  if (pathname.startsWith('/assets/')) {
    if (serveStudentAsset(pathname, res)) return true;
  }

  if (pathname.startsWith('/')) {
    if (serveStudentAsset(pathname, res)) return true;
  }

  return false;
}

function getStudentDistRoot(): string {
  return path.resolve(app.getAppPath(), 'dist-student');
}

function serveStudentIndexHtml(res: http.ServerResponse): boolean {
  for (const name of ['student.html', 'index.html']) {
    const indexPath = path.join(getStudentDistRoot(), name);
    if (!fs.existsSync(indexPath)) continue;
    try {
      const html = fs.readFileSync(indexPath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function serveStudentAsset(pathname: string, res: http.ServerResponse): boolean {
  const distRoot = getStudentDistRoot();
  if (!fs.existsSync(distRoot)) return false;

  const requested = path.normalize(pathname).replace(/^[\\/]+/, '');
  const target = path.resolve(distRoot, requested);
  if (!target.startsWith(distRoot)) {
    res.writeHead(403);
    res.end('Forbidden');
    return true;
  }

  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return false;

  try {
    const data = fs.readFileSync(target);
    res.writeHead(200, { 'Content-Type': getStudentAssetContentType(target) });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

function getStudentAssetContentType(filePath: string): string {
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
