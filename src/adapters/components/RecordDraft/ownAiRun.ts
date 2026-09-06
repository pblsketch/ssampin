/**
 * 구독 AI(Claude Code·Codex) CLI 를 한 번 돌려 답 한 편을 받는 얇은 다리 — AI 초안 패널과
 * 근거 정리 보드(AI 분류 제안)가 같은 것을 쓴다.
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
): Promise<string> {
  const runId = newRunId();
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const off = api.onEvent((raw) => {
      const ev = raw as OwnAiRunEvent;
      if (!ev || ev.runId !== runId) return;
      if (ev.type === 'done') {
        settled = true;
        off();
        resolve(ev.text);
      } else if (ev.type === 'error') {
        settled = true;
        off();
        reject(ev.kind);
      }
    });
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
          reject('crashed' satisfies OwnAiErrorKind);
        }
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        off();
        reject('crashed' satisfies OwnAiErrorKind);
      });
  });
}
