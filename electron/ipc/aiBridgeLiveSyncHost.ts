/**
 * AI 브릿지 live-sync 호스트 — main process 배선(서버 수명·렌더러 위임·토글).
 *
 * 안전: 서버는 capability.json 의 allowWrite 가 켜진 경우에만 뜬다(기본 OFF → 완전 무동작).
 * 켜지면 127.0.0.1 loopback 서버를 시작하고, 받은 쓰기를 **단일 메인 창**에 위임해 store 액션으로 적용시킨다.
 *
 * codex 원검토 4 BLOCKING 대응:
 *  - 단일 창 위임: 항상 getMainWindow() 한 곳에만 send.
 *  - ACK: 렌더러가 store→data:write 적용 후 결과를 회신할 때까지 await(타임아웃 504).
 *  - 멱등성: 최근 적용된 idempotencyKey 는 재요청 시 중복 적용하지 않음(인메모리 60s 윈도).
 *  - 게이트: env 가 아니라 capability 파일(설정 토글이 기록)로 통제.
 */
import { ipcMain, type BrowserWindow } from 'electron';
import { randomUUID, createHash } from 'node:crypto';
import {
  startLiveSyncServer,
  type ApplyWriteResult,
  type LiveSyncServerHandle,
} from './aiBridgeLiveSync';
import {
  readCapability,
  mergeCapability,
  isDomainWriteAllowed,
  type ApplyWriteRequest,
} from './aiBridgeLiveSyncCore';
import {
  isOwnAiActive,
  OWN_AI_WRITE_PENDING_MESSAGE,
  OWN_AI_WRITE_PENDING_STATUS,
} from '../../src/domain/rules/ownAiWriteGate';

const APPLY_TIMEOUT_MS = 10_000;
const IDEMPOTENCY_WINDOW_MS = 60_000;

/** 멱등 dedup 의 내용 결합용 해시 — 같은 키라도 내용이 다르면 다른 hash → 삼키지 않는다(#7). */
function idemHash(req: ApplyWriteRequest): string {
  return createHash('sha256')
    .update(`${req.domain}:${req.op}:${JSON.stringify(req.data)}`)
    .digest('hex')
    .slice(0, 16);
}

export interface LiveSyncHostDeps {
  /** 현재 메인 창(없으면 null). 위임은 항상 이 단일 창으로만 보낸다. */
  readonly getMainWindow: () => BrowserWindow | null;
  readonly dataDir: string;
  /**
   * "내 AI로 실행"이 활성인 시각(epoch ms). 지금이 이 값보다 이르면 활성이다.
   *
   * 활성 중에 온 쓰기는 **저장하지 않고 제안으로 바꾼다** — 선생님이 화면에서 [실행]을
   * 눌러야 저장된다(ADR-082 C3′). 없으면 항상 비활성으로 본다(기존 동작 그대로).
   */
  readonly ownAiActiveUntil?: () => number;
}

/** `ensureServer()` 가 돌려주는 판정. "내 AI로 실행" 러너가 spawn 여부를 이걸로 정한다. */
export interface LiveSyncReadiness {
  /** 쓰기·생기부·채점 토글 중 하나라도 켜져 있어 loopback 서버가 필요한가. */
  readonly needsServer: boolean;
  /** 필요하다면, 실제로 떠 있는가. */
  readonly ready: boolean;
}

export interface LiveSyncHost {
  readonly stop: () => Promise<void>;
  /**
   * 서버가 필요하면 **직접 띄우고** 결과를 돌려준다.
   *
   * ★`control.json` 을 읽어 판정하면 안 된다 — 앞선 인스턴스가 크래시하면 파일이 남아
   * "떠 있다"고 잘못 답한다. 살아 있는 핸들만 진실이다.
   *
   * ★`startServer` 는 실패를 삼키고 아무도 다시 부르지 않는다. 부팅 때 listen 이 실패하면
   * 토글을 껐다 켜기 전에는 영영 안 뜬다 — 그래서 여기서 **시작까지 책임진다**.
   */
  readonly ensureServer: () => Promise<LiveSyncReadiness>;
}

/**
 * live-sync 호스트 등록. ipcMain 핸들러(결과 회신·토글·상태)를 걸고, capability.allowWrite 면 서버를 시작한다.
 * 반환 stop() 은 앱 종료 시 호출.
 */
export function registerLiveSyncHost(deps: LiveSyncHostDeps): LiveSyncHost {
  const pending = new Map<string, (r: ApplyWriteResult) => void>();
  const recentKeys = new Map<string, { at: number; hash: string }>();
  let handle: LiveSyncServerHandle | null = null;

  // 렌더러 → main 결과 회신(요청 id 로 correlation).
  ipcMain.on(
    'aiBridge:apply-write-result',
    (_e, payload: { requestId?: unknown; result?: unknown }) => {
      const requestId = typeof payload?.requestId === 'string' ? payload.requestId : '';
      const resolve = pending.get(requestId);
      if (resolve) {
        pending.delete(requestId);
        resolve(
          (payload?.result as ApplyWriteResult) ?? { ok: false, status: 500, error: '결과 없음' },
        );
      }
    },
  );

  const applyWrite = async (req: ApplyWriteRequest): Promise<ApplyWriteResult> => {
    const now = Date.now();
    for (const [k, v] of recentKeys) if (now - v.at > IDEMPOTENCY_WINDOW_MS) recentKeys.delete(k);
    // #7: 같은 키라도 내용(payloadHash)이 다르면 dedup 하지 않는다 — 같은 키 + 다른 내용을 "이미 처리됨"
    //   으로 삼키지 않게(토큰 보유 로컬 호출자가 키를 재사용해도 정상 쓰기가 통과).
    const hash = idemHash(req);
    const seen = recentKeys.get(req.idempotencyKey);
    if (seen && seen.hash === hash) return { ok: true, ref: req.idempotencyKey };

    // 도메인별 게이트 재강제(fail-closed) — 서버는 allowWrite 또는 allowRecordWrite 중 하나만 켜져도
    // 뜨므로, "서버 가동"이 곧 "이 쓰기 허용"을 뜻하지 않는다(isDomainWriteAllowed 단일 판정).
    if (!isDomainWriteAllowed(req.domain, readCapability(deps.dataDir))) {
      return { ok: false, status: 403, error: '이 쓰기 권한이 비활성화되어 있습니다.' };
    }

    const win = deps.getMainWindow();
    if (!win || win.isDestroyed()) return { ok: false, status: 503, error: '메인 창이 없습니다.' };

    /*
     * ★"내 AI로 실행" 중이면 저장하지 않고 **제안만** 남기고 즉시 답한다.
     *
     * 도구 호출을 열어 둔 채 승인을 기다릴 수는 없다 — 브릿지 쪽 12초, 이쪽 10초가
     * 번들에 박힌 상수라 120초짜리 승인을 버틸 수 없고, 늦게 온 [실행]은 결과가 버려져
     * "모델은 실패했다는데 파일은 바뀐" 분열이 생긴다(ADR-082 C3′).
     *
     * 도메인 게이트(위 403) 뒤에 둔다 — 애초에 허용되지 않은 쓰기는 카드도 띄우지 않는다.
     */
    if (isOwnAiActive(deps.ownAiActiveUntil?.() ?? 0, now)) {
      win.webContents.send('ownAi:write-proposal', {
        proposalId: randomUUID(),
        request: req,
        source: 'unknown',
      });
      return {
        ok: false,
        status: OWN_AI_WRITE_PENDING_STATUS,
        error: OWN_AI_WRITE_PENDING_MESSAGE,
      };
    }

    const requestId = randomUUID();
    const result = await new Promise<ApplyWriteResult>((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        resolve({ ok: false, status: 504, error: '렌더러 응답 시간초과' });
      }, APPLY_TIMEOUT_MS);
      pending.set(requestId, (r) => {
        clearTimeout(timer);
        resolve(r);
      });
      win.webContents.send('aiBridge:apply-write', { requestId, req });
    });
    if (result.ok) recentKeys.set(req.idempotencyKey, { at: now, hash });
    return result;
  };

  /**
   * 시작 중인 호출을 들고 있는다.
   *
   * ★예전에는 `starting` 플래그만 보고 **곧바로 돌아왔다.** 그러면 부팅 시 자동 시작
   * (`void startServer()`)과 겹친 호출이 "아직 안 떴다"를 보고 실패로 판정한다.
   * 진행 중인 약속을 기다리게 해야 같은 답을 얻는다.
   */
  let startPromise: Promise<void> | null = null;

  async function startServer(): Promise<void> {
    if (handle) return;
    if (startPromise) return startPromise;
    startPromise = (async () => {
      try {
        handle = await startLiveSyncServer({ dataDir: deps.dataDir, applyWrite });
      } catch (err) {
        console.error('[aiBridge] live-sync 서버 시작 실패:', err);
      } finally {
        startPromise = null;
      }
    })();
    return startPromise;
  }

  /** 서버가 필요한 상태인가 — 쓰기·생기부·**채점** 중 하나라도 켜져 있으면 필요하다. */
  function needsLoopbackServer(): boolean {
    const caps = readCapability(deps.dataDir);
    // ★채점(allowGradeWrite)을 빠뜨리면 안 된다. 채점 쓰기는 loopback 을 거치지 않고
    //   앱이 없을 때 파일에 직접 쓰므로, 서버가 떠 있어야 브릿지가 거부한다.
    return caps.allowWrite || caps.allowRecordWrite || caps.allowGradeWrite;
  }

  async function ensureServer(): Promise<LiveSyncReadiness> {
    if (!needsLoopbackServer()) return { needsServer: false, ready: handle !== null };
    if (!handle) await startServer();
    return { needsServer: true, ready: handle !== null };
  }

  async function stopServer(): Promise<void> {
    const h = handle;
    handle = null;
    if (h) await h.stop();
  }

  /** capability 상태 + 서버 가동 여부(렌더러 응답 공통 형태). */
  type CapabilityStatus = {
    running: boolean;
    allowWrite: boolean;
    allowContent: boolean;
    allowGradeWrite: boolean;
    allowRecordWrite: boolean;
  };
  function capabilityStatus(): CapabilityStatus {
    const caps = readCapability(deps.dataDir);
    return {
      running: handle !== null,
      allowWrite: caps.allowWrite,
      allowContent: caps.allowContent,
      allowGradeWrite: caps.allowGradeWrite,
      allowRecordWrite: caps.allowRecordWrite,
    };
  }

  /**
   * 게이트 토글을 capability.json 에 즉시 기록(설정 카드의 읽기/쓰기/채점쓰기/생기부쓰기 공통 창구). 부분
   * 갱신을 이전 값과 병합해 쓴다. 브릿지는 매 호출 capability 를 새로 읽으므로 [연결] 재등록·클라 재시작
   * 없이 즉시 반영된다(#11). 쓰기(allowWrite) 또는 생기부 쓰기(allowRecordWrite)가 켜지면 loopback 서버를
   * 시작한다 — 서버가 control.json 을 광고해야 브릿지가 "앱 실행 중"을 인지하고 loopback 위임(메모리 반영)
   * 으로 안전하게 쓴다(서버가 없으면 브릿지가 앱을 닫힘으로 보고 직접 파일쓰기 → 실행 중 덮어쓰기 위험).
   */
  async function applyCapability(partial: {
    allowWrite?: boolean;
    allowContent?: boolean;
    allowGradeWrite?: boolean;
    allowRecordWrite?: boolean;
  }): Promise<CapabilityStatus> {
    // 부분 갱신 — 다른 기능의 토글(이 함수가 모르는 필드)도 보존(클로버 방지).
    const next = mergeCapability(deps.dataDir, partial);
    // ★채점(allowGradeWrite)도 서버가 필요하다 — 채점 쓰기는 loopback 을 거치지 않고
    //   앱이 없을 때 파일에 직접 쓴다. 서버가 떠 있어야 브릿지가 거부한다.
    if (next.allowWrite || next.allowRecordWrite || next.allowGradeWrite) await startServer();
    else await stopServer();
    return capabilityStatus();
  }

  // 토글: 읽기/쓰기/채점쓰기/생기부쓰기를 capability 에 즉시 기록(부분 갱신). true 일 때만 게이트 ON(런타임 타입 방어).
  ipcMain.handle(
    'aiBridge:setCapability',
    async (
      _e,
      partial: {
        allowWrite?: unknown;
        allowContent?: unknown;
        allowGradeWrite?: unknown;
        allowRecordWrite?: unknown;
      },
    ): Promise<CapabilityStatus> => {
      const p: {
        allowWrite?: boolean;
        allowContent?: boolean;
        allowGradeWrite?: boolean;
        allowRecordWrite?: boolean;
      } = {};
      if (typeof partial?.allowWrite === 'boolean') p.allowWrite = partial.allowWrite;
      if (typeof partial?.allowContent === 'boolean') p.allowContent = partial.allowContent;
      if (typeof partial?.allowGradeWrite === 'boolean')
        p.allowGradeWrite = partial.allowGradeWrite;
      if (typeof partial?.allowRecordWrite === 'boolean')
        p.allowRecordWrite = partial.allowRecordWrite;
      return applyCapability(p);
    },
  );

  // 하위호환: 기존 setLiveSync(enabled) = 쓰기 허용 토글. setCapability 로 위임.
  ipcMain.handle(
    'aiBridge:setLiveSync',
    async (_e, enabled: unknown): Promise<{ running: boolean }> => {
      const status = await applyCapability({ allowWrite: enabled === true });
      return { running: status.running };
    },
  );

  ipcMain.handle('aiBridge:liveSyncStatus', (): CapabilityStatus => capabilityStatus());

  // 시작 시 capability 가 이미 켜져 있으면 서버 자동 시작(기본 OFF 라 보통은 무동작).
  {
    const caps = readCapability(deps.dataDir);
    if (caps.allowWrite || caps.allowRecordWrite || caps.allowGradeWrite) void startServer();
  }

  return { stop: stopServer, ensureServer };
}
