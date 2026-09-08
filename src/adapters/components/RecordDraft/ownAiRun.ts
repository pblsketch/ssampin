/**
 * 구독 AI(Claude Code·Codex) CLI 를 한 번 돌려 답 한 편을 받는 얇은 다리 — AI 초안 패널과
 * 근거 정리 보드(AI 분류 제안), 분량 조절이 같은 것을 쓴다.
 *
 * [중단](2026-09-08, R-6): `signal` 을 주면 abort 시 main 에 취소를 알린다. 러너가 프로세스를 죽이고
 * `error/cancelled` 를 흘리므로 약속은 그 이벤트로 거절된다 — 여기서 따로 거절하지 않는다.
 */
import type { OwnAiErrorKind, OwnAiRunEvent } from '@domain/entities/OwnAiProvider';

export interface OwnAiRunApi {
  run(payload: {
    runId: string;
    provider: 'claude' | 'codex';
    kind: 'panel' | 'draft';
    prompt: string;
    appendSystemPrompt?: string;
  }): Promise<{ ok: boolean; reason?: string }>;
  /** 진행 중 실행 멈추기. 옛 preload 에는 없을 수 있어 선택이다. */
  cancel?(runId: string): void;
  onEvent(handler: (event: unknown) => void): () => void;
}

export function runApi(): OwnAiRunApi | null {
  const api = (globalThis as { electronAPI?: { ownAi?: OwnAiRunApi } }).electronAPI?.ownAi;
  return api ?? null;
}

function newRunId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** CLI 를 한 번 돌려 답을 받는다. 실패하면 갈래(`OwnAiErrorKind`)를 담아 던진다. */
export async function askOnce(
  api: OwnAiRunApi,
  provider: 'claude' | 'codex',
  prompt: string,
  appendSystemPrompt?: string,
  signal?: AbortSignal,
): Promise<string> {
  const runId = newRunId();
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const onAbort = (): void => {
      // 이미 끝났으면 할 일이 없다. 아직이면 main 에 알린다 — 거절은 cancelled 이벤트가 한다.
      if (settled) return;
      if (api.cancel) {
        api.cancel(runId);
      } else {
        settled = true;
        off();
        reject('cancelled' satisfies OwnAiErrorKind);
      }
    };
    const off = api.onEvent((raw) => {
      const ev = raw as OwnAiRunEvent;
      if (!ev || ev.runId !== runId) return;
      if (ev.type === 'done') {
        settled = true;
        off();
        signal?.removeEventListener('abort', onAbort);
        resolve(ev.text);
      } else if (ev.type === 'error') {
        settled = true;
        off();
        signal?.removeEventListener('abort', onAbort);
        reject(ev.kind);
      }
    });
    if (signal) {
      if (signal.aborted) {
        settled = true;
        off();
        reject('cancelled' satisfies OwnAiErrorKind);
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }
    void api
      .run({
        runId,
        provider,
        kind: 'draft',
        prompt,
        ...(appendSystemPrompt === undefined ? {} : { appendSystemPrompt }),
      })
      .then((r) => {
        if (!r.ok && !settled) {
          settled = true;
          off();
          signal?.removeEventListener('abort', onAbort);
          reject('crashed' satisfies OwnAiErrorKind);
        }
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        off();
        signal?.removeEventListener('abort', onAbort);
        reject('crashed' satisfies OwnAiErrorKind);
      });
  });
}
