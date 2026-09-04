/**
 * "내 AI로 실행" — 선생님 본인 구독 CLI 로 답을 받아 오는 어댑터.
 *
 * 기존 `AssistPort` 와 **같은 모양**으로 답한다. 그래서 패널·카드·이력 코드가 하나도 안 바뀐다.
 *
 * ★쌤핀 AI(Solar) 경로와 결정적으로 다른 점: 도구 실행이 **CLI 안에서 끝난다.**
 * Solar 경로는 모델이 고른 도구를 렌더러가 실행해 다시 물어보지만, 여기서는 CLI 가
 * 브릿지 MCP 를 직접 부르고 결과까지 반영한 문장을 준다. 그래서 `toolCalls` 를 비워 돌려준다 —
 * 화면이 "또 도구를 실행해야 하나?" 하고 되묻지 않게.
 *
 * ★서버(Supabase)를 부르지 않는다. 이 경로는 100% 로컬이다.
 */
import type { AssistAnswer, AssistPort, AssistRequestPayload } from '@domain/ports/AssistPort';
import type { OwnAiProviderId, OwnAiRunEvent } from '@domain/entities/OwnAiProvider';
import { OWN_AI_ERROR_MESSAGES } from '@domain/rules/ownAiCliRules';

/** 실행 실패를 그대로 던진다 — 합성 포트가 이걸 보고 폴백할지 정한다. */
export class OwnAiRunError extends Error {
  constructor(
    readonly kind: OwnAiRunEvent extends { type: 'error'; kind: infer K } ? K : never,
    message: string,
  ) {
    super(message);
    this.name = 'OwnAiRunError';
  }
}

/** preload 가 노출하는 통로. 없으면(브라우저 모드) 이 포트를 쓸 수 없다. */
interface OwnAiBridgeApi {
  run(payload: {
    runId: string;
    provider: OwnAiProviderId;
    kind: 'panel' | 'draft';
    prompt: string;
    appendSystemPrompt?: string;
  }): Promise<{ ok: boolean; reason?: string }>;
  cancel(runId: string): void;
  onEvent(handler: (event: unknown) => void): () => void;
}

function bridgeApi(): OwnAiBridgeApi | null {
  const api = (globalThis as { electronAPI?: { ownAi?: OwnAiBridgeApi } }).electronAPI?.ownAi;
  return api ?? null;
}

function newRunId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 마지막 사용자 질문만 뽑는다 — CLI 는 매 실행이 새 대화라 이력을 다시 보내지 않는다. */
function lastUserQuestion(payload: AssistRequestPayload): string {
  for (let i = payload.turns.length - 1; i >= 0; i -= 1) {
    const t = payload.turns[i];
    if (t && t.role === 'user') return t.content;
  }
  return '';
}

export interface OwnAiAssistPortOptions {
  readonly provider: OwnAiProviderId;
  /** 시스템 프롬프트 뒤에 붙일 지시 + 별칭 대응 힌트(호출부가 만든다). */
  readonly appendSystemPrompt?: string;
  /** 남은 사용량을 화면이 알고 싶을 때. */
  readonly onUsage?: (fiveHourUtilization: number | null, resetsAt: number | null) => void;
  /** 글자가 흐르는 동안 보여 주고 싶을 때. */
  readonly onDelta?: (text: string) => void;
}

export class OwnAiAssistPort implements AssistPort {
  constructor(private readonly options: OwnAiAssistPortOptions) {}

  async ask(payload: AssistRequestPayload): Promise<AssistAnswer> {
    const api = bridgeApi();
    if (!api) {
      throw new OwnAiRunError('not-installed', OWN_AI_ERROR_MESSAGES['not-installed'].panel);
    }

    const runId = newRunId();
    const question = lastUserQuestion(payload);

    return new Promise<AssistAnswer>((resolve, reject) => {
      let settled = false;
      const off = api.onEvent((raw) => {
        const ev = raw as OwnAiRunEvent;
        if (!ev || ev.runId !== runId) return;

        if (ev.type === 'usage') {
          this.options.onUsage?.(ev.fiveHourUtilization, ev.resetsAt);
          return;
        }
        if (ev.type === 'delta') {
          this.options.onDelta?.(ev.text);
          return;
        }
        if (ev.type === 'done') {
          settled = true;
          off();
          // 도구는 CLI 안에서 이미 실행됐다 — 화면이 다시 실행하지 않게 비워 보낸다.
          resolve({ text: ev.text, degraded: null, toolCalls: [] });
          return;
        }
        if (ev.type === 'error') {
          settled = true;
          off();
          reject(new OwnAiRunError(ev.kind, OWN_AI_ERROR_MESSAGES[ev.kind].panel));
        }
      });

      void api
        .run({
          runId,
          provider: this.options.provider,
          kind: 'panel',
          prompt: question,
          ...(this.options.appendSystemPrompt
            ? { appendSystemPrompt: this.options.appendSystemPrompt }
            : {}),
        })
        .then((r) => {
          // 시작조차 못 했으면 이벤트가 안 온다 — 여기서 끝낸다.
          if (!r.ok && !settled) {
            settled = true;
            off();
            const kind = r.reason === 'write-server-unavailable' ? r.reason : 'crashed';
            reject(new OwnAiRunError(kind, OWN_AI_ERROR_MESSAGES[kind].panel));
          }
        })
        .catch((e: unknown) => {
          if (settled) return;
          settled = true;
          off();
          reject(
            e instanceof Error
              ? e
              : new OwnAiRunError('crashed', OWN_AI_ERROR_MESSAGES.crashed.panel),
          );
        });
    });
  }
}
