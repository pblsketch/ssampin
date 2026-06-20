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
import { readCapability, writeCapability, type ApplyWriteRequest } from './aiBridgeLiveSyncCore';

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

  // 토글: 설정에서 쓰기 허용을 켜고/끄면 capability 기록 + 서버 시작/정지.
  ipcMain.handle(
    'aiBridge:setLiveSync',
    async (_e, enabled: unknown): Promise<{ running: boolean }> => {
      const allowWrite = enabled === true;
      const prev = readCapability(deps.dataDir);
      writeCapability(deps.dataDir, {
        allowWrite,
        allowContent: prev.allowContent,
        updatedAt: Date.now(),
      });
      if (allowWrite) await startServer();
      else await stopServer();
      return { running: handle !== null };
    },
  );

  ipcMain.handle('aiBridge:liveSyncStatus', (): { running: boolean; allowWrite: boolean } => ({
    running: handle !== null,
    allowWrite: readCapability(deps.dataDir).allowWrite,
  }));

  // 시작 시 capability 가 이미 켜져 있으면 서버 자동 시작(기본 OFF 라 보통은 무동작).
  if (readCapability(deps.dataDir).allowWrite) void startServer();

  return { stop: stopServer };
}
