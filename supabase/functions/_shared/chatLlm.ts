/**
 * 챗봇 '답변 생성' LLM 호출 공통 레이어 — Claude(기본) + Gemini(폴백)
 *
 * 기본 공급자는 Claude Haiku 5.5 다. 인증은 API 키가 아니라 WIF(_shared/claudeWif.ts)다.
 * HyDE·문서 재정렬·최종 답변 세 곳이 같은 호출을 쓰므로 이 파일 하나로 모은다.
 *
 * ## 2026-10-24 업스테이지에서 옮겼다 (ADR-142)
 *
 * 업스테이지 키가 무료 크레딧 만료(10/14)로 정지돼 챗봇이 열흘 넘게 모든 질문에 오류를 냈고,
 * 새 키도 30분 만에 같은 이유로 정지됐다. 게다가 쓰던 `solar-pro3` 은 2026-10-30 종료다.
 * Claude 는 오너 Max 요금제의 월간 API 크레딧으로 돌고, `ssampin` 워크스페이스 월 한도가 걸려 있다.
 *
 * ⚠️ 임베딩(검색용 벡터)은 여기 포함되지 않는다 — `_shared/embedding.ts`(제미나이) 소관이다.
 *    Claude 에는 임베딩 모델이 없다.
 *
 * 환경변수
 *   ANTHROPIC_WIF_*, ANTHROPIC_*_ID  Claude WIF 설정(_shared/claudeWif.ts). 서명 키가 없으면 Gemini 단독.
 *   CLAUDE_MODEL      기본 'claude-haiku-5-5'.
 *   GOOGLE_API_KEY    Gemini 키. 답변 생성 폴백 + 임베딩.
 *   GEMINI_MODEL      기본 'gemini-3.1-flash-lite-preview'
 */

import { claudeClient } from './claudeWif.ts';

// ── 설정 ──────────────────────────────────────────────────

const DEFAULT_CLAUDE_MODEL = 'claude-haiku-5-5';
const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';

/**
 * 생각하기(adaptive thinking)를 켠 호출은 max_tokens 안에서 생각 토큰도 쓴다. 답변 예산을
 * 그대로 넘기면 생각하다 예산이 떨어져 답변이 잘릴 수 있어 여유분을 더한다.
 * 쓰지 않은 예산은 과금되지 않는다.
 */
const THINKING_TOKEN_HEADROOM = 4096;

function claudeModel(): string {
  return Deno.env.get('CLAUDE_MODEL') ?? DEFAULT_CLAUDE_MODEL;
}

function geminiModel(): string {
  return Deno.env.get('GEMINI_MODEL') ?? DEFAULT_GEMINI_MODEL;
}

// ── 공개 타입 ─────────────────────────────────────────────

/**
 * 추론 강도.
 *   'minimal' — 생각하기를 끈다. HyDE·재정렬처럼 짧고 빨라야 하는 단계.
 *   'low'     — 생각하기를 켜되 effort 'low'. 최종 답변.
 * Gemini 에서는 thinkingLevel 로 그대로 번역된다.
 */
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
  /**
   * Gemini 폴백에만 쓰인다. Claude Haiku 5.5 는 temperature 를 받지 않는다(보내면 거절).
   * 결정성이 필요한 단계(재정렬)는 Claude 에서 생각하기를 꺼 흔들림을 줄인다.
   */
  readonly temperature: number;
  /** 원하는 '답변' 길이 상한. 생각 토큰 여유분은 자동으로 더해진다. */
  readonly maxOutputTokens: number;
  readonly reasoning: ReasoningLevel;
  readonly timeoutMs: number;
  /** 로그 식별용 단계 이름 (hyde / rerank / answer). 사용자 입력은 넣지 않는다. */
  readonly stage: string;
}

// ── Claude ────────────────────────────────────────────────

/**
 * Claude 는 첫 메시지가 user 여야 하고 빈 본문을 받지 않는다. 앱이 보낸 대화 기록이
 * 인사말(assistant)로 시작하거나 빈 말풍선을 담고 있을 수 있어 여기서 정리한다.
 */
function claudeMessages(
  turns: readonly LlmTurn[],
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const nonEmpty = turns.filter((turn) => turn.content.trim().length > 0);
  const firstUser = nonEmpty.findIndex((turn) => turn.role === 'user');
  if (firstUser === -1) return [];
  return nonEmpty.slice(firstUser).map((turn) => ({ role: turn.role, content: turn.content }));
}

async function callClaude(
  client: NonNullable<ReturnType<typeof claudeClient>>,
  options: GenerateTextOptions,
): Promise<string> {
  const messages = claudeMessages(options.turns);
  if (messages.length === 0) throw new Error('Claude 에 보낼 사용자 발화가 없음');

  const thinkingOff = options.reasoning === 'minimal';
  const response = await client.messages.create(
    {
      model: claudeModel(),
      max_tokens: thinkingOff
        ? options.maxOutputTokens
        : options.maxOutputTokens + THINKING_TOKEN_HEADROOM,
      ...(options.system ? { system: options.system } : {}),
      messages,
      ...(thinkingOff
        ? { thinking: { type: 'disabled' as const } }
        : { output_config: { effort: 'low' as const } }),
    },
    // 폴백(Gemini)이 있으므로 SDK 재시도는 한 번만. 단계별 시간 제한을 그대로 건다.
    { timeout: options.timeoutMs, maxRetries: 1 },
  );

  if (response.stop_reason === 'refusal') {
    throw new Error('Claude 가 답변을 거절함 (stop_reason=refusal)');
  }
  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('')
    .trim();
  if (!text) throw new Error(`Claude 응답이 비어 있음 (stop_reason=${response.stop_reason})`);
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
 * 답변 텍스트를 생성한다. Claude 를 먼저 쓰고, 실패하면 Gemini 로 넘어간다.
 * 두 공급자가 모두 실패하면 마지막 오류를 그대로 던진다(호출부가 각자 처리).
 */
export async function generateText(options: GenerateTextOptions): Promise<string> {
  const googleKey = Deno.env.get('GOOGLE_API_KEY');

  let claude: ReturnType<typeof claudeClient> = null;
  try {
    claude = claudeClient();
  } catch (error) {
    // 설정 실수(서명 키는 있는데 ID 가 빠짐 등). 폴백이 있으면 넘어가되 반드시 남긴다.
    if (!googleKey) throw error;
    console.error(`[llm:${options.stage}] Claude 설정 오류 → Gemini 폴백:`, error);
  }

  if (claude) {
    try {
      return await callClaude(claude, options);
    } catch (error) {
      // 폴백이 없으면 여기서 끝내고 원인을 그대로 올린다(오류가 삼켜지지 않게).
      if (!googleKey) throw error;
      console.error(`[llm:${options.stage}] Claude 실패 → Gemini 폴백:`, error);
    }
  }

  if (!googleKey) {
    throw new Error('LLM 설정이 없습니다 (ANTHROPIC_WIF_SIGNING_JWK / GOOGLE_API_KEY 모두 미설정)');
  }

  return await callGemini(googleKey, options);
}
