/**
 * 실시간 토론 도구 IPC 핸들러 (가치수직선 / 신호등 토론)
 *
 * 로컬 HTTP 서버 + WebSocket 서버를 열어 학생들이
 * 스마트폰 브라우저로 접속해 실시간으로 위치 이동(가치수직선)
 * 또는 신호 선택(신호등)을 할 수 있게 한다.
 */
import { ipcMain, BrowserWindow } from 'electron';
import http from 'http';
import os from 'os';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuid } from 'uuid';
import { generateValueLineHTML } from './discussionValueLineHTML';
import { generateTrafficLightHTML } from './discussionTrafficLightHTML';
import { isTunnelAvailable, installTunnel, openTunnel, closeTunnel } from './tunnel';

/** 한글 초성 배열 */
const CHOSEONG = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

/** 아바타 색상 팔레트 (dark theme 대비 최적화) */
const AVATAR_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899',
];

/**
 * 이름에서 아바타 정보를 추출한다.
 * - 한글 이름: 첫 글자의 초성 추출
 * - 비한글: 첫 글자 대문자
 * - 색상: 이름 해시 기반 결정
 */
function extractAvatar(name: string): { consonant: string; color: string } {
  const trimmed = name.trim();
  let consonant = '?';

  if (trimmed.length > 0) {
    const code = trimmed.charCodeAt(0);
    // 한글 완성형 (가=0xAC00 ~ 힣=0xD7A3)
    if (code >= 0xAC00 && code <= 0xD7A3) {
      const idx = Math.floor((code - 0xAC00) / 588);
      consonant = CHOSEONG[idx] ?? trimmed[0]!;
    } else {
      consonant = trimmed[0]!.toUpperCase();
    }
  }

  // 색상: 전체 이름의 해시로 결정
  let hash = 0;
  for (let i = 0; i < trimmed.length; i++) {
    hash = ((hash << 5) - hash + trimmed.charCodeAt(i)) | 0;
  }
  const color = AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;

  return { consonant, color };
}

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
    const lowerName = name.toLowerCase();
    if (lowerName.includes('wsl') || lowerName.includes('docker') || lowerName.includes('vethernet')) continue;
    for (const alias of iface) {
      if (alias.family !== 'IPv4' || alias.internal) continue;
      if (VIRTUAL_PREFIXES.some((p) => alias.address.startsWith(p))) continue;
      ips.push(alias.address);
    }
  }
  return ips;
}

interface Student {
  id: string;
  name: string;
  emoji: string;        // 초성 문자 (backward compat)
  avatarColor: string;  // 이름 해시 기반 결정적 색상
  ws: WebSocket | null;
  connected: boolean;
  position: number;    // 0.0~1.0 (가치수직선)
  signal: string;      // 'red'|'yellow'|'green'|'' (신호등)
}

interface ChatMessage {
  name: string;
  emoji: string;       // 초성 문자
  avatarColor: string;  // 아바타 색상
  text: string;
  time: string;
}

interface DiscussionSession {
  toolType: 'valueline' | 'trafficlight';
  topics: string[];
  currentRound: number;
  students: Student[];
  chats: ChatMessage[];
  server: http.Server | null;
  wss: WebSocketServer | null;
}

/** 현재 실행 중인 토론 세션 (하나만 허용) */
let session: DiscussionSession | null = null;

/** 상태 브로드캐스트 인터벌 */
let broadcastInterval: ReturnType<typeof setInterval> | null = null;

/**
 * 직렬화 가능한 학생 목록 반환 (ws 제외)
 */
function serializableStudents(): Array<Omit<Student, 'ws'>> {
  if (!session) return [];
  return session.students.map(({ ws: _ws, ...rest }) => rest);
}

/**
 * 모든 연결된 WS 클라이언트와 메인 윈도우에 상태 브로드캐스트
 */
function broadcastState(mainWindow: BrowserWindow): void {
  if (!session) return;

  const students = serializableStudents();
  const stateMsg = JSON.stringify({ type: 'state', students });

  for (const student of session.students) {
    if (student.ws && student.ws.readyState === WebSocket.OPEN) {
      student.ws.send(stateMsg);
    }
  }

  if (!mainWindow.isDestroyed()) {
    mainWindow.webContents.send('discussion:state', {
      students,
      chats: session.chats,
    });
  }
}

/**
 * 세션을 완전히 정리한다.
 */
function closeSession(): void {
  if (!session) return;

  // 브로드캐스트 인터벌 정리
  if (broadcastInterval) {
    clearInterval(broadcastInterval);
    broadcastInterval = null;
  }

  // 터널 종료
  closeTunnel();

  // 연결된 학생에게 세션 종료 알림
  for (const student of session.students) {
    if (student.ws && student.ws.readyState === WebSocket.OPEN) {
      student.ws.send(JSON.stringify({ type: 'end' }));
      student.ws.close();
    }
  }

  if (session.wss) session.wss.close();
  if (session.server) session.server.close();
  session = null;
}

/**
 * 실시간 토론 IPC 핸들러 등록
 * @param mainWindow 렌더러에 이벤트를 전달할 메인 윈도우
 */
export function registerLiveDiscussionHandlers(mainWindow: BrowserWindow): void {
  /**
   * discussion:start — 토론 세션 시작
   *
   * @param args.toolType  'valueline' | 'trafficlight'
   * @param args.topics    라운드별 주제 배열
   * @returns { port, localIPs }
   */
  ipcMain.handle(
    'discussion:start',
    async (
      _event,
      args: { toolType: 'valueline' | 'trafficlight'; topics: string[] },
    ): Promise<{ port: number; localIPs: string[] }> => {
      return new Promise<{ port: number; localIPs: string[] }>((resolve, reject) => {
        // 기존 세션 정리
        closeSession();

        const { toolType, topics } = args;
        const firstTopic = topics[0] ?? '';
        const html = toolType === 'valueline'
          ? generateValueLineHTML(firstTopic)
          : generateTrafficLightHTML(firstTopic);

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
              const name = msg['name'];
              if (typeof name !== 'string') return;
              if (!name.trim()) return;

              const avatar = extractAvatar(name.trim());

              // 이름으로 재접속 매칭
              const existing = session.students.find((s) => s.name === name.trim());
              if (existing) {
                // 기존 연결 정리
                if (existing.ws && existing.ws.readyState === WebSocket.OPEN) {
                  existing.ws.close();
                }
                existing.ws = ws;
                existing.connected = true;
                existing.emoji = avatar.consonant;
                existing.avatarColor = avatar.color;
              } else {
                // 새 학생 등록
                session.students.push({
                  id: uuid(),
                  name: name.trim(),
                  emoji: avatar.consonant,
                  avatarColor: avatar.color,
                  ws,
                  connected: true,
                  position: 0.5,
                  signal: '',
                });
              }

              const student = existing ?? session.students[session.students.length - 1];

              // 세션 정보 전송
              ws.send(JSON.stringify({
                type: 'session',
                toolType: session.toolType,
                topic: session.topics[session.currentRound] ?? '',
                round: session.currentRound,
                totalRounds: session.topics.length,
                yourId: student.id,
                avatar: { consonant: student.emoji, color: student.avatarColor },
              }));

              // 연결 수 알림
              const connectedCount = session.students.filter((s) => s.connected).length;
              if (!mainWindow.isDestroyed()) {
                mainWindow.webContents.send('discussion:connection-count', {
                  count: connectedCount,
                });
              }

              // 즉시 상태 브로드캐스트
              broadcastState(mainWindow);
              return;
            }

            if (type === 'move') {
              const position = msg['position'];
              if (typeof position !== 'number' || position < 0 || position > 1) return;

              const student = session.students.find((s) => s.ws === ws);
              if (!student) return;

              student.position = position;
              return;
            }

            if (type === 'signal') {
              const signal = msg['value'] ?? msg['signal'];
              if (typeof signal !== 'string') return;
              if (!['red', 'yellow', 'green', ''].includes(signal)) return;

              const student = session.students.find((s) => s.ws === ws);
              if (!student) return;

              student.signal = signal;

              // 신호 변경은 즉시 브로드캐스트
              broadcastState(mainWindow);
              return;
            }

            if (type === 'chat') {
              const text = msg['text'];
              if (typeof text !== 'string' || !text.trim()) return;

              const student = session.students.find((s) => s.ws === ws);
              if (!student) return;

              const chatMsg: ChatMessage = {
                name: student.name,
                emoji: student.emoji,
                avatarColor: student.avatarColor,
                text: text.trim().slice(0, 200),
                time: new Date().toISOString(),
              };
              session.chats.push(chatMsg);

              // 모든 WS 클라이언트에 채팅 메시지 전달
              const chatPayload = JSON.stringify({ type: 'chat', ...chatMsg });
              for (const s of session.students) {
                if (s.ws && s.ws.readyState === WebSocket.OPEN) {
                  s.ws.send(chatPayload);
                }
              }

              // 메인 윈도우에도 채팅 전달
              if (!mainWindow.isDestroyed()) {
                mainWindow.webContents.send('discussion:chat', chatMsg);
              }
              return;
            }

            if (type === 'ping') {
              ws.send(JSON.stringify({ type: 'pong' }));
              return;
            }
          });

          ws.on('close', () => {
            if (!session) return;

            const student = session.students.find((s) => s.ws === ws);
            if (student) {
              student.ws = null;
              student.connected = false;
            }

            const connectedCount = session.students.filter((s) => s.connected).length;
            if (!mainWindow.isDestroyed()) {
              mainWindow.webContents.send('discussion:connection-count', {
                count: connectedCount,
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
              toolType: args.toolType,
              topics: args.topics,
              currentRound: 0,
              students: [],
              chats: [],
              server,
              wss,
            };

            // 500ms 간격 상태 브로드캐스트
            broadcastInterval = setInterval(() => {
              broadcastState(mainWindow);
            }, 500);

            resolve({ port, localIPs });
          });
        } catch (err) {
          reject(err);
        }
      });
    },
  );

  /**
   * discussion:stop — 토론 세션 종료
   */
  ipcMain.handle('discussion:stop', (): void => {
    closeSession();
  });

  /**
   * discussion:next-round — 다음 라운드로 이동
   *
   * 학생 위치를 0.5로, 신호를 ''로 초기화하고 채팅을 비운다.
   * 모든 WS 클라이언트에 새 라운드 정보를 전송한다.
   */
  ipcMain.handle('discussion:next-round', (): void => {
    if (!session) return;

    session.currentRound += 1;
    const topic = session.topics[session.currentRound] ?? '';

    // 학생 상태 초기화
    for (const student of session.students) {
      student.position = 0.5;
      student.signal = '';
    }

    // 채팅 초기화
    session.chats = [];

    // 모든 WS 클라이언트에 라운드 변경 알림
    const roundMsg = JSON.stringify({
      type: 'round',
      round: session.currentRound,
      topic,
    });
    for (const student of session.students) {
      if (student.ws && student.ws.readyState === WebSocket.OPEN) {
        student.ws.send(roundMsg);
      }
    }

    // 새 상태 브로드캐스트
    broadcastState(mainWindow);
  });

  /**
   * discussion:get-state — 현재 토론 상태 조회
   */
  ipcMain.handle('discussion:get-state', (): {
    toolType: string;
    topics: string[];
    currentRound: number;
    students: Array<Omit<Student, 'ws'>>;
    chats: ChatMessage[];
  } | null => {
    if (!session) return null;
    return {
      toolType: session.toolType,
      topics: session.topics,
      currentRound: session.currentRound,
      students: serializableStudents(),
      chats: session.chats,
    };
  });

  /**
   * discussion:tunnel-available — cloudflared 바이너리 설치 여부
   */
  ipcMain.handle('discussion:tunnel-available', (): boolean => {
    return isTunnelAvailable();
  });

  /**
   * discussion:tunnel-install — cloudflared 바이너리 다운로드 (첫 사용 시)
   */
  ipcMain.handle('discussion:tunnel-install', async (): Promise<void> => {
    await installTunnel();
  });

  /**
   * discussion:tunnel-start — Cloudflare 터널 시작
   * 로컬 서버가 이미 실행 중이어야 한다.
   * @returns { tunnelUrl } 공개 HTTPS URL
   */
  ipcMain.handle('discussion:tunnel-start', async (): Promise<{ tunnelUrl: string }> => {
    if (!session) throw new Error('토론 세션이 없습니다');
    if (!session.server) throw new Error('서버가 준비되지 않았습니다');
    const address = session.server.address();
    if (!address || typeof address === 'string') throw new Error('서버가 준비되지 않았습니다');
    const tunnelUrl = await openTunnel(address.port);
    return { tunnelUrl };
  });
}
