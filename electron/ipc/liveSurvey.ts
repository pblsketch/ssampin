/**
 * 실시간 주관식 설문 IPC 핸들러
 *
 * 로컬 HTTP 서버 + WebSocket 서버를 열어 학생들이
 * 스마트폰 브라우저로 접속해 텍스트 답변을 제출할 수 있게 한다.
 */
import { ipcMain, BrowserWindow } from 'electron';
import http from 'http';
import os from 'os';
import { WebSocketServer, WebSocket } from 'ws';
import { generateSurveyHTML } from './liveSurveyHTML';

/** WSL/Hyper-V 등 가상 네트워크 대역 (외부 기기 접속 불가) */
const VIRTUAL_PREFIXES = ['172.16.', '172.17.', '172.18.', '172.19.', '172.20.',
  '172.21.', '172.22.', '172.23.', '172.24.', '172.25.', '172.26.', '172.27.',
  '172.28.', '172.29.', '172.30.', '172.31.'];

/**
 * 로컬 IPv4 주소 목록 반환 (루프백 + 가상 네트워크 제외)
 */
function getLocalIPs(): string[] {
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];
  for (const [name, iface] of Object.entries(interfaces)) {
    if (!iface) continue;
    // vEthernet (WSL) 등 가상 인터페이스 이름 필터링
    const lowerName = name.toLowerCase();
    if (lowerName.includes('wsl') || lowerName.includes('docker') || lowerName.includes('vethernet')) continue;
    for (const alias of iface) {
      if (alias.family !== 'IPv4' || alias.internal) continue;
      // 172.16.0.0/12 대역 제외 (WSL, Hyper-V, Docker 등)
      if (VIRTUAL_PREFIXES.some((p) => alias.address.startsWith(p))) continue;
      ips.push(alias.address);
    }
  }
  return ips;
}

interface LiveSurveySession {
  server: http.Server;
  wss: WebSocketServer;
  question: string;
  maxLength: number;
  responses: Map<string, string>; // sessionToken -> text
  clients: Set<WebSocket>;
}

/** 현재 실행 중인 설문 세션 (하나만 허용) */
let session: LiveSurveySession | null = null;

/**
 * 세션을 완전히 정리한다.
 */
function closeSession(): void {
  if (!session) return;

  // 연결된 클라이언트에 세션 종료 알림
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
 * 실시간 설문 IPC 핸들러 등록
 * @param mainWindow 렌더러에 이벤트를 전달할 메인 윈도우
 */
export function registerLiveSurveyHandlers(mainWindow: BrowserWindow): void {
  /**
   * live-survey:start — 설문 세션 시작
   *
   * @param args.question  설문 질문
   * @param args.maxLength 최대 답변 글자 수
   * @returns { port, localIPs }
   */
  ipcMain.handle(
    'live-survey:start',
    async (
      _event,
      args: { question: string; maxLength: number },
    ): Promise<{ port: number; localIPs: string[] }> => {
      return new Promise<{ port: number; localIPs: string[] }>((resolve, reject) => {
        // 기존 세션 정리
        closeSession();

        const { question, maxLength } = args;
        const html = generateSurveyHTML(question, maxLength);

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

          // 연결 수 변경 알림
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('live-survey:connection-count', {
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
              // 파싱 실패 → 무시
              return;
            }

            if (typeof parsed !== 'object' || parsed === null) return;
            const msg = parsed as Record<string, unknown>;
            const type = msg['type'];

            if (type === 'join') {
              const sessionToken = msg['sessionToken'];
              if (typeof sessionToken !== 'string') return;

              if (session.responses.has(sessionToken)) {
                ws.send(JSON.stringify({ type: 'already_submitted' }));
              } else {
                ws.send(
                  JSON.stringify({
                    type: 'survey',
                    question: session.question,
                    maxLength: session.maxLength,
                  }),
                );
              }
              return;
            }

            if (type === 'submit') {
              const rawText = msg['text'];
              const sessionToken = msg['sessionToken'];

              if (typeof rawText !== 'string' || typeof sessionToken !== 'string') return;

              // 텍스트 정제: trim 후 빈 문자열 거부, maxLength 초과분 잘라냄
              const text = rawText.trim().slice(0, session.maxLength);
              if (!text) return;

              // 중복 제출 방지
              if (session.responses.has(sessionToken)) {
                ws.send(JSON.stringify({ type: 'already_submitted' }));
                return;
              }

              session.responses.set(sessionToken, text);
              ws.send(JSON.stringify({ type: 'submitted' }));

              if (!mainWindow.isDestroyed()) {
                mainWindow.webContents.send('live-survey:student-submitted', {
                  text,
                  totalResponders: session.responses.size,
                });
              }
              return;
            }
          });

          ws.on('close', () => {
            if (!session) return;
            session.clients.delete(ws);

            if (!mainWindow.isDestroyed()) {
              mainWindow.webContents.send('live-survey:connection-count', {
                count: session.clients.size,
              });
            }
          });
        });

        // 모든 인터페이스에서 수신, OS가 포트 선택
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
              maxLength,
              responses: new Map(),
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

  /**
   * live-survey:stop — 설문 세션 종료
   */
  ipcMain.handle('live-survey:stop', (): void => {
    closeSession();
  });
}
