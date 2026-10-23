/**
 * 내 API 키로 AI 서비스를 부르는 쪽 — main 프로세스 안에서만 돈다 (ADR-143).
 *
 * ★키가 나가는 곳은 `API_KEY_SERVICE_ENDPOINTS` 의 고정 주소뿐이다. 보내기 직전에 한 번 더
 *   https·허용 호스트인지 본다. 주소를 만드는 코드가 나중에 바뀌어도 여기서 막힌다.
 * ★`redirect: 'error'` — 서비스가 다른 곳으로 돌려보내면 따라가지 않는다. 따라가면 키가 실린
 *   머리글이 그 주소로 같이 간다.
 * ★오류에서 서비스가 준 본문은 **갈래를 정하는 데만** 쓰고 화면·로그로 보내지 않는다.
 *   로그에는 상태 번호와 갈래만, 그것도 키를 지운 뒤에 남긴다.
 */
import type { ApiKeyServiceId } from '../../src/domain/entities/ApiKeyProvider';
import { API_KEY_SERVICE_ENDPOINTS } from '../../src/domain/entities/ApiKeyProvider';
import type { OwnAiErrorKind } from '../../src/domain/entities/OwnAiProvider';
import {
  classifyApiKeyHttpError,
  redactSecret,
  selectApiKeyModels,
  type RawApiKeyModel,
} from '../../src/domain/rules/apiKeyRules';

/** 키를 실어 보낼 수 있는 호스트. 이 밖으로는 어떤 경우에도 보내지 않는다. */
export const API_KEY_ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  'generativelanguage.googleapis.com',
  'openrouter.ai',
  'opencode.ai',
]);

/** 오픈라우터 키 확인 주소 — 요금이 나가지 않는다 */
const OPENROUTER_KEY_INFO_URL = 'https://openrouter.ai/api/v1/key';

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface ApiKeyClientDeps {
  readonly fetch: FetchLike;
  /** `ssampin/2.5.5` 같은 앱 이름 — 오픈코드가 클라이언트를 알아보게 요구한다 */
  readonly userAgent: string;
  readonly log?: (message: string) => void;
}

export type ApiKeyFailure = { readonly ok: false; readonly reason: OwnAiErrorKind };

export interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface ChatToolSchema {
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: Readonly<Record<string, unknown>>;
  };
}

export interface ChatRequest {
  readonly service: ApiKeyServiceId;
  readonly key: string;
  readonly model: string;
  readonly messages: readonly ChatMessage[];
  readonly tools?: readonly ChatToolSchema[];
  readonly maxTokens: number;
  readonly timeoutMs: number;
  /** 대화마다 같은 값 — 오픈코드가 요구하는 `x-opencode-session` */
  readonly sessionId: string;
  /** [중단] */
  readonly signal?: AbortSignal;
}

export interface ChatToolCall {
  readonly name: string;
  readonly rawArguments: string;
}

export type ChatResult =
  | { readonly ok: true; readonly text: string; readonly toolCalls: readonly ChatToolCall[] }
  | ApiKeyFailure
  | { readonly ok: false; readonly reason: 'cancelled' };

function assertAllowedUrl(url: string): void {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !API_KEY_ALLOWED_HOSTS.has(u.hostname)) {
    throw new Error('[apiKeyClient] 허용되지 않은 주소');
  }
}

function headersFor(
  service: ApiKeyServiceId,
  key: string,
  userAgent: string,
  sessionId: string | null,
): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    'User-Agent': userAgent,
  };
  if (service === 'openrouter') {
    // 오픈라우터 대시보드에서 "어느 앱이 썼나"로 보인다 — 선생님이 사용 내역을 알아보기 쉽게.
    h['HTTP-Referer'] = 'https://ssampin.com';
    h['X-Title'] = 'SsamPin';
  }
  if ((service === 'opencode-zen' || service === 'opencode-go') && sessionId) {
    h['x-opencode-session'] = sessionId;
  }
  return h;
}

/** 시간 제한과 [중단]을 한 신호로 묶는다. 어느 쪽이 먼저였는지도 알 수 있게. */
function combinedSignal(
  timeoutMs: number,
  outer: AbortSignal | undefined,
): { signal: AbortSignal; timedOut: () => boolean; dispose: () => void } {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  const onOuter = (): void => ctrl.abort();
  if (outer) {
    if (outer.aborted) ctrl.abort();
    else outer.addEventListener('abort', onOuter, { once: true });
  }
  return {
    signal: ctrl.signal,
    timedOut: () => timedOut,
    dispose: () => {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onOuter);
    },
  };
}

export function createApiKeyClient(deps: ApiKeyClientDeps) {
  function logFailure(
    service: ApiKeyServiceId,
    what: string,
    status: number | string,
    key: string,
  ) {
    deps.log?.(redactSecret(`[apiKey] ${service} ${what} 실패: ${status}`, key));
  }

  /**
   * 키를 실어 한 번 보낸다. 성공이면 JSON, 실패면 갈래.
   * 본문은 갈래를 정하는 데만 읽고 버린다.
   */
  async function send(
    service: ApiKeyServiceId,
    key: string,
    url: string,
    init: { method: 'GET' | 'POST'; body?: string; sessionId?: string | null },
    timeoutMs: number,
    what: string,
    outer?: AbortSignal,
  ): Promise<{ ok: true; json: unknown } | ApiKeyFailure | { ok: false; reason: 'cancelled' }> {
    assertAllowedUrl(url);
    const sig = combinedSignal(timeoutMs, outer);
    let res: Response;
    try {
      res = await deps.fetch(url, {
        method: init.method,
        headers: headersFor(service, key, deps.userAgent, init.sessionId ?? null),
        ...(init.body !== undefined ? { body: init.body } : {}),
        redirect: 'error',
        signal: sig.signal,
      });
    } catch {
      sig.dispose();
      if (outer?.aborted) return { ok: false, reason: 'cancelled' };
      const reason: OwnAiErrorKind = sig.timedOut() ? 'key-timeout' : 'key-network';
      logFailure(service, what, reason, key);
      return { ok: false, reason };
    }
    try {
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        const reason = classifyApiKeyHttpError(res.status, body);
        logFailure(service, what, `${res.status} ${reason}`, key);
        return { ok: false, reason };
      }
      const json: unknown = await res.json();
      return { ok: true, json };
    } catch {
      if (outer?.aborted) return { ok: false, reason: 'cancelled' };
      const reason: OwnAiErrorKind = sig.timedOut() ? 'key-timeout' : 'key-provider-error';
      logFailure(service, what, reason, key);
      return { ok: false, reason };
    } finally {
      sig.dispose();
    }
  }

  /** 서비스가 준 모델 목록을 느슨하게 읽는다. */
  function readModels(json: unknown): RawApiKeyModel[] {
    const data = (json as { data?: unknown })?.data;
    if (!Array.isArray(data)) return [];
    const out: RawApiKeyModel[] = [];
    for (const item of data) {
      if (typeof item !== 'object' || item === null) continue;
      const m = item as {
        id?: unknown;
        name?: unknown;
        pricing?: { prompt?: unknown };
        architecture?: { output_modalities?: unknown };
        supported_parameters?: unknown;
      };
      if (typeof m.id !== 'string') continue;
      const out1: {
        id: string;
        name?: string;
        promptPrice?: string;
        outputModalities?: string[];
        supportedParameters?: string[];
      } = { id: m.id };
      if (typeof m.name === 'string') out1.name = m.name;
      if (typeof m.pricing?.prompt === 'string') out1.promptPrice = m.pricing.prompt;
      const mods = m.architecture?.output_modalities;
      if (Array.isArray(mods)) out1.outputModalities = mods.filter((x) => typeof x === 'string');
      const params = m.supported_parameters;
      if (Array.isArray(params))
        out1.supportedParameters = params.filter((x) => typeof x === 'string');
      out.push(out1);
    }
    return out;
  }

  async function listModels(service: ApiKeyServiceId, key: string) {
    const r = await send(
      service,
      key,
      API_KEY_SERVICE_ENDPOINTS[service].modelsUrl,
      { method: 'GET' },
      20_000,
      'models',
    );
    if (!r.ok)
      return r.reason === 'cancelled' ? { ok: false as const, reason: 'key-network' as const } : r;
    return { ok: true as const, models: selectApiKeyModels(service, readModels(r.json)) };
  }

  /**
   * 키가 진짜인지 확인한다 — 저장하기 전에 한 번. **요금이 나가는 호출은 하지 않는다.**
   *
   * - 제미나이·오픈코드: 모델 목록 주소가 붙인 키를 검사한다(틀린 키면 400·401). 오픈코드 목록은
   *   키 없이도 열리지만, 키를 붙이면 검사한다(2026-10-24 실측: 가짜 키 → 401).
   * - 오픈라우터: 목록은 키를 보지 않는다 → 키 정보 주소로 확인한다.
   */
  async function verifyKey(
    service: ApiKeyServiceId,
    key: string,
  ): Promise<{ ok: true } | ApiKeyFailure> {
    if (service === 'openrouter') {
      const r = await send(service, key, OPENROUTER_KEY_INFO_URL, { method: 'GET' }, 20_000, 'key');
      if (r.ok) return { ok: true };
      return r.reason === 'cancelled' ? { ok: false, reason: 'key-network' } : r;
    }
    const r = await listModels(service, key);
    return r.ok ? { ok: true } : r;
  }

  /** `content` 는 글자일 수도, 조각 배열일 수도, null 일 수도 있다. */
  function readContent(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((part) =>
          typeof part === 'object' &&
          part !== null &&
          typeof (part as { text?: unknown }).text === 'string'
            ? (part as { text: string }).text
            : '',
        )
        .join('');
    }
    return '';
  }

  function readToolCalls(raw: unknown): ChatToolCall[] {
    if (!Array.isArray(raw)) return [];
    const calls: ChatToolCall[] = [];
    for (const item of raw) {
      const fn = (item as { function?: { name?: unknown; arguments?: unknown } })?.function;
      if (typeof fn?.name !== 'string' || fn.name.length === 0) continue;
      calls.push({
        name: fn.name,
        rawArguments:
          typeof fn.arguments === 'string'
            ? fn.arguments
            : fn.arguments === undefined
              ? ''
              : JSON.stringify(fn.arguments),
      });
    }
    return calls;
  }

  async function chat(req: ChatRequest): Promise<ChatResult> {
    // ★temperature 는 보내지 않는다 — 추론 모델 일부가 값을 받으면 400 을 준다(서비스마다 다르다).
    const body = {
      model: req.model,
      messages: req.messages,
      max_tokens: req.maxTokens,
      ...(req.tools && req.tools.length > 0 ? { tools: req.tools } : {}),
    };
    const r = await send(
      req.service,
      req.key,
      API_KEY_SERVICE_ENDPOINTS[req.service].chatCompletionsUrl,
      { method: 'POST', body: JSON.stringify(body), sessionId: req.sessionId },
      req.timeoutMs,
      'chat',
      req.signal,
    );
    if (!r.ok) return r;
    const choice = (r.json as { choices?: unknown[] })?.choices?.[0] as
      | { message?: { content?: unknown; tool_calls?: unknown } }
      | undefined;
    // 오픈라우터는 200 안에 오류를 싣기도 한다 — `{ error: { code: 402 } }`.
    const inlineError = (r.json as { error?: { code?: unknown; message?: unknown } })?.error;
    if (!choice && inlineError) {
      const status = typeof inlineError.code === 'number' ? inlineError.code : 500;
      const reason = classifyApiKeyHttpError(
        status,
        typeof inlineError.message === 'string' ? inlineError.message : '',
      );
      logFailure(req.service, 'chat', `inline ${status} ${reason}`, req.key);
      return { ok: false, reason };
    }
    const text = readContent(choice?.message?.content);
    const toolCalls = readToolCalls(choice?.message?.tool_calls);
    if (text.trim().length === 0 && toolCalls.length === 0) {
      // 안전 필터에 걸렸거나 출력 한도를 생각에 다 썼다. 빈 답을 "답"으로 넘기지 않는다.
      logFailure(req.service, 'chat', 'empty', req.key);
      return { ok: false, reason: 'key-provider-error' };
    }
    return { ok: true, text, toolCalls };
  }

  return { listModels, verifyKey, chat };
}

export type ApiKeyClient = ReturnType<typeof createApiKeyClient>;
