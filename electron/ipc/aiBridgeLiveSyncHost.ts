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
import { randomUUID } from 'node:crypto';
import {
  startLiveSyncServer,
  type ApplyWriteResult,
  type LiveSyncServerHandle,
} from './aiBridgeLiveSync';
import { readCapability, mergeCapability, type ApplyWriteRequest } from './aiBridgeLiveSyncCore';

const APPLY_TIMEOUT_MS = 10_000;
const IDEMPOTENCY_WINDOW_MS = 60_000;

export interface LiveSyncHostDeps {
  /** 현재 메인 창(없으면 null). 위임은 항상 이 단일 창으로만 보낸다. */
  readonly getMainWindow: () => BrowserWindow | null;
  readonly dataDir: string;
}

export interface LiveSyncHost {
  readonly stop: () => Promise<void>;
}

/**
 * live-sync 호스트 등록. ipcMain 핸들러(결과 회신·토글·상태)를 걸고, capability.allowWrite 면 서버를 시작한다.
 * 반환 stop() 은 앱 종료 시 호출.
 */
export function registerLiveSyncHost(deps: LiveSyncHostDeps): LiveSyncHost {
  const pending = new Map<string, (r: ApplyWriteResult) => void>();
  const recentKeys = new Map<string, number>();
  let handle: LiveSyncServerHandle | null = null;
  let starting = false;

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
    for (const [k, t] of recentKeys) if (now - t > IDEMPOTENCY_WINDOW_MS) recentKeys.delete(k);
    if (recentKeys.has(req.idempotencyKey)) return { ok: true, ref: req.idempotencyKey };

    const win = deps.getMainWindow();
    if (!win || win.isDestroyed()) return { ok: false, status: 503, error: '메인 창이 없습니다.' };

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
    if (result.ok) recentKeys.set(req.idempotencyKey, now);
    return result;
  };

  async function startServer(): Promise<void> {
    if (handle || starting) return;
    starting = true;
    try {
      handle = await startLiveSyncServer({ dataDir: deps.dataDir, applyWrite });
    } catch (err) {
      console.error('[aiBridge] live-sync 서버 시작 실패:', err);
    } finally {
      starting = false;
    }
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
  };
  function capabilityStatus(): CapabilityStatus {
    const caps = readCapability(deps.dataDir);
    return {
      running: handle !== null,
      allowWrite: caps.allowWrite,
      allowContent: caps.allowContent,
      allowGradeWrite: caps.allowGradeWrite,
    };
  }

  /**
   * 게이트 토글을 capability.json 에 즉시 기록(설정 카드의 읽기/쓰기/채점쓰기 공통 창구). 부분 갱신을
   * 이전 값과 병합해 쓴다. 브릿지는 매 호출 capability 를 새로 읽으므로 [연결] 재등록·클라 재시작 없이
   * 즉시 반영된다(#11). allowWrite 가 켜지면 loopback 서버를 시작(실시간 일정·할일 쓰기), 꺼지면 정지한다.
   */
  async function applyCapability(partial: {
    allowWrite?: boolean;
    allowContent?: boolean;
    allowGradeWrite?: boolean;
  }): Promise<CapabilityStatus> {
    // 부분 갱신 — 다른 기능의 토글(allowRecordWrite 등 이 타입이 모르는 필드)도 보존(클로버 방지).
    const next = mergeCapability(deps.dataDir, partial);
    if (next.allowWrite) await startServer();
    else await stopServer();
    return capabilityStatus();
  }

  // 토글: 읽기/쓰기/채점쓰기를 capability 에 즉시 기록(부분 갱신). true 일 때만 게이트를 켠다(런타임 타입 방어).
  ipcMain.handle(
    'aiBridge:setCapability',
    async (
      _e,
      partial: { allowWrite?: unknown; allowContent?: unknown; allowGradeWrite?: unknown },
    ): Promise<CapabilityStatus> => {
      const p: { allowWrite?: boolean; allowContent?: boolean; allowGradeWrite?: boolean } = {};
      if (typeof partial?.allowWrite === 'boolean') p.allowWrite = partial.allowWrite;
      if (typeof partial?.allowContent === 'boolean') p.allowContent = partial.allowContent;
      if (typeof partial?.allowGradeWrite === 'boolean')
        p.allowGradeWrite = partial.allowGradeWrite;
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
  if (readCapability(deps.dataDir).allowWrite) void startServer();

  return { stop: stopServer };
}
