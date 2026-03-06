/**
 * 실시간 워드클라우드 IPC 핸들러
 *
 * 로컬 HTTP 서버 + WebSocket 서버를 열어 학생들이
 * 스마트폰 브라우저로 접속해 단어를 제출할 수 있게 한다.
 */
import { ipcMain, BrowserWindow } from 'electron';
import http from 'http';
import os from 'os';
import { WebSocketServer, WebSocket } from 'ws';
import { generateWordCloudHTML } from './liveWordCloudHTML';

/**
 * 로컬 IPv4 주소 목록 반환 (루프백 제외)
 */
function getLocalIPs(): string[] {
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const alias of iface) {
      if (alias.family === 'IPv4' && !alias.internal) {
        ips.push(alias.address);
      }
    }
  }
  return ips;
}

function normalizeWord(word: string): string {
  return word.trim().replace(/\s+/g, ' ').toLowerCase();
}

interface LiveWordCloudSession {
  server: http.Server;
  wss: WebSocketServer;
  question: string;
  maxSubmissions: number;
  words: Map<string, number>; // normalizedWord -> count
  originalWords: Map<string, string>; // normalizedWord -> 첫 번째 원본
  studentSubmissions: Map<string, number>; // sessionToken -> 제출 횟수
  clients: Set<WebSocket>;
}

/** 현재 실행 중인 워드클라우드 세션 (하나만 허용) */
let session: LiveWordCloudSession | null = null;

/**
 * 세션을 완전히 정리한다.
 */
function closeSession(): void {
  if (!session) return;

  for (const client of session.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'closed' }));
      client.close();
    }
  }

  session.wss.close();
  session.server.close();
  session = null;
}

/**
 * 실시간 워드클라우드 IPC 핸들러 등록
 */
export function registerLiveWordCloudHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle(
    'live-wordcloud:start',
    async (
      _event,
      args: { question: string; maxSubmissions: number },
    ): Promise<{ port: number; localIPs: string[] }> => {
      return new Promise<{ port: number; localIPs: string[] }>((resolve, reject) => {
        closeSession();

        const { question, maxSubmissions } = args;
        const html = generateWordCloudHTML(question, maxSubmissions);

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

        wss.on('connection', (ws: WebSocket) => {
          if (!session) {
            ws.close();
            return;
          }

          session.clients.add(ws);

          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('live-wordcloud:connection-count', {
              count: session.clients.size,
            });
          }

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
              if (typeof sessionToken !== 'string') return;

              const used = session.studentSubmissions.get(sessionToken) ?? 0;
              const remaining = Math.max(0, session.maxSubmissions - used);

              ws.send(
                JSON.stringify({
                  type: 'ready',
                  question: session.question,
                  maxSubmissions: session.maxSubmissions,
                  remaining,
                }),
              );
              return;
            }

            if (type === 'submit_word') {
              const sessionToken = msg['sessionToken'];
              const word = msg['word'];

              if (typeof sessionToken !== 'string' || typeof word !== 'string') return;

              const trimmed = word.trim();
              if (!trimmed) {
                ws.send(JSON.stringify({ type: 'invalid', reason: '빈 입력' }));
                return;
              }

              const used = session.studentSubmissions.get(sessionToken) ?? 0;
              if (used >= session.maxSubmissions) {
                ws.send(JSON.stringify({ type: 'limit_reached' }));
                return;
              }

              // 제출 횟수 증가
              session.studentSubmissions.set(sessionToken, used + 1);
              const remaining = session.maxSubmissions - (used + 1);

              // 단어 빈도 업데이트
              const normalized = normalizeWord(trimmed);
              const currentCount = session.words.get(normalized) ?? 0;
              session.words.set(normalized, currentCount + 1);

              // 첫 번째 원본 보존
              if (!session.originalWords.has(normalized)) {
                session.originalWords.set(normalized, trimmed);
              }

              const displayWord = session.originalWords.get(normalized) ?? trimmed;

              ws.send(JSON.stringify({ type: 'word_accepted', remaining, word: trimmed }));

              if (!mainWindow.isDestroyed()) {
                mainWindow.webContents.send('live-wordcloud:word-submitted', {
                  word: displayWord,
                  count: currentCount + 1,
                  totalWords: session.words.size,
                });
              }
              return;
            }
          });

          ws.on('close', () => {
            if (!session) return;
            session.clients.delete(ws);

            if (!mainWindow.isDestroyed()) {
              mainWindow.webContents.send('live-wordcloud:connection-count', {
                count: session.clients.size,
              });
            }
          });
        });

        try {
          server.listen(0, '0.0.0.0', () => {
            const address = server.address();
            if (!address || typeof address === 'string') {
              reject(new Error('Failed to get server address'));
              return;
            }

            const port = address.port;
            const localIPs = getLocalIPs();

            session = {
              server,
              wss,
              question,
              maxSubmissions,
              words: new Map(),
              originalWords: new Map(),
              studentSubmissions: new Map(),
              clients: new Set(),
            };

            resolve({ port, localIPs });
          });
        } catch (err) {
          reject(err);
        }
      });
    },
  );

  ipcMain.handle('live-wordcloud:stop', (): void => {
    closeSession();
  });
}
