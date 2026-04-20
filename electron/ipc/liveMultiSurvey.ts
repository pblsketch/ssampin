/**
 * 실시간 복수 설문 IPC 핸들러
 *
 * 로컬 HTTP 서버 + WebSocket 서버를 열어 학생들이
 * 스마트폰 브라우저로 접속해 복수 문항 답변을 제출할 수 있게 한다.
 *
 * 두 가지 모드를 지원한다.
 *  - stepMode=false (기존/하위호환): 학생이 전체 문항을 스크롤로 보고 한 번에 submit
 *  - stepMode=true  (신규): 교사 주도 phase 머신 (lobby → open → revealed → …)
 */
import { ipcMain, BrowserWindow } from 'electron';
import http from 'http';
import os from 'os';
import { WebSocketServer, WebSocket } from 'ws';
import { generateMultiSurveyHTML, MultiSurveyQuestionForHTML } from './liveMultiSurveyHTML';
import { isTunnelAvailable, installTunnel, openTunnel, closeTunnel } from './tunnel';

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

/** 문항별 답변 표현 (phase 머신 모드 전용) */
interface PerAnswer {
  optionIds?: string[];
  text?: string;
  scale?: number;
}

/** 세션 phase */
type Phase = 'lobby' | 'open' | 'revealed' | 'ended';

/** 참가자 정보 (phase 머신 모드 전용) */
interface Participant {
  nickname: string;
  answers: Map<number, PerAnswer>;
}

/** 단일 선택/복수 선택 집계 */
interface ChoiceAggregate {
  counts: Record<string, number>;
  total: number;
}

/** 스케일 집계 */
interface ScaleAggregate {
  avg: number;
  distribution: Record<number, number>;
  total: number;
}

/** 주관식 집계 (학생용 — 무기명) */
interface TextAggregate {
  answers: string[];
}

type AggregatedResult = ChoiceAggregate | ScaleAggregate | TextAggregate;

interface LiveMultiSurveySession {
  server: http.Server;
  wss: WebSocketServer;
  questions: MultiSurveyQuestionForHTML[];
  stepMode: boolean;

  // phase 머신 모드 전용 상태
  phase: Phase;
  currentQuestionIndex: number;
  participants: Map<string, Participant>;
  clients: Map<WebSocket, string>; // ws → sessionId (join 전엔 '')

  // 하위호환(scroll 모드) 전용 상태
  submissions: Map<string, string>; // sessionToken → answers JSON
}

/** 현재 실행 중인 복수 설문 세션 (하나만 허용) */
let session: LiveMultiSurveySession | null = null;

/**
 * 세션을 완전히 정리한다.
 */
function closeSession(): void {
  if (!session) return;

  // 터널 종료
  closeTunnel();

  // 연결된 클라이언트에 세션 종료 알림
  for (const [client] of session.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify({ type: 'closed' }));
      } catch {
        // 송신 실패는 무시
      }
      client.close();
    }
  }

  session.wss.close();
  session.server.close();
  session = null;
}

/**
 * 간단한 UUID-like 제출 ID 생성
 */
function generateSubmissionId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * 닉네임 검증: trim 후 1~20자 확인.
 * 반환값이 null이면 거부, 문자열이면 trim된 닉네임.
 */
function validateNickname(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 20) return null;
  return trimmed;
}

/**
 * currentQuestionIndex 를 문항 개수 범위로 클램프한다.
 */
function clampIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(total - 1, index));
}

/**
 * 현재 문항에 대해 답변한 참가자 수
 */
function countAnsweredForCurrent(s: LiveMultiSurveySession): number {
  let count = 0;
  for (const participant of s.participants.values()) {
    if (participant.answers.has(s.currentQuestionIndex)) count += 1;
  }
  return count;
}

/**
 * 특정 문항의 답변을 집계한다. (학생용 — 무기명)
 */
function aggregateAnswers(
  s: LiveMultiSurveySession,
  questionIndex: number,
): AggregatedResult | null {
  const question = s.questions[questionIndex];
  if (!question) return null;

  if (question.type === 'single-choice' || question.type === 'multi-choice') {
    const counts: Record<string, number> = {};
    if (question.options) {
      for (const opt of question.options) counts[opt.id] = 0;
    }
    let total = 0;
    for (const participant of s.participants.values()) {
      const answer = participant.answers.get(questionIndex);
      if (!answer || !answer.optionIds || answer.optionIds.length === 0) continue;
      total += 1;
      for (const optionId of answer.optionIds) {
        counts[optionId] = (counts[optionId] ?? 0) + 1;
      }
    }
    const result: ChoiceAggregate = { counts, total };
    return result;
  }

  if (question.type === 'scale') {
    const distribution: Record<number, number> = {};
    const min = question.scaleMin ?? 1;
    const max = question.scaleMax ?? 5;
    for (let v = min; v <= max; v += 1) distribution[v] = 0;
    let sum = 0;
    let total = 0;
    for (const participant of s.participants.values()) {
      const answer = participant.answers.get(questionIndex);
      if (!answer || typeof answer.scale !== 'number') continue;
      const v = answer.scale;
      distribution[v] = (distribution[v] ?? 0) + 1;
      sum += v;
      total += 1;
    }
    const avg = total > 0 ? sum / total : 0;
    const result: ScaleAggregate = { avg, distribution, total };
    return result;
  }

  // text
  const answers: string[] = [];
  for (const participant of s.participants.values()) {
    const answer = participant.answers.get(questionIndex);
    if (!answer) continue;
    const text = answer.text?.trim();
    if (text && text.length > 0) answers.push(text);
  }
  const result: TextAggregate = { answers };
  return result;
}

/**
 * 교사 전용 — 주관식 답변 상세 (이름 포함)
 */
interface TextAnswerEntry {
  sessionId: string;
  nickname: string;
  text: string;
}

function collectTextAnswerDetail(
  s: LiveMultiSurveySession,
  questionIndex: number,
): TextAnswerEntry[] {
  const entries: TextAnswerEntry[] = [];
  for (const [sessionId, participant] of s.participants.entries()) {
    const answer = participant.answers.get(questionIndex);
    if (!answer) continue;
    const text = answer.text?.trim();
    if (!text || text.length === 0) continue;
    entries.push({ sessionId, nickname: participant.nickname, text });
  }
  return entries;
}

/**
 * 교사 화면용 roster (참가자 + 답변 완료 문항 인덱스)
 */
interface RosterEntry {
  sessionId: string;
  nickname: string;
  answeredQuestions: number[];
}

function buildRoster(s: LiveMultiSurveySession): RosterEntry[] {
  const roster: RosterEntry[] = [];
  for (const [sessionId, participant] of s.participants.entries()) {
    const answered: number[] = [];
    for (const q of participant.answers.keys()) answered.push(q);
    answered.sort((a, b) => a - b);
    roster.push({ sessionId, nickname: participant.nickname, answeredQuestions: answered });
  }
  return roster;
}

/**
 * 특정 WebSocket 클라이언트에게 보낼 state payload 생성
 */
function buildStatePayload(
  s: LiveMultiSurveySession,
  ws: WebSocket,
): Record<string, unknown> {
  const sessionId = s.clients.get(ws) ?? '';
  const participant = sessionId ? s.participants.get(sessionId) : undefined;
  const myNickname = participant?.nickname ?? '';
  const totalConnected = s.clients.size;
  const totalAnswered = countAnsweredForCurrent(s);

  const payload: Record<string, unknown> = {
    phase: s.phase,
    questionIndex: s.currentQuestionIndex,
    totalQuestions: s.questions.length,
    totalConnected,
    totalAnswered,
    myNickname,
  };

  if (s.phase === 'open' || s.phase === 'revealed') {
    const question = s.questions[s.currentQuestionIndex];
    if (question) payload.question = question;
    const myAnswer = participant?.answers.get(s.currentQuestionIndex);
    if (myAnswer) payload.myAnswer = myAnswer;
  }

  if (s.phase === 'revealed') {
    const aggregated = aggregateAnswers(s, s.currentQuestionIndex);
    if (aggregated) payload.aggregated = aggregated;
  }

  return payload;
}

/**
 * 모든 연결된 클라이언트에 현재 state를 송신 (WebSocket.OPEN만)
 */
function broadcastState(s: LiveMultiSurveySession): void {
  for (const [ws] of s.clients) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    const payload = buildStatePayload(s, ws);
    try {
      ws.send(JSON.stringify({ type: 'state', ...payload }));
    } catch {
      // 개별 송신 실패는 무시하고 다음으로
    }
  }
}

/**
 * 특정 클라이언트에게 state를 즉시 송신 (late-join / join 직후)
 */
function sendStateToClient(s: LiveMultiSurveySession, ws: WebSocket): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  const payload = buildStatePayload(s, ws);
  try {
    ws.send(JSON.stringify({ type: 'state', ...payload }));
  } catch {
    // 무시
  }
}

/**
 * 교사(메인 윈도우)에 IPC 이벤트 안전 송신
 */
function sendToMain(
  mainWindow: BrowserWindow,
  channel: string,
  payload: unknown,
): void {
  if (mainWindow.isDestroyed()) return;
  try {
    mainWindow.webContents.send(channel, payload);
  } catch {
    // 렌더러 파괴/비활성 상태면 무시
  }
}

/**
 * 교사 화면 phase-changed IPC 송신
 */
function emitPhaseChanged(
  mainWindow: BrowserWindow,
  s: LiveMultiSurveySession,
): void {
  const payload: Record<string, unknown> = {
    phase: s.phase,
    currentQuestionIndex: s.currentQuestionIndex,
    totalAnswered: countAnsweredForCurrent(s),
    totalConnected: s.clients.size,
  };
  if (s.phase === 'revealed') {
    const aggregated = aggregateAnswers(s, s.currentQuestionIndex);
    if (aggregated) payload.aggregated = aggregated;
  }
  sendToMain(mainWindow, 'live-multi-survey:phase-changed', payload);
}

/**
 * 교사 화면 roster IPC 송신
 */
function emitRoster(mainWindow: BrowserWindow, s: LiveMultiSurveySession): void {
  sendToMain(mainWindow, 'live-multi-survey:roster', { roster: buildRoster(s) });
}

/**
 * 교사 화면 connection-count IPC 송신 (clients.size 기반)
 */
function emitConnectionCount(
  mainWindow: BrowserWindow,
  s: LiveMultiSurveySession,
): void {
  sendToMain(mainWindow, 'live-multi-survey:connection-count', {
    count: s.clients.size,
  });
}

/**
 * 실시간 복수 설문 IPC 핸들러 등록
 * @param mainWindow 렌더러에 이벤트를 전달할 메인 윈도우
 */
export function registerLiveMultiSurveyHandlers(mainWindow: BrowserWindow): void {
  /**
   * live-multi-survey:start — 복수 설문 세션 시작
   *
   * @param args.questions 설문 문항 목록
   * @param args.stepMode  true면 phase 머신 모드(로비부터), false면 기존 스크롤 모드
   * @returns { port, localIPs }
   */
  ipcMain.handle(
    'live-multi-survey:start',
    async (
      _event,
      args: { questions: MultiSurveyQuestionForHTML[]; stepMode?: boolean },
    ): Promise<{ port: number; localIPs: string[] }> => {
      return new Promise<{ port: number; localIPs: string[] }>((resolve, reject) => {
        // 기존 세션 정리
        closeSession();

        const { questions } = args;
        const stepMode = args.stepMode ?? false;
        const html = generateMultiSurveyHTML(questions, stepMode);

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

        // 세션을 server.listen() 전에 미리 생성 — WSS connection 핸들러가 session을 null로 보는 race condition 방지
        session = {
          server,
          wss,
          questions,
          stepMode,
          phase: stepMode ? 'lobby' : 'open',
          currentQuestionIndex: 0,
          participants: new Map(),
          clients: new Map(),
          submissions: new Map(),
        };

        wss.on('connection', (ws: WebSocket) => {
          if (!session) {
            ws.close();
            return;
          }

          // 초기에는 sessionId 없음. join 수신 시 확정.
          session.clients.set(ws, '');

          // 연결 수 변경 알림 (공통)
          emitConnectionCount(mainWindow, session);

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

            // ─────────────────────────────────────────────────────────
            // phase 머신 모드(stepMode=true) 전용 메시지
            // ─────────────────────────────────────────────────────────
            if (session.stepMode) {
              if (type === 'join') {
                const nickname = validateNickname(msg['nickname']);
                if (nickname === null) {
                  if (ws.readyState === WebSocket.OPEN) {
                    try {
                      const raw = msg['nickname'];
                      const code = typeof raw === 'string' && raw.length > 0
                        ? 'nickname_invalid'
                        : 'nickname_required';
                      ws.send(
                        JSON.stringify({
                          type: 'error',
                          code,
                          message:
                            code === 'nickname_required'
                              ? '닉네임을 입력해주세요'
                              : '닉네임은 1~20자여야 합니다',
                        }),
                      );
                    } catch {
                      // 무시
                    }
                  }
                  return;
                }

                // sessionId 확정: 클라이언트가 보낸 값이 유효하면 재사용, 아니면 새로 발급
                const providedId = msg['sessionId'];
                let sessionId: string;
                if (typeof providedId === 'string' && providedId.trim().length > 0) {
                  sessionId = providedId.trim();
                } else {
                  sessionId = generateSubmissionId();
                }

                session.clients.set(ws, sessionId);

                // 참가자 등록 또는 닉네임 갱신
                const existing = session.participants.get(sessionId);
                if (existing) {
                  existing.nickname = nickname;
                } else {
                  session.participants.set(sessionId, {
                    nickname,
                    answers: new Map<number, PerAnswer>(),
                  });
                }

                if (ws.readyState === WebSocket.OPEN) {
                  try {
                    ws.send(JSON.stringify({ type: 'joined', sessionId, nickname }));
                  } catch {
                    // 무시
                  }
                }

                // 신규 연결자에게 현재 state 즉시 송신 (late-join 대응)
                sendStateToClient(session, ws);
                // 나머지 클라이언트에게도 totalConnected/roster 갱신 반영
                broadcastState(session);
                emitRoster(mainWindow, session);
                return;
              }

              if (type === 'answer') {
                const providedId = msg['sessionId'];
                if (typeof providedId !== 'string' || providedId.trim().length === 0) return;
                const sessionId = providedId.trim();

                const participant = session.participants.get(sessionId);
                if (!participant) return;

                // phase 검증: open 일 때만, 그리고 현재 문항 인덱스와 일치할 때만
                if (session.phase !== 'open') return;

                const rawIndex = msg['questionIndex'];
                if (typeof rawIndex !== 'number' || !Number.isFinite(rawIndex)) return;
                const questionIndex = Math.trunc(rawIndex);
                if (questionIndex !== session.currentQuestionIndex) return;

                const question = session.questions[questionIndex];
                if (!question) return;

                const rawAnswer = msg['answer'];
                if (typeof rawAnswer !== 'object' || rawAnswer === null) return;
                const ansObj = rawAnswer as Record<string, unknown>;

                const perAnswer: PerAnswer = {};
                if (question.type === 'single-choice' || question.type === 'multi-choice') {
                  const optionIdsRaw = ansObj['optionIds'];
                  if (!Array.isArray(optionIdsRaw)) return;
                  const optionIds: string[] = [];
                  for (const id of optionIdsRaw) {
                    if (typeof id === 'string' && id.length > 0) optionIds.push(id);
                  }
                  if (optionIds.length === 0) return;
                  if (question.type === 'single-choice' && optionIds.length > 1) return;
                  perAnswer.optionIds = optionIds;
                } else if (question.type === 'scale') {
                  const scaleRaw = ansObj['scale'];
                  if (typeof scaleRaw !== 'number' || !Number.isFinite(scaleRaw)) return;
                  const min = question.scaleMin ?? 1;
                  const max = question.scaleMax ?? 5;
                  const scale = Math.trunc(scaleRaw);
                  if (scale < min || scale > max) return;
                  perAnswer.scale = scale;
                } else if (question.type === 'text') {
                  const textRaw = ansObj['text'];
                  if (typeof textRaw !== 'string') return;
                  const maxLen = question.maxLength ?? 500;
                  const text = textRaw.slice(0, maxLen);
                  if (text.trim().length === 0) return;
                  perAnswer.text = text;
                }

                // 덮어쓰기 허용
                participant.answers.set(questionIndex, perAnswer);

                if (ws.readyState === WebSocket.OPEN) {
                  try {
                    ws.send(JSON.stringify({ type: 'ack', questionIndex }));
                  } catch {
                    // 무시
                  }
                }

                // 전체에 state 재송신 (totalAnswered 반영)
                broadcastState(session);

                // 교사 UI에 student-answered 이벤트
                const aggregatedPreview = aggregateAnswers(session, questionIndex);
                sendToMain(mainWindow, 'live-multi-survey:student-answered', {
                  sessionId,
                  nickname: participant.nickname,
                  questionIndex,
                  totalAnswered: countAnsweredForCurrent(session),
                  totalConnected: session.clients.size,
                  aggregatedPreview,
                });
                emitRoster(mainWindow, session);
                return;
              }

              // stepMode=true에서는 그 외 메시지는 무시 (join/answer 외엔 없음)
              return;
            }

            // ─────────────────────────────────────────────────────────
            // 하위 호환(scroll 모드, stepMode=false) 전용 메시지
            // 기존 동작 완전 유지
            // ─────────────────────────────────────────────────────────
            if (type === 'join') {
              const sessionToken = msg['sessionToken'];
              if (typeof sessionToken !== 'string') return;

              if (session.submissions.has(sessionToken)) {
                if (ws.readyState === WebSocket.OPEN) {
                  try {
                    ws.send(JSON.stringify({ type: 'already_submitted' }));
                  } catch {
                    // 무시
                  }
                }
              } else {
                if (ws.readyState === WebSocket.OPEN) {
                  try {
                    ws.send(
                      JSON.stringify({
                        type: 'survey',
                        questions: session.questions,
                      }),
                    );
                  } catch {
                    // 무시
                  }
                }
              }
              return;
            }

            if (type === 'submit') {
              const rawAnswers = msg['answers'];
              const sessionToken = msg['sessionToken'];

              if (!Array.isArray(rawAnswers) || typeof sessionToken !== 'string') return;

              // 중복 제출 방지
              if (session.submissions.has(sessionToken)) {
                if (ws.readyState === WebSocket.OPEN) {
                  try {
                    ws.send(JSON.stringify({ type: 'already_submitted' }));
                  } catch {
                    // 무시
                  }
                }
                return;
              }

              const answersJson = JSON.stringify(rawAnswers);
              session.submissions.set(sessionToken, answersJson);
              if (ws.readyState === WebSocket.OPEN) {
                try {
                  ws.send(JSON.stringify({ type: 'submitted' }));
                } catch {
                  // 무시
                }
              }

              sendToMain(mainWindow, 'live-multi-survey:student-submitted', {
                answers: rawAnswers,
                submissionId: generateSubmissionId(),
                totalSubmissions: session.submissions.size,
              });
              return;
            }
          });

          ws.on('close', () => {
            if (!session) return;
            session.clients.delete(ws);

            // participants 는 유지 (재연결 가능)
            emitConnectionCount(mainWindow, session);

            // stepMode=true 면 totalConnected 변경을 다른 클라이언트들에게 브로드캐스트
            if (session.stepMode) {
              broadcastState(session);
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

            resolve({ port, localIPs });
          });
        } catch (err) {
          reject(err);
        }
      });
    },
  );

  /**
   * live-multi-survey:stop — 복수 설문 세션 종료
   */
  ipcMain.handle('live-multi-survey:stop', (): void => {
    closeSession();
  });

  /**
   * live-multi-survey:activate-session (stepMode 전용)
   * phase: lobby → open (currentQuestionIndex = 0)
   */
  ipcMain.handle('live-multi-survey:activate-session', (): void => {
    if (!session || !session.stepMode) return;
    if (session.phase !== 'lobby') return;
    if (session.questions.length === 0) {
      session.phase = 'ended';
      broadcastState(session);
      emitPhaseChanged(mainWindow, session);
      return;
    }
    session.phase = 'open';
    session.currentQuestionIndex = 0;
    broadcastState(session);
    emitPhaseChanged(mainWindow, session);
    emitRoster(mainWindow, session);
  });

  /**
   * live-multi-survey:reveal (stepMode 전용)
   * phase: open → revealed
   */
  ipcMain.handle('live-multi-survey:reveal', (): void => {
    if (!session || !session.stepMode) return;
    if (session.phase !== 'open') return;

    session.phase = 'revealed';
    broadcastState(session);
    emitPhaseChanged(mainWindow, session);

    // 현재 문항이 text 타입이면 교사에게 이름-텍스트 매핑 송신
    const question = session.questions[session.currentQuestionIndex];
    if (question && question.type === 'text') {
      const entries = collectTextAnswerDetail(session, session.currentQuestionIndex);
      sendToMain(mainWindow, 'live-multi-survey:text-answer-detail', {
        questionIndex: session.currentQuestionIndex,
        entries,
      });
    }
  });

  /**
   * live-multi-survey:advance (stepMode 전용)
   * phase: revealed → (다음 문항 open) 또는 마지막이면 ended
   */
  ipcMain.handle('live-multi-survey:advance', (): void => {
    if (!session || !session.stepMode) return;
    if (session.phase !== 'revealed') return;

    const nextIndex = session.currentQuestionIndex + 1;
    if (nextIndex >= session.questions.length) {
      session.phase = 'ended';
    } else {
      session.currentQuestionIndex = clampIndex(nextIndex, session.questions.length);
      session.phase = 'open';
    }
    broadcastState(session);
    emitPhaseChanged(mainWindow, session);
  });

  /**
   * live-multi-survey:prev (stepMode 전용)
   * currentQuestionIndex > 0 일 때 이전 문항의 revealed 로 이동
   */
  ipcMain.handle('live-multi-survey:prev', (): void => {
    if (!session || !session.stepMode) return;
    if (session.currentQuestionIndex <= 0) return;

    session.currentQuestionIndex = clampIndex(
      session.currentQuestionIndex - 1,
      session.questions.length,
    );
    session.phase = 'revealed';
    broadcastState(session);
    emitPhaseChanged(mainWindow, session);
  });

  /**
   * live-multi-survey:reopen (stepMode 전용)
   * phase: revealed → open (응답 더 받기)
   */
  ipcMain.handle('live-multi-survey:reopen', (): void => {
    if (!session || !session.stepMode) return;
    if (session.phase !== 'revealed') return;

    session.phase = 'open';
    broadcastState(session);
    emitPhaseChanged(mainWindow, session);
  });

  /**
   * live-multi-survey:end-session (stepMode 전용)
   * 즉시 ended 로 전이하고 세션을 정리한다.
   */
  ipcMain.handle('live-multi-survey:end-session', (): void => {
    if (!session || !session.stepMode) return;

    session.phase = 'ended';
    broadcastState(session);
    emitPhaseChanged(mainWindow, session);
    // 세션 최종 정리
    closeSession();
  });

  /**
   * live-multi-survey:tunnel-available — cloudflared 바이너리 설치 여부
   */
  ipcMain.handle('live-multi-survey:tunnel-available', (): boolean => {
    return isTunnelAvailable();
  });

  /**
   * live-multi-survey:tunnel-install — cloudflared 바이너리 다운로드 (첫 사용 시)
   */
  ipcMain.handle('live-multi-survey:tunnel-install', async (): Promise<void> => {
    await installTunnel();
  });

  /**
   * live-multi-survey:tunnel-start — Cloudflare 터널 시작
   * 로컬 서버가 이미 실행 중이어야 한다.
   * @returns { tunnelUrl } 공개 HTTPS URL
   */
  ipcMain.handle('live-multi-survey:tunnel-start', async (): Promise<{ tunnelUrl: string }> => {
    if (!session) throw new Error('복수 설문 세션이 없습니다');
    const address = session.server.address();
    if (!address || typeof address === 'string') throw new Error('서버가 준비되지 않았습니다');
    const tunnelUrl = await openTunnel(address.port);
    return { tunnelUrl };
  });
}
