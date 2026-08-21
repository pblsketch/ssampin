/**
 * 쌤핀 AI — 도구 호출(function calling)과 스트리밍을 지원하는 LLM 호출 계층
 *
 * ★`_shared/chatLlm.ts` 를 쓰지 않고 새로 만든 이유
 *
 * 그 파일은 고객지원 챗봇(`ssampin-chat`)이 HyDE·재정렬·최종 답변 3곳에서 쓰는
 * **운영 중인 심장**이고, 요청 본문에 `tools`/`tool_choice` 필드가 **아예 없다.**
 * 응답도 `choices[0].message.content` 문자열만 꺼내고 `message.tool_calls` 를 보지 않는다.
 * 거기에 도구 호출을 얹으면 챗봇 회귀 위험이 생긴다(계획서 성공 기준 10: 챗봇 무회귀).
 * → **`chatLlm.ts` 는 읽기만 하고 수정하지 않는다.**
 *
 * ★환경변수를 `ASSIST_` 로 분리한 이유 (ADR-061 결정 4)
 *
 * 챗봇과 키를 공유하면 콘솔 Usage 에서 **어느 기능이 얼마나 썼는지 구분할 수 없다.**
 * 비용 문제가 아니라 계측 문제다 — 나중에 "유료로 갈까" 판단할 때 그 숫자가 필요하다.
 *
 * ★공급자를 코드에 박지 않는다 (ADR-061 결정 5)
 *
 * base URL·모델·키가 전부 환경변수다. 2027-03-31 이후 공급자를 갈아탈 때
 * 코드 수정 없이 값만 바꾼다. OpenAI 호환 규격이라 후보 대부분이 그대로 들어온다.
 */

// ── 설정 ──────────────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://api.upstage.ai/v1';
const DEFAULT_MODEL = 'solar-pro3';

/**
 * 추론 모델은 `max_tokens` 예산 안에서 '생각'에 쓰는 토큰까지 함께 소비한다.
 * 답변 예산을 그대로 넘기면 생각하다 예산이 떨어져 **빈 답변**이 나온다(ADR-048 함정 1).
 * 실측: `solar-pro3` 는 reasoning_tokens 0 이지만 `solar-pro4` 는 한 줄 질문에 990 을 썼다.
 * 안 쓴 예산은 과금되지 않으므로 넉넉히 잡는다.
 */
const REASONING_TOKEN_HEADROOM = 4096;

function baseUrl(): string {
  return (Deno.env.get('ASSIST_UPSTAGE_BASE_URL') ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function model(): string {
  return Deno.env.get('ASSIST_UPSTAGE_MODEL') ?? DEFAULT_MODEL;
}

function apiKey(): string | undefined {
  return Deno.env.get('ASSIST_UPSTAGE_API_KEY') ?? undefined;
}

// ── 공개 타입 ─────────────────────────────────────────────

export type AssistReasoning = 'minimal' | 'low';

export interface AssistTurn {
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content: string;
  /** role === 'tool' 일 때 어떤 호출에 대한 결과인지 */
  readonly tool_call_id?: string;
}

/** OpenAI 호환 도구 정의. 앱이 등급제를 통과한 1등급 도구만 보낸다. */
export interface AssistToolSchema {
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: Record<string, unknown>;
  };
}

export interface AssistToolCall {
  readonly id: string;
  readonly name: string;
  /** 모델이 만든 인자 JSON 원문. 파싱 실패할 수 있으므로 문자열로 준다. */
  readonly rawArguments: string;
}

export interface AssistUsage {
  readonly in: number;
  readonly out: number;
}

export interface AssistCompletion {
  readonly text: string;
  readonly toolCalls: readonly AssistToolCall[];
  readonly usage: AssistUsage;
}

export interface AssistCallOptions {
  readonly turns: readonly AssistTurn[];
  readonly tools?: readonly AssistToolSchema[];
  readonly temperature: number;
  /** 원하는 '답변' 길이 상한. 추론 토큰은 여기에 자동으로 더해진다. */
  readonly maxOutputTokens: number;
  readonly reasoning: AssistReasoning;
  readonly timeoutMs: number;
  /** 로그 식별용 단계 이름. **사용자 입력을 넣지 않는다.** */
  readonly stage: string;
}

/** 키가 없을 때 부르는 쪽이 구분할 수 있도록 별도 오류로 던진다. */
export class AssistLlmNotConfiguredError extends Error {
  constructor() {
    super('ASSIST_UPSTAGE_API_KEY 가 설정되지 않았습니다');
    this.name = 'AssistLlmNotConfiguredError';
  }
}

export class AssistLlmError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AssistLlmError';
  }
}

// ── 내부 ──────────────────────────────────────────────────

interface RequestBody {
  model: string;
  messages: Array<{ role: string; content: string; tool_call_id?: string }>;
  temperature: number;
  max_tokens: number;
  reasoning_effort?: AssistReasoning;
  tools?: readonly AssistToolSchema[];
  tool_choice?: 'auto';
  stream?: boolean;
}

function buildBody(
  options: AssistCallOptions,
  withReasoning: boolean,
  stream: boolean,
): RequestBody {
  const body: RequestBody = {
    model: model(),
    messages: options.turns.map((turn) => ({
      role: turn.role,
      content: turn.content,
      ...(turn.tool_call_id === undefined ? {} : { tool_call_id: turn.tool_call_id }),
    })),
    temperature: options.temperature,
    max_tokens: withReasoning
      ? options.maxOutputTokens + REASONING_TOKEN_HEADROOM
      : options.maxOutputTokens,
    ...(withReasoning ? { reasoning_effort: options.reasoning } : {}),
    ...(options.tools && options.tools.length > 0
      ? { tools: options.tools, tool_choice: 'auto' as const }
      : {}),
    ...(stream ? { stream: true } : {}),
  };
  return body;
}

async function post(
  key: string,
  options: AssistCallOptions,
  withReasoning: boolean,
  stream: boolean,
): Promise<Response> {
  return await fetch(`${baseUrl()}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(buildBody(options, withReasoning, stream)),
    signal: AbortSignal.timeout(options.timeoutMs),
  });
}

interface ChatResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
    };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * ★400 은 옵션 없이 한 번 재시도한다 (ADR-048 함정 2).
 *
 * `reasoning_effort` 는 추론 모델 전용이라 모델을 비추론 계열로 갈아끼우면 400 이 난다.
 * 그때 조용히 실패로 넘기면 **설정 실수가 영영 안 보인다.** 재시도 사실은 항상 로그에 남긴다.
 */
async function postWithReasoningFallback(
  key: string,
  options: AssistCallOptions,
  stream: boolean,
): Promise<Response> {
  let res = await post(key, options, true, stream);
  if (res.status === 400) {
    const detail = await res.text();
    console.warn(`[assist:${options.stage}] 400 - reasoning_effort 없이 재시도: ${detail}`);
    res = await post(key, options, false, stream);
  }
  return res;
}

// ── 공개 API ──────────────────────────────────────────────

/** 비스트리밍 호출. 도구 호출이 있으면 `toolCalls` 에 담아 돌려준다. */
export async function callAssist(options: AssistCallOptions): Promise<AssistCompletion> {
  const key = apiKey();
  if (!key) throw new AssistLlmNotConfiguredError();

  const res = await postWithReasoningFallback(key, options, false);
  if (!res.ok) {
    const detail = await res.text();
    console.error(`[assist:${options.stage}] 호출 실패 ${res.status}: ${detail.slice(0, 300)}`);
    throw new AssistLlmError('AI 응답을 받지 못했습니다', res.status);
  }

  const data = (await res.json()) as ChatResponse;
  const message = data.choices?.[0]?.message;

  return {
    text: message?.content?.trim() ?? '',
    toolCalls: (message?.tool_calls ?? []).map((call, index) => ({
      id: call.id ?? `call_${index}`,
      name: call.function?.name ?? '',
      rawArguments: call.function?.arguments ?? '{}',
    })),
    usage: {
      in: data.usage?.prompt_tokens ?? 0,
      out: data.usage?.completion_tokens ?? 0,
    },
  };
}

/**
 * 스트리밍 호출. SSE 본문을 **그대로 흘려보낸다.**
 *
 * 델타를 서버가 다시 조립하지 않는 이유: 조립하면 첫 글자가 나오기까지 기다리게 되어
 * 스트리밍의 이유가 사라진다. 앱이 표준 SSE 를 그대로 읽는다.
 * `solar-pro3` 의 `tool_calls` 델타는 실측으로 확인됐다.
 */
export async function streamAssist(
  options: AssistCallOptions,
): Promise<ReadableStream<Uint8Array>> {
  const key = apiKey();
  if (!key) throw new AssistLlmNotConfiguredError();

  const res = await postWithReasoningFallback(key, options, true);
  if (!res.ok || !res.body) {
    const detail = res.body ? await res.text() : '(본문 없음)';
    console.error(`[assist:${options.stage}] 스트림 실패 ${res.status}: ${detail.slice(0, 300)}`);
    throw new AssistLlmError('AI 응답을 받지 못했습니다', res.ok ? 502 : res.status);
  }
  return res.body;
}

/** 배포된 설정을 로그로 확인할 때 쓴다. **키는 절대 담지 않는다.** */
export function assistLlmConfigSummary(): Record<string, string | boolean> {
  return {
    baseUrl: baseUrl(),
    model: model(),
    hasKey: apiKey() !== undefined,
  };
}
