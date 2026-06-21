/**
 * AI 브릿지 live-sync 쓰기 서버 — 127.0.0.1 전용 loopback 제어 서버.
 *
 * 외부 AI 브릿지가 쌤핀 "실행 중"에 일정·할일을 안전하게 쓰도록, main process 가 loopback 창구를 연다.
 * 받은 쓰기는 렌더러 store 액션으로 위임(applyWrite 델리게이트)해 메모리 상태에 반영시키므로,
 * 렌더러의 다음 저장이 덮어쓰지 않는다(write.ts 직접쓰기의 한계 해소). 인증·검증은 순수 코어에 위임.
 *
 * 보안: 0.0.0.0(학생용 서버)과 달리 반드시 127.0.0.1 바인드(LAN 비노출) + 토큰 + Origin 거부.
 * applyWrite 델리게이트(렌더러 위임)는 main.ts 가 주입한다 — 이 파일은 http/인증/검증/위임 배선만 담당.
 */
import http from 'node:http';
import {
  authorizeWriteRequest,
  generateControlToken,
  removeControlFileIfOwned,
  validateApplyWrite,
  writeControlFile,
  type ApplyWriteRequest,
} from './aiBridgeLiveSyncCore';

const MAX_BODY_BYTES = 64 * 1024;
const DEFAULT_HEARTBEAT_MS = 5_000;

export interface ApplyWriteResult {
  readonly ok: boolean;
  /** 생성/수정된 항목의 비가역 참조(원본 id 아님). */
  readonly ref?: string;
  /** 실패 시 HTTP 상태(충돌=409 등). */
  readonly status?: number;
  readonly error?: string;
}

/** 검증된 쓰기를 렌더러 store 에 적용하고 결과를 돌려주는 위임(main.ts 주입). */
export type ApplyWriteDelegate = (req: ApplyWriteRequest) => Promise<ApplyWriteResult>;

export interface LiveSyncServerHandle {
  readonly port: number;
  readonly token: string;
  readonly stop: () => Promise<void>;
}

function headerValue(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(text);
}

function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  expectedToken: string,
  applyWrite: ApplyWriteDelegate,
): void {
  const auth = authorizeWriteRequest({
    method: req.method,
    token: headerValue(req.headers['x-ssampin-token']),
    expectedToken,
    origin: headerValue(req.headers['origin']),
  });
  if (!auth.ok) {
    sendJson(res, auth.status, { error: auth.reason });
    return;
  }

  // #6: 본문은 Buffer 로 누적하고 한도는 '바이트' 기준으로 검사한다(글자수 아님).
  //   - body.length(UTF-16 글자수)로 비교하면 한글(글자당 3바이트)이 64KB 한도를 우회한다.
  //   - chunk.toString() 을 청크마다 부르면 멀티바이트 문자가 청크 경계에서 깨질 수 있어(mojibake),
  //     decode 는 end 에서 Buffer.concat 후 한 번만 한다.
  const chunks: Buffer[] = [];
  let bodyBytes = 0;
  let aborted = false;
  req.on('data', (chunk: Buffer) => {
    if (aborted) return;
    chunks.push(chunk);
    bodyBytes += chunk.length;
    if (bodyBytes > MAX_BODY_BYTES) {
      aborted = true;
      sendJson(res, 413, { error: '본문이 너무 큽니다.' });
      req.destroy();
    }
  });
  req.on('end', () => {
    if (aborted) return;
    const body = Buffer.concat(chunks).toString('utf-8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      sendJson(res, 400, { error: 'JSON 파싱 실패' });
      return;
    }
    const validated = validateApplyWrite(parsed);
    if (!validated.ok) {
      sendJson(res, 400, { error: validated.reason });
      return;
    }
    applyWrite(validated.value)
      .then((result) => sendJson(res, result.ok ? 200 : (result.status ?? 409), result))
      .catch(() => sendJson(res, 500, { ok: false, error: '쓰기 적용 중 오류' }));
  });
}

/**
 * loopback live-sync 서버 시작. 127.0.0.1 임의 포트에 listen 하고, control.json 에 포트·토큰·pid·heartbeat 를
 * 주기적으로 기록(브릿지가 읽어 "앱 실행 중" 판정). stop() 으로 서버 종료 + control.json 제거.
 */
export function startLiveSyncServer(opts: {
  readonly dataDir: string;
  readonly applyWrite: ApplyWriteDelegate;
  readonly heartbeatMs?: number;
}): Promise<LiveSyncServerHandle> {
  const token = generateControlToken();
  const server = http.createServer((req, res) => handleRequest(req, res, token, opts.applyWrite));

  return new Promise<LiveSyncServerHandle>((resolve, reject) => {
    server.on('error', reject);
    // 반드시 127.0.0.1(루프백) — 학생용 서버(0.0.0.0)와 달리 외부 노출 금지.
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = addr && typeof addr === 'object' ? addr.port : 0;
      const beat = (): void => {
        try {
          writeControlFile(opts.dataDir, {
            port,
            token,
            pid: process.pid,
            heartbeatAt: Date.now(),
          });
        } catch {
          /* 디스크 일시 오류는 다음 주기에 재시도 */
        }
      };
      beat();
      const interval = setInterval(beat, opts.heartbeatMs ?? DEFAULT_HEARTBEAT_MS);
      if (typeof interval.unref === 'function') interval.unref();
      resolve({
        port,
        token,
        stop: () =>
          new Promise<void>((done) => {
            clearInterval(interval);
            // #3: 서버를 먼저 닫아(새 쓰기 유입 차단) control 을 나중에 제거한다.
            //   control 을 먼저 지우면 브릿지가 'absent→직접 파일쓰기'로 오판하고, 종료 중 아직
            //   살아있는 렌더러의 마지막 저장(CAS 없음)이 그 직접쓰기를 덮어써 "추가됨"으로 안내한
            //   항목이 소리 없이 유실될 수 있다. 또한 제거는 '내 token 일 때만' 한다 — off→on 재시작 레이스에서
            //   이미 뜬 새 서버의 control 을 지워 absent 로 만들지 않게(removeControlFileIfOwned).
            server.close(() => {
              removeControlFileIfOwned(opts.dataDir, token);
              done();
            });
          }),
      });
    });
  });
}
