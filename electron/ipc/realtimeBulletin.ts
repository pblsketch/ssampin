import { BrowserWindow, ipcMain } from 'electron';
import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { generateRealtimeBulletinHTML } from './realtimeBulletinHTML';
import { closeTunnel, installTunnel, isTunnelAvailable, openTunnel } from './tunnel';

interface RealtimeBulletinSubmission {
  id: string;
  nickname: string;
  text: string;
  linkUrl?: string;
  submittedAt: number;
}

interface RealtimeBulletinSession {
  server: http.Server;
  wss: WebSocketServer;
  title: string;
  maxTextLength: number;
  submissions: Map<string, RealtimeBulletinSubmission>;
  clients: Set<WebSocket>;
}

let session: RealtimeBulletinSession | null = null;

function generateSubmissionId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function validateNickname(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const nickname = raw.trim();
  if (nickname.length === 0 || nickname.length > 20) return null;
  return nickname;
}

function normalizeLink(raw: unknown): { valid: boolean; value?: string } {
  if (typeof raw !== 'string') return { valid: true };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { valid: true };
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { valid: false };
    }
    return { valid: true, value: url.toString() };
  } catch {
    return { valid: false };
  }
}

function closeSession(): void {
  if (!session) return;

  closeTunnel();

  for (const client of session.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify({ type: 'closed' }));
      } catch {
        // noop
      }
      client.close();
    }
  }

  session.wss.close();
  session.server.close();
  session = null;
}

function emitConnectionCount(mainWindow: BrowserWindow, current: RealtimeBulletinSession): void {
  if (mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('realtime-bulletin:connection-count', {
    count: current.clients.size,
  });
}

export function registerRealtimeBulletinHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle(
    'realtime-bulletin:start',
    async (
      _event,
      args: { title: string; maxTextLength: number },
    ): Promise<{ port: number; localIPs: string[] }> => {
      return new Promise<{ port: number; localIPs: string[] }>((resolve, reject) => {
        closeSession();

        const title = args.title.trim() || '실시간 게시판';
        const maxTextLength = Math.max(80, Math.min(args.maxTextLength, 1000));
        const html = generateRealtimeBulletinHTML(title, maxTextLength);

        const server = http.createServer((req, res) => {
          const pathname = req.url?.split('?')[0] ?? '/';

          if (pathname === '/') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html);
            return;
          }

          if (pathname === '/health') {
            res.writeHead(200);
            res.end('OK');
            return;
          }

          res.writeHead(404);
          res.end('Not Found');
        });

        const wss = new WebSocketServer({ server });

        session = {
          server,
          wss,
          title,
          maxTextLength,
          submissions: new Map(),
          clients: new Set(),
        };

        wss.on('connection', (ws: WebSocket) => {
          if (!session) {
            ws.close();
            return;
          }

          session.clients.add(ws);
          emitConnectionCount(mainWindow, session);

          ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
            if (!session) return;

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
              const sessionToken = msg['sessionToken'];
              if (typeof sessionToken !== 'string' || sessionToken.trim().length === 0) return;

              if (session.submissions.has(sessionToken)) {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'already_submitted' }));
                }
                return;
              }

              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'bulletin',
                  title: session.title,
                  maxTextLength: session.maxTextLength,
                }));
              }
              return;
            }

            if (type === 'submit') {
              const sessionToken = msg['sessionToken'];
              if (typeof sessionToken !== 'string' || sessionToken.trim().length === 0) return;

              if (session.submissions.has(sessionToken)) {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'already_submitted' }));
                }
                return;
              }

              const nickname = validateNickname(msg['nickname']);
              if (!nickname) {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    type: 'error',
                    message: '닉네임은 1~20자여야 합니다.',
                  }));
                }
                return;
              }

              const rawText = msg['text'];
              if (typeof rawText !== 'string') return;
              const text = rawText.trim().slice(0, session.maxTextLength);
              if (text.length === 0) {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    type: 'error',
                    message: '내용을 입력해주세요.',
                  }));
                }
                return;
              }

              const link = normalizeLink(msg['linkUrl']);
              if (!link.valid) {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    type: 'error',
                    message: '링크는 http 또는 https 주소만 사용할 수 있습니다.',
                  }));
                }
                return;
              }

              const submission: RealtimeBulletinSubmission = {
                id: generateSubmissionId(),
                nickname,
                text,
                submittedAt: Date.now(),
                ...(link.value ? { linkUrl: link.value } : {}),
              };

              session.submissions.set(sessionToken, submission);

              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'submitted' }));
              }

              if (!mainWindow.isDestroyed()) {
                mainWindow.webContents.send('realtime-bulletin:student-submitted', {
                  post: submission,
                  totalSubmissions: session.submissions.size,
                });
              }
            }
          });

          ws.on('close', () => {
            if (!session) return;
            session.clients.delete(ws);
            emitConnectionCount(mainWindow, session);
          });
        });

        try {
          server.listen(0, '0.0.0.0', () => {
            const address = server.address();
            if (!address || typeof address === 'string') {
              reject(new Error('Failed to get server address'));
              return;
            }

            resolve({
              port: address.port,
              localIPs: [],
            });
          });
        } catch (error) {
          reject(error);
        }
      });
    },
  );

  ipcMain.handle('realtime-bulletin:stop', (): void => {
    closeSession();
  });

  ipcMain.handle('realtime-bulletin:tunnel-available', (): boolean => {
    return isTunnelAvailable();
  });

  ipcMain.handle('realtime-bulletin:tunnel-install', async (): Promise<void> => {
    await installTunnel();
  });

  ipcMain.handle('realtime-bulletin:tunnel-start', async (): Promise<{ tunnelUrl: string }> => {
    if (!session) throw new Error('실시간 게시판 세션이 없습니다');
    const address = session.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('서버가 준비되지 않았습니다');
    }
    const tunnelUrl = await openTunnel(address.port);
    return { tunnelUrl };
  });
}
