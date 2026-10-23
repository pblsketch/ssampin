/**
 * "내 API 키로 연결"(BYOK) 규칙 — 키 다듬기·가리기, 모델 고르기, 오류 갈래 (ADR-143).
 *
 * ★main 프로세스(electron/ipc/apiKey*.ts)와 화면이 **같은 규칙**을 쓴다. 키를 다루는 쪽은
 *   main 뿐이고, 화면은 서비스·모델 목록과 안내 문구만 쓴다.
 * ★이 파일은 도메인이다. 외부 의존성 import 금지, 순수 함수만 둔다.
 */
import type {
  ApiKeyInputProblem,
  ApiKeyModelOption,
  ApiKeyServiceId,
} from '../entities/ApiKeyProvider';
import { API_KEY_SERVICES } from '../entities/ApiKeyProvider';
import type { OwnAiErrorKind } from '../entities/OwnAiProvider';
import { PLAIN_ANSWER_INSTRUCTION } from './plainAnswerText';

/** IPC 처럼 바깥에서 들어온 값이 아는 서비스인지 — 모르는 값은 파일 이름·주소로 쓰지 않는다. */
export function isApiKeyServiceId(value: unknown): value is ApiKeyServiceId {
  return typeof value === 'string' && (API_KEY_SERVICES as readonly string[]).includes(value);
}

/** 모델 id 로 받을 수 있는 글자 — 서비스들이 쓰는 꼴(`models/x`, `vendor/x`, `x-1.2`)만. */
export function isPlausibleModelId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,199}$/.test(value);
}

// ─────────────────────────────────────────────────────────────
// 키 입력 다듬기
// ─────────────────────────────────────────────────────────────

/** 키 길이 범위. 알려진 서비스 키는 모두 30~200자 사이다 — 넉넉히 잡는다. */
export const API_KEY_MIN_LENGTH = 20;
export const API_KEY_MAX_LENGTH = 512;

export type ApiKeyInputResult =
  | { readonly ok: true; readonly key: string }
  | { readonly ok: false; readonly problem: ApiKeyInputProblem };

/**
 * 붙여 넣은 글을 키로 다듬는다.
 *
 * 선생님이 실제로 붙여 넣는 모양: 앞뒤 공백·줄바꿈, 따옴표로 감싼 것(`"sk-..."`),
 * `Bearer sk-...`, `OPENROUTER_API_KEY=sk-...` 처럼 설정 줄째 복사한 것, 웹에서 딸려 온
 * 보이지 않는 글자(zero-width). 이것들은 조용히 걷어 낸다 — 키 자체를 바꾸는 것이 아니다.
 *
 * ★그 밖의 글자(한글·공백 섞임)가 남으면 고치지 않고 거절한다. 추측해서 잘라 내면
 *   "연결 확인"이 엉뚱한 이유로 실패하고, 선생님은 무엇이 틀렸는지 알 수 없다.
 */
export function normalizeApiKeyInput(raw: string): ApiKeyInputResult {
  let s = raw.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').trim();
  // `NAME=값` / `NAME: 값` 한 줄을 통째로 복사한 경우 — 등호·쌍점 뒤만 쓴다.
  const assign = /^[A-Za-z_][A-Za-z0-9_]*\s*[=:]\s*(.+)$/.exec(s);
  if (assign) s = (assign[1] ?? '').trim();
  s = s.replace(/^bearer\s+/i, '').trim();
  // 따옴표·백틱으로 감싼 경우
  const quoted = /^(["'`])(.*)\1$/.exec(s);
  if (quoted) s = (quoted[2] ?? '').trim();

  if (s.length === 0) return { ok: false, problem: 'empty' };
  if (!/^[\x21-\x7E]+$/.test(s)) return { ok: false, problem: 'invalid-chars' };
  if (s.length < API_KEY_MIN_LENGTH) return { ok: false, problem: 'too-short' };
  if (s.length > API_KEY_MAX_LENGTH) return { ok: false, problem: 'too-long' };
  return { ok: true, key: s };
}

export const API_KEY_INPUT_MESSAGES: Readonly<Record<ApiKeyInputProblem, string>> = {
  empty: '키를 붙여 넣어 주세요.',
  'too-short': '키가 너무 짧아요. 복사할 때 일부만 복사됐는지 확인해 주세요.',
  'too-long': '키가 너무 길어요. 키 한 개만 복사해 붙여 넣어 주세요.',
  'invalid-chars':
    '키에 들어갈 수 없는 글자(한글·띄어쓰기 등)가 섞여 있어요. 키만 다시 복사해 붙여 넣어 주세요.',
};

/**
 * 키 모양으로 짐작한 서비스. **판정이 아니라 안내용**이다 — 모양이 바뀌어도 막지 않는다.
 * 오픈라우터 키를 제미나이 칸에 넣는 실수가 흔해서, 연결이 실패했을 때 한 줄 덧붙이는 데 쓴다.
 */
export function guessApiKeyService(key: string): ApiKeyServiceId | null {
  if (key.startsWith('sk-or-')) return 'openrouter';
  if (key.startsWith('AIza')) return 'gemini';
  return null;
}

/** 화면에 보일 키 표시. 끝 4자리만 — 키가 짧아도 절반 이상은 드러내지 않는다. */
export function maskApiKey(key: string): string {
  const tail = key.length >= 12 ? key.slice(-4) : '';
  return `••••${tail}`;
}

// ─────────────────────────────────────────────────────────────
// 오류 글에서 키 지우기
// ─────────────────────────────────────────────────────────────

/**
 * 키처럼 생긴 글자 덩어리. 서비스가 오류 본문에 키 일부를 되돌려 주는 경우가 있어
 * (`Incorrect API key provided: sk-abc...`), 로그·화면에 남기기 전에 지운다.
 */
const KEY_LIKE_PATTERNS: readonly RegExp[] = [
  /sk-[A-Za-z0-9_-]{8,}/g,
  /AIza[A-Za-z0-9_-]{20,}/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
];

/**
 * 글에서 키를 지운다 — 넣은 키 원문, 그 앞 절반·뒤 절반, 키처럼 생긴 덩어리 모두.
 *
 * ★앞·뒤 절반까지 찾는 이유: 서비스가 키를 "sk-or-v1-abcd...wxyz"처럼 가운데를 줄여
 *   되돌려 주기도 한다. 원문만 찾으면 그 조각은 빠져나간다.
 */
export function redactSecret(text: string, secret: string | null): string {
  let out = text;
  if (secret && secret.length >= 8) {
    const half = Math.floor(secret.length / 2);
    for (const piece of [secret, secret.slice(0, half), secret.slice(half)]) {
      if (piece.length >= 6) out = out.split(piece).join('[가린 키]');
    }
  }
  for (const re of KEY_LIKE_PATTERNS) out = out.replace(re, '[가린 키]');
  return out;
}

// ─────────────────────────────────────────────────────────────
// 오류 갈래
// ─────────────────────────────────────────────────────────────

/**
 * HTTP 응답을 선생님이 할 일로 나눈다.
 *
 * - 제미나이는 틀린 키에 **400** + "API key not valid / Please pass a valid API key" 를 준다.
 *   400 을 전부 키 오류로 보면 요청 형식 오류(모델 이름 등)까지 "키를 다시 넣으라"가 된다 —
 *   본문에 키 이야기가 있을 때만 키 오류로 본다.
 * - 오픈코드는 없는 모델에 400 "Model is unavailable" 을 준다.
 * - 429 는 분당 몰림과 무료 한도 소진을 구분해 주지 않는다 — 한 갈래로 안내한다.
 */
export function classifyApiKeyHttpError(status: number, body: string): OwnAiErrorKind {
  const text = body.toLowerCase();
  if (status === 401 || status === 403) return 'key-invalid';
  if (status === 402) return 'key-no-credit';
  if (status === 429) return 'key-rate-limited';
  if (status === 404) return 'key-model-unavailable';
  if (status === 400) {
    if (/api[ _-]?key|credential|unauthori[sz]ed|authenticat/.test(text)) return 'key-invalid';
    if (/insufficient|credit|balance|billing|quota/.test(text)) return 'key-no-credit';
    if (/model/.test(text)) return 'key-model-unavailable';
    return 'key-provider-error';
  }
  if (status === 408 || status === 504) return 'key-timeout';
  return 'key-provider-error';
}

// ─────────────────────────────────────────────────────────────
// 모델 목록
// ─────────────────────────────────────────────────────────────

/** 서비스가 준 모델 한 줄 — 서비스마다 칸이 달라 필요한 것만 느슨하게 읽는다. */
export interface RawApiKeyModel {
  readonly id: string;
  readonly name?: string;
  /** 오픈라우터: 입력 1토큰 값(문자열). "0" 이면 무료 모델 */
  readonly promptPrice?: string;
  /** 오픈라우터: 출력 형식 */
  readonly outputModalities?: readonly string[];
  /** 오픈라우터: 받는 인자 — 도구(`tools`)를 못 받으면 쌤핀 AI 패널에서 쓸 수 없다 */
  readonly supportedParameters?: readonly string[];
}

/** 대화용이 아닌 모델(음성·그림·임베딩·실시간·연구 대행 등)을 걸러 내는 낱말 */
const NON_CHAT_WORDS =
  /(tts|image|banana|imagen|veo|lyria|audio|live|realtime|transcribe|embedding|embed|aqa|robotics|computer-use|deep-research|antigravity|omni|customtools|translate|search|moderation|whisper|dall-e|sora)/i;

/**
 * 오픈코드에서 OpenAI 형식(`chat/completions`)으로 부를 수 있는 모델 집안.
 * 클로드(anthropic 형식)·GPT·그록·뮤즈(responses 형식)·제미나이(google 형식)는 이 주소로
 * 부를 수 없다(2026-10-24 opencode.ai/docs/zen·go 표 확인). 큐원은 판본마다 형식이 달라 뺐다.
 */
const OPENCODE_CHAT_FAMILIES = /^(glm|kimi|deepseek|mistral)-/;

/** 오픈라우터에서 보여 줄 회사 — 학생 자료가 오가는 일이라 데이터 정책이 공개된 곳만 둔다. */
const OPENROUTER_VENDORS = /^(anthropic|openai|google)\//;

/** 서비스별 추천 순서. 앞에서부터 목록에 있는 첫 모델을 추천한다. */
const RECOMMENDED: Readonly<Record<ApiKeyServiceId, readonly string[]>> = {
  gemini: ['models/gemini-flash-latest', 'models/gemini-3.8-flash', 'models/gemini-2.5-flash'],
  openrouter: ['anthropic/claude-haiku-5.5', 'google/gemini-3.8-flash', 'openai/gpt-6-luna'],
  'opencode-zen': ['glm-5.3', 'kimi-k3', 'deepseek-v4.1-flash'],
  'opencode-go': ['glm-5.3', 'kimi-k3', 'deepseek-v4.1-flash'],
};

/** 화면 이름. 서비스가 준 이름이 있으면 회사 머리말(`Google: `)만 떼서 쓴다. */
function labelOf(service: ApiKeyServiceId, model: RawApiKeyModel): string {
  if (service === 'gemini') {
    const bare = model.id.replace(/^models\//, '');
    if (bare === 'gemini-flash-latest') return 'Gemini Flash (늘 최신)';
    if (bare === 'gemini-pro-latest') return 'Gemini Pro (늘 최신)';
    if (bare === 'gemini-flash-lite-latest') return 'Gemini Flash Lite (늘 최신)';
    return bare;
  }
  if (service === 'openrouter' && model.name) {
    return model.name.replace(/^[^:]+:\s*/, '').trim() || model.id;
  }
  return model.id;
}

/** 이 서비스에서 쌤핀이 쓸 수 있는 모델인가. */
export function isUsableApiKeyModel(service: ApiKeyServiceId, model: RawApiKeyModel): boolean {
  const id = model.id;
  if (id.length === 0 || id.length > 200) return false;
  if (NON_CHAT_WORDS.test(id)) return false;
  // 무료 모델은 보낸 내용을 학습에 쓸 수 있다(오픈코드 문서·오픈라우터 무료 공급자 약관).
  if (/(^|[-:])free$/i.test(id)) return false;

  switch (service) {
    case 'gemini':
      // 젬마(오픈 모델)는 도구 호출이 약하다. 제미나이 대화 모델만 둔다.
      return /^models\/gemini-/.test(id);
    case 'openrouter': {
      if (!OPENROUTER_VENDORS.test(id)) return false;
      // `:batch`·`:thinking` 같은 변형은 따로 고를 이유가 없다.
      if (id.includes(':')) return false;
      if (model.promptPrice !== undefined && Number(model.promptPrice) <= 0) return false;
      const out = model.outputModalities;
      if (out && (out.length !== 1 || out[0] !== 'text')) return false;
      const params = model.supportedParameters;
      if (params && !params.includes('tools')) return false;
      return true;
    }
    case 'opencode-zen':
    case 'opencode-go':
      if (!OPENCODE_CHAT_FAMILIES.test(id)) return false;
      // 코딩 전용 판본·기여자 판본·예비 판본은 뺀다.
      return !/-(code|contributor|backup|preview)$/.test(id);
  }
}

/**
 * 서비스가 준 목록 → 고르기 목록. 추천 모델이 맨 위, 나머지는 서비스가 준 순서.
 * 쓸 수 있는 모델이 하나도 없으면 빈 배열이다(화면이 "쓸 수 있는 모델이 없어요"를 띄운다).
 */
export function selectApiKeyModels(
  service: ApiKeyServiceId,
  raw: readonly RawApiKeyModel[],
): ApiKeyModelOption[] {
  const seen = new Set<string>();
  const usable: RawApiKeyModel[] = [];
  for (const m of raw) {
    if (seen.has(m.id) || !isUsableApiKeyModel(service, m)) continue;
    seen.add(m.id);
    usable.push(m);
  }
  const recommendedId = RECOMMENDED[service].find((id) => seen.has(id)) ?? usable[0]?.id ?? null;
  const ordered = [
    ...usable.filter((m) => m.id === recommendedId),
    ...usable.filter((m) => m.id !== recommendedId),
  ];
  return ordered.map((m) => ({
    id: m.id,
    label: labelOf(service, m),
    recommended: m.id === recommendedId,
  }));
}

/** 고르기 목록에서 기본으로 잡을 모델 — 추천, 없으면 첫 줄. */
export function defaultApiKeyModel(options: readonly ApiKeyModelOption[]): string | null {
  return (options.find((o) => o.recommended) ?? options[0])?.id ?? null;
}

// ─────────────────────────────────────────────────────────────
// 쌤핀 AI 패널 지시문
// ─────────────────────────────────────────────────────────────

/** 한국 학교 기준 오늘 — `2026-10-24 (토)`. 기기 시계가 UTC 여도 서울 날짜를 쓴다. */
export function formatSeoulToday(now: Date): string {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(now);
  const weekday = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    weekday: 'short',
  }).format(now);
  return `${ymd} (${weekday})`;
}

/**
 * 내 API 키로 쌤핀 AI 패널을 쓸 때의 지시문.
 *
 * ★오늘 날짜를 꼭 넣는다 — 모델은 오늘이 며칠인지 모른다. 날짜가 없던 시절 지난 기한을
 *   "아직 남았다"고 답했다(2026-08-23 신고, 서버 프롬프트에도 같은 이유로 들어 있다).
 * ★별칭(［이름1］)을 그대로 쓰라고 말해 둔다 — 화면이 그 자리를 실명으로 되돌린다.
 *   모델이 "이름이 가려져 알 수 없다"고 답하면 선생님에게는 이상한 말이 된다.
 */
export function buildApiKeyPanelSystemPrompt(now: Date): string {
  return [
    '당신은 한국 중·고등학교 교사용 데스크톱 앱 "쌤핀"의 도우미입니다.',
    `오늘은 ${formatSeoulToday(now)} 입니다. 날짜·요일·기한은 이 날짜를 기준으로 판단합니다.`,
    '선생님의 일정·할 일·시간표·학생 기록 같은 앱 자료는 도구로 조회합니다. "[앱에서 조회한 결과]"로 받은 내용만 사실로 말하고, 없는 내용은 지어내지 말고 모른다고 말합니다.',
    '학생 이름은 개인정보 보호를 위해 ［이름1］처럼 별칭으로 바뀌어 있습니다. 별칭을 그대로 쓰세요. 화면에서 원래 이름으로 보입니다.',
    '저장·수정·삭제가 필요하면 해당 도구를 고르세요. 실제 저장은 선생님이 화면에서 확인한 뒤에만 됩니다. 직접 "저장했다"고 말하지 마세요.',
    '',
    PLAIN_ANSWER_INSTRUCTION,
  ].join('\n');
}

/**
 * 쌤핀 AI 패널 한 번의 대화 — 지시문 + 이력 + (있으면) 앱이 조회한 결과.
 *
 * ★조회 결과 모양은 쌤핀 AI 서버(`buildToolResultsTurn`)와 같게 둔다 — 같은 도구 설명·같은 화면
 *   흐름을 쓰므로, 모델이 보는 모양이 통로마다 다르면 답의 질이 통로마다 달라진다.
 * ★`data` 는 이미 이름을 가린(ModelSafe) 사본이다. 여기서 다시 고치지 않는다.
 */
export function buildApiKeyChatMessages(
  systemPrompt: string,
  turns: readonly { readonly role: 'user' | 'assistant'; readonly content: string }[],
  toolResults: readonly { readonly tool: string; readonly data: unknown }[],
): { role: 'system' | 'user' | 'assistant'; content: string }[] {
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: systemPrompt },
    ...turns.map((t) => ({ role: t.role, content: t.content })),
  ];
  if (toolResults.length > 0) {
    const lines = toolResults.map((r) => `- ${r.tool}: ${JSON.stringify(r.data)}`);
    messages.push({ role: 'user', content: ['[앱에서 조회한 결과]', ...lines].join('\n') });
  }
  return messages;
}

/**
 * [연결 확인]이 실패했을 때의 안내 — 설정 화면 안에서 보는 말이라 "설정에서 다시 넣으라"고 하지 않는다.
 * 패널·초안에서 쓰는 문구는 `OWN_AI_ERROR_MESSAGES` 에 따로 있다.
 */
export function apiKeySetupMessage(reason: string): string {
  switch (reason) {
    case 'empty':
    case 'too-short':
    case 'too-long':
    case 'invalid-chars':
      return API_KEY_INPUT_MESSAGES[reason];
    case 'key-invalid':
      return '서비스가 이 키를 받아 주지 않았어요. 키를 끝까지 복사했는지, 위에서 고른 서비스가 맞는지 확인해 주세요.';
    case 'key-no-credit':
      return '키는 맞지만 남은 금액이 없어요. 서비스 사이트에서 충전한 뒤 다시 확인해 주세요.';
    case 'key-rate-limited':
      return '요청이 몰렸거나 사용 한도에 닿았어요. 잠시 뒤 다시 확인해 주세요.';
    case 'key-model-unavailable':
      return '이 키로 쓸 수 있는 대화 모델을 찾지 못했어요. 구독·요금제를 확인해 주세요.';
    case 'key-network':
      return '서비스에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.';
    case 'key-timeout':
      return '확인이 너무 오래 걸려 멈췄어요. 잠시 뒤 다시 확인해 주세요.';
    default:
      return '지금은 확인하지 못했어요. 잠시 뒤 다시 확인해 주세요.';
  }
}
