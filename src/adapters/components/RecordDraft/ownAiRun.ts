/**
 * 구독 AI(Claude Code·Codex) CLI 를 한 번 돌려 답 한 편을 받는 얇은 다리 — AI 초안 패널과
 * 근거 정리 보드(AI 분류 제안), 분량 조절이 같은 것을 쓴다.
 *
 * [중단](2026-09-08, R-6): `signal` 을 주면 abort 시 main 에 취소를 알린다. 러너가 프로세스를 죽이고
 * `error/cancelled` 를 흘리므로 약속은 그 이벤트로 거절된다 — 여기서 따로 거절하지 않는다.
 */
import type { OwnAiErrorKind, OwnAiRunEvent } from '@domain/entities/OwnAiProvider';
import type { AiRunProviderId } from '@domain/entities/ApiKeyProvider';
import { isOwnAiErrorKind } from '@domain/rules/ownAiCliRules';

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

/**
 * 내 API 키로 한 번 묻는다(ADR-143). 규정(1층)은 시스템 지시로, 근거 묶음은 사용자 글로 보낸다 —
 * CLI 의 `--append-system-prompt` + 질문과 같은 자리다. 실패하면 갈래를 담아 던진다.
 */
async function askApiKeyOnce(
  prompt: string,
  appendSystemPrompt: string | undefined,
  signal: AbortSignal | undefined,
): Promise<string> {
  const api = typeof window === 'undefined' ? undefined : window.electronAPI?.apiKey;
  if (!api) throw 'key-missing' satisfies OwnAiErrorKind;
  if (signal?.aborted) throw 'cancelled' satisfies OwnAiErrorKind;
  const requestId = `draft-${newRunId()}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  const onAbort = (): void => {
    void api.cancel(requestId);
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const r = await api.chat({
      requestId,
      purpose: 'draft',
      messages: [
        ...(appendSystemPrompt === undefined || appendSystemPrompt.trim().length === 0
          ? []
          : [{ role: 'system' as const, content: appendSystemPrompt }]),
        { role: 'user' as const, content: prompt },
      ],
    });
    if (!r.ok)
      throw isOwnAiErrorKind(r.reason) ? r.reason : ('key-provider-error' satisfies OwnAiErrorKind);
    return r.text;
  } catch (e) {
    if (typeof e === 'string' && isOwnAiErrorKind(e)) throw e;
    throw 'key-provider-error' satisfies OwnAiErrorKind;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * AI 를 한 번 돌려 답을 받는다. 실패하면 갈래(`OwnAiErrorKind`)를 담아 던진다.
 *
 * `provider` 가 `apikey` 면 구독 CLI 대신 선생님 API 키로 묻는다 — 생기부 초안·근거 정리·
 * 분량 조절이 모두 여기를 지나므로, 이 한 갈래로 모든 AI 기능에서 키를 쓸 수 있다.
 */
export async function askOnce(
  api: OwnAiRunApi,
  provider: AiRunProviderId,
  prompt: string,
  appendSystemPrompt?: string,
  signal?: AbortSignal,
): Promise<string> {
  if (provider === 'apikey') return askApiKeyOnce(prompt, appendSystemPrompt, signal);
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
          reject(isOwnAiErrorKind(r.reason) ? r.reason : ('crashed' satisfies OwnAiErrorKind));
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
