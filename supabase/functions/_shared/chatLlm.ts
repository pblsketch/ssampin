/**
 * 챗봇 '답변 생성' LLM 호출 공통 레이어 — 업스테이지 Solar(기본) + Gemini(폴백)
 *
 * 기본 공급자는 업스테이지 Solar 다. OpenAI 호환 `chat/completions` 규격을 쓰므로
 * 요청 형태가 Gemini 와 전혀 달라(시스템 지시·역할 이름·토큰 옵션) 호출부마다 분기하면
 * ssampin-chat 안에 같은 fetch 가 세 벌 생긴다. 그래서 호출을 이 파일 하나로 모은다.
 *
 * ⚠️ 임베딩(검색용 벡터)은 여기 포함되지 않는다. 문서 테이블이 `vector(768)` 로 고정돼
 * 있어(001_ssampin_chat.sql) 4096차원인 업스테이지 임베딩으로 바꾸려면 DB 이사와 전체
 * 재적재가 필요하다. 임베딩은 계속 Gemini(gemini-embedding-001, 768차원)를 쓴다.
 *
 * 환경변수
 *   UPSTAGE_API_KEY   업스테이지 API 키. 없으면 Gemini 단독으로 동작한다(기존과 동일).
 *   UPSTAGE_MODEL     기본 'solar-pro3'. 'solar-pro4' 등으로 바꾸려면 값만 교체한다.
 *   UPSTAGE_BASE_URL  기본 'https://api.upstage.ai/v1'
 *   GOOGLE_API_KEY    Gemini 키. 임베딩과 폴백에 공용으로 쓴다.
 *   GEMINI_MODEL      기본 'gemini-3.1-flash-lite-preview'
 */

// ── 설정 ──────────────────────────────────────────────────

const DEFAULT_UPSTAGE_BASE_URL = 'https://api.upstage.ai/v1';
const DEFAULT_UPSTAGE_MODEL = 'solar-pro3';
const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';

/**
 * 추론 모델은 max_tokens 예산 안에서 '생각'에 쓰는 토큰까지 함께 소비한다. 답변 예산을
 * 그대로 넘기면 생각하다 예산이 떨어져 답변이 빈 문자열로 잘릴 수 있어 여유분을 더한다.
 *
 * 실측(2026-08-14, scripts/test-upstage.mjs): solar-pro3 은 reasoning_effort 'low' 에서도
 * reasoning_tokens 가 0 이었지만, solar-pro4 는 **한 줄짜리 질문에 990 토큰**을 생각에 썼다.
 * 모델을 pro4 로 올리면 1024 로는 아슬아슬하므로 넉넉히 잡는다. 쓰지 않은 예산은 과금되지
 * 않으므로 크게 잡아도 손해가 없다.
 */
const REASONING_TOKEN_HEADROOM = 4096;

function upstageBaseUrl(): string {
  return (Deno.env.get('UPSTAGE_BASE_URL') ?? DEFAULT_UPSTAGE_BASE_URL).replace(/\/+$/, '');
}

function upstageModel(): string {
  return Deno.env.get('UPSTAGE_MODEL') ?? DEFAULT_UPSTAGE_MODEL;
}

function geminiModel(): string {
  return Deno.env.get('GEMINI_MODEL') ?? DEFAULT_GEMINI_MODEL;
}

// ── 공개 타입 ─────────────────────────────────────────────

/** 추론 강도. 업스테이지 reasoning_effort / Gemini thinkingLevel 로 각각 번역된다. */
export type ReasoningLevel = 'minimal' | 'low';

export interface LlmTurn {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export interface GenerateTextOptions {
  /** 시스템 지시(역할·규칙). 없으면 생략된다. */
  readonly system?: string;
  /** 대화 순서대로의 발화 목록. 마지막은 이번 질문이어야 한다. */
  readonly turns: readonly LlmTurn[];
  readonly temperature: number;
  /** 원하는 '답변' 길이 상한. 추론 토큰은 여기에 자동으로 더해진다. */
  readonly maxOutputTokens: number;
  readonly reasoning: ReasoningLevel;
  readonly timeoutMs: number;
  /** 로그 식별용 단계 이름 (hyde / rerank / answer). 사용자 입력은 넣지 않는다. */
  readonly stage: string;
}

// ── 업스테이지 (OpenAI 호환) ──────────────────────────────

interface OpenAiChatResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

interface UpstageRequestBody {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature: number;
  max_tokens: number;
  reasoning_effort?: ReasoningLevel;
}

function buildUpstageBody(
  options: GenerateTextOptions,
  withReasoning: boolean,
): UpstageRequestBody {
  const messages: UpstageRequestBody['messages'] = [];
  if (options.system) messages.push({ role: 'system', content: options.system });
  for (const turn of options.turns) messages.push({ role: turn.role, content: turn.content });

  return {
    model: upstageModel(),
    messages,
    temperature: options.temperature,
    max_tokens: withReasoning
      ? options.maxOutputTokens + REASONING_TOKEN_HEADROOM
      : options.maxOutputTokens,
    ...(withReasoning ? { reasoning_effort: options.reasoning } : {}),
  };
}

async function postUpstage(
  apiKey: string,
  options: GenerateTextOptions,
  withReasoning: boolean,
): Promise<Response> {
  return await fetch(`${upstageBaseUrl()}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(buildUpstageBody(options, withReasoning)),
    signal: AbortSignal.timeout(options.timeoutMs),
  });
}

async function callUpstage(apiKey: string, options: GenerateTextOptions): Promise<string> {
  let response = await postUpstage(apiKey, options, true);

  // reasoning_effort 는 추론 모델 전용 옵션이다. 모델을 비추론 계열로 바꿔 끼우면 400 이
  // 나는데, 그때 조용히 Gemini 로 넘어가 버리면 설정 실수가 영영 안 보인다. 한 번은
  // 옵션 없이 재시도해 업스테이지로 정상 응답하도록 한다.
  if (response.status === 400) {
    const detail = await response.text();
    console.warn(`[llm:${options.stage}] 업스테이지 400 — reasoning_effort 없이 재시도: ${detail}`);
    response = await postUpstage(apiKey, options, false);
  }

  if (!response.ok) {
    throw new Error(`업스테이지 호출 실패 (${response.status}): ${await response.text()}`);
  }

  const data = (await response.json()) as OpenAiChatResponse;
  const text = data.choices?.[0]?.message?.content?.trim() ?? '';
  if (!text) throw new Error('업스테이지 응답이 비어 있음');
  return text;
}

// ── Gemini (폴백) ─────────────────────────────────────────

interface GeminiPart {
  text: string;
}

interface GeminiGenerateResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
}

async function callGemini(apiKey: string, options: GenerateTextOptions): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel()}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(options.system ? { systemInstruction: { parts: [{ text: options.system }] } } : {}),
        contents: options.turns.map((turn) => ({
          // Gemini 는 assistant 를 'model' 이라고 부른다.
          role: turn.role === 'user' ? 'user' : 'model',
          parts: [{ text: turn.content }],
        })),
        generationConfig: {
          temperature: options.temperature,
          maxOutputTokens: options.maxOutputTokens,
          thinkingConfig: { thinkingLevel: options.reasoning },
        },
      }),
      signal: AbortSignal.timeout(options.timeoutMs),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini 호출 실패 (${response.status}): ${await response.text()}`);
  }

  const data = (await response.json()) as GeminiGenerateResponse;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
  if (!text) throw new Error('Gemini 응답이 비어 있음');
  return text;
}

// ── 공개 API ──────────────────────────────────────────────

/**
 * 답변 텍스트를 생성한다. 업스테이지를 먼저 쓰고, 실패하면 Gemini 로 넘어간다.
 * 두 공급자가 모두 실패하면 마지막 오류를 그대로 던진다(호출부가 각자 처리).
 */
export async function generateText(options: GenerateTextOptions): Promise<string> {
  const upstageKey = Deno.env.get('UPSTAGE_API_KEY');
  const googleKey = Deno.env.get('GOOGLE_API_KEY');

  if (upstageKey) {
    try {
      return await callUpstage(upstageKey, options);
    } catch (error) {
      // 폴백이 없으면 여기서 끝내고 원인을 그대로 올린다(오류가 삼켜지지 않게).
      if (!googleKey) throw error;
      console.error(`[llm:${options.stage}] 업스테이지 실패 → Gemini 폴백:`, error);
    }
  }

  if (!googleKey) {
    throw new Error('LLM 키가 없습니다 (UPSTAGE_API_KEY / GOOGLE_API_KEY 모두 미설정)');
  }

  return await callGemini(googleKey, options);
}
