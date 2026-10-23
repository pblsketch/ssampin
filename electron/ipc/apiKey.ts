/**
 * 내 API 키(BYOK) IPC — 화면과 금고·서비스 사이의 유일한 통로 (ADR-143).
 *
 * ★어떤 응답에도 키 원문이 실리지 않는다. 화면은 키를 **넣기만** 하고 다시 받지 못한다.
 *   (`apiKey.test.ts` 가 모든 통로의 응답을 훑어 이것을 확인한다.)
 * ★화면이 고를 수 있는 것은 "어느 서비스·어느 모델"뿐이다. 주소·머리글·키는 고르지 못한다.
 * ★우리 앱 창의 최상위 화면에서 온 요청만 받는다.
 */
import type { IpcMainInvokeEvent } from 'electron';
import type {
  ApiKeyChatResult,
  ApiKeyModelOption,
  ApiKeyModelsResult,
  ApiKeySaveResult,
  ApiKeyServiceId,
  ApiKeyStatusSnapshot,
} from '../../src/domain/entities/ApiKeyProvider';
import { API_KEY_SERVICE_INFO } from '../../src/domain/entities/ApiKeyProvider';
import {
  defaultApiKeyModel,
  guessApiKeyService,
  isApiKeyServiceId,
  isPlausibleModelId,
  isUsableApiKeyModel,
  normalizeApiKeyInput,
} from '../../src/domain/rules/apiKeyRules';
import type { ApiKeyClient, ChatMessage, ChatToolSchema } from './apiKeyClient';
import type { ApiKeyVault } from './apiKeyVault';

/** 한 번에 도는 요청 수 상한 — 화면이 고장 나 같은 요청을 쏟아도 요금이 불어나지 않게. */
const MAX_CONCURRENT = 3;
const MAX_MESSAGES = 80;
const MAX_TOTAL_CHARS = 400_000;
const MAX_TOOLS = 64;
const MAX_TOOLS_JSON = 200_000;
const MODEL_CACHE_MS = 10 * 60_000;
/**
 * 요청 횟수 상한 — 분당·하루. ★키가 새지 않아도 **돈은 샐 수 있다**: 화면이 고장 나거나(무한 반복 효과)
 * 화면에 악성 글이 끼면 이 통로를 선생님 요금으로 마구 부를 수 있다. 사람이 쓰는 속도로는 닿지 않게 넉넉히 잡는다
 * (근거 지도 일괄 생성 한 반 30명 ≈ 60회).
 */
const MAX_PER_MINUTE = 30;
const MAX_PER_DAY = 600;

/** 갈래별 출력·시간 한도. 생기부 초안은 길고 느리다. */
const PURPOSE_LIMITS = {
  panel: { maxTokens: 4096, timeoutMs: 90_000 },
  draft: { maxTokens: 8192, timeoutMs: 180_000 },
} as const;

type Purpose = keyof typeof PURPOSE_LIMITS;

export interface ApiKeyHandlerDeps {
  readonly vault: ApiKeyVault;
  readonly client: ApiKeyClient;
  /** 우리 앱 창에서 온 요청인가 */
  readonly isTrustedSender: (event: IpcMainInvokeEvent) => boolean;
  /** 키 받는 곳을 기본 브라우저로 연다 */
  readonly openExternal: (url: string) => Promise<void>;
  readonly handle: (
    channel: string,
    fn: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
  ) => void;
  /** 클립보드에 방금 넣은 키가 남아 있으면 비운다 — 윈도우 클립보드 기록·다른 앱에 남지 않게 */
  readonly clearClipboardIfHolds?: (key: string) => void;
  /** 테스트가 바꿔 끼우는 시계 */
  readonly now?: () => number;
}

function readPurpose(value: unknown): Purpose | null {
  return value === 'panel' || value === 'draft' ? value : null;
}

function readRequestId(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value : null;
}

/** 화면이 보낸 대화를 검사한다 — 모양이 어긋나면 통째로 거절한다(고쳐서 보내지 않는다). */
export function readMessages(value: unknown): ChatMessage[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) return null;
  let total = 0;
  const out: ChatMessage[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return null;
    const { role, content } = item as { role?: unknown; content?: unknown };
    if (role !== 'system' && role !== 'user' && role !== 'assistant') return null;
    if (typeof content !== 'string') return null;
    total += content.length;
    if (total > MAX_TOTAL_CHARS) return null;
    out.push({ role, content });
  }
  // 마지막은 선생님(또는 앱이 대신 실은 조회 결과) 차례여야 한다.
  if (out[out.length - 1]?.role !== 'user') return null;
  return out;
}

export function readTools(value: unknown): ChatToolSchema[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_TOOLS) return null;
  let json: string;
  try {
    json = JSON.stringify(value);
  } catch {
    return null;
  }
  if (json.length > MAX_TOOLS_JSON) return null;
  const out: ChatToolSchema[] = [];
  for (const item of value) {
    const t = item as {
      type?: unknown;
      function?: { name?: unknown; description?: unknown; parameters?: unknown };
    };
    if (t?.type !== 'function') return null;
    const fn = t.function;
    if (typeof fn?.name !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(fn.name)) return null;
    if (typeof fn.description !== 'string') return null;
    if (typeof fn.parameters !== 'object' || fn.parameters === null) return null;
    out.push({
      type: 'function',
      function: {
        name: fn.name,
        description: fn.description,
        parameters: fn.parameters as Record<string, unknown>,
      },
    });
  }
  return out;
}

export function registerApiKeyHandlers(deps: ApiKeyHandlerDeps): {
  cancelAll: () => void;
} {
  const { vault, client } = deps;
  /** 진행 중 요청 — 키를 지우거나 바꾸면 그 서비스로 가던 요청도 끊는다. */
  const running = new Map<string, { ctrl: AbortController; service: ApiKeyServiceId }>();
  const now = deps.now ?? (() => Date.now());
  let minuteStamps: number[] = [];
  let dayKey = '';
  let dayCount = 0;

  /** 횟수 상한 안인가. 안이면 한 번 센다. */
  function allowRequest(): boolean {
    const t = now();
    const d = new Date(t).toDateString();
    if (d !== dayKey) {
      dayKey = d;
      dayCount = 0;
    }
    minuteStamps = minuteStamps.filter((x) => t - x < 60_000);
    if (minuteStamps.length >= MAX_PER_MINUTE || dayCount >= MAX_PER_DAY) return false;
    minuteStamps.push(t);
    dayCount += 1;
    return true;
  }

  function abortService(service: ApiKeyServiceId): void {
    for (const [id, r] of running) {
      if (r.service !== service) continue;
      r.ctrl.abort();
      running.delete(id);
    }
  }
  const modelCache = new Map<ApiKeyServiceId, { at: number; models: ApiKeyModelOption[] }>();

  /** 신뢰할 수 없는 곳에서 온 요청은 조용히 거절한다 — 무엇이 있는지도 알려 주지 않는다. */
  function guard<T>(
    fn: (event: IpcMainInvokeEvent, ...args: unknown[]) => T,
    rejected: T,
  ): (event: IpcMainInvokeEvent, ...args: unknown[]) => T {
    return (event, ...args) => (deps.isTrustedSender(event) ? fn(event, ...args) : rejected);
  }

  async function modelsOf(service: ApiKeyServiceId, force = false): Promise<ApiKeyModelsResult> {
    const hit = modelCache.get(service);
    if (!force && hit && now() - hit.at < MODEL_CACHE_MS) return { ok: true, models: hit.models };
    const key = vault.getKey(service);
    if (!key) return { ok: false, reason: 'key-missing' };
    const r = await client.listModels(service, key);
    if (!r.ok) return r;
    modelCache.set(service, { at: now(), models: r.models });
    return { ok: true, models: r.models };
  }

  const emptyStatus = (): ApiKeyStatusSnapshot => ({
    encryptionAvailable: false,
    services: [],
    active: null,
  });

  deps.handle(
    'apiKey:status',
    guard(() => vault.status(), emptyStatus()),
  );

  deps.handle(
    'apiKey:save',
    guard(
      async (_e, service: unknown, rawKey: unknown): Promise<ApiKeySaveResult> => {
        if (!isApiKeyServiceId(service) || typeof rawKey !== 'string') {
          return { ok: false, reason: 'empty' };
        }
        const input = normalizeApiKeyInput(rawKey);
        if (!input.ok) return { ok: false, reason: input.problem };
        const key = input.key;

        // ★모양이 분명히 다른 서비스 키면 **보내지 않는다** — 제미나이 칸에 오픈라우터 키를 넣으면 확인 요청이
        //   그 키를 구글로 보낸다. 가장 흔한 실수로 키가 엉뚱한 회사에 가는 것을 막는다(보안 점검 지적).
        const guess = guessApiKeyService(key);
        if (guess !== null && guess !== service) {
          return { ok: false, reason: 'key-invalid', looksLike: guess };
        }

        const verified = await client.verifyKey(service, key);
        if (!verified.ok) return { ok: false, reason: verified.reason };
        // 키를 바꾸는 중이면 옛 키로 가던 요청을 끊는다.
        abortService(service);
        vault.setKey(service, key);
        deps.clearClipboardIfHolds?.(key);
        modelCache.delete(service);

        const listed = await modelsOf(service, true);
        const models = listed.ok ? listed.models : [];
        // 방금 연결한 서비스를 바로 쓰게 한다 — 선생님은 "넣었으니 이제 되겠지"라고 기대한다.
        const model = defaultApiKeyModel(models);
        if (model) vault.setActive({ service, model });
        return { ok: true, status: vault.status(), models };
      },
      Promise.resolve<ApiKeySaveResult>({ ok: false, reason: 'key-invalid' }),
    ),
  );

  deps.handle(
    'apiKey:remove',
    guard((_e, service: unknown): ApiKeyStatusSnapshot => {
      if (!isApiKeyServiceId(service)) return vault.status();
      // 지웠는데 진행 중 요청이 그 키를 계속 쓰면 "지웠다"가 거짓이 된다.
      abortService(service);
      vault.removeKey(service);
      modelCache.delete(service);
      return vault.status();
    }, emptyStatus()),
  );

  deps.handle(
    'apiKey:models',
    guard(
      async (_e, service: unknown, force: unknown): Promise<ApiKeyModelsResult> => {
        if (!isApiKeyServiceId(service)) return { ok: false, reason: 'key-missing' };
        return modelsOf(service, force === true);
      },
      Promise.resolve<ApiKeyModelsResult>({ ok: false, reason: 'key-missing' }),
    ),
  );

  deps.handle(
    'apiKey:setActive',
    guard(async (_e, service: unknown, model: unknown): Promise<ApiKeyStatusSnapshot> => {
      if (!isApiKeyServiceId(service) || !isPlausibleModelId(model)) return vault.status();
      if (!vault.getKey(service)) return vault.status();
      // 목록에 있는 모델만 받는다 — 화면이 아무 이름이나 넣어 요금이 비싼 모델로 가지 않게.
      // ★목록을 못 받았으면 **거절한다**(열어 두면 그때 무료·학습 이용 모델로 바꿀 수 있다).
      const listed = await modelsOf(service);
      if (!listed.ok || !listed.models.some((m) => m.id === model)) return vault.status();
      vault.setActive({ service, model });
      return vault.status();
    }, Promise.resolve(emptyStatus())),
  );

  deps.handle(
    'apiKey:openKeyPage',
    guard(async (_e, service: unknown): Promise<boolean> => {
      // 주소는 화면이 아니라 여기 표에서 꺼낸다 — 화면이 아무 주소나 열게 하지 않는다.
      if (!isApiKeyServiceId(service)) return false;
      await deps.openExternal(API_KEY_SERVICE_INFO[service].keyPageUrl);
      return true;
    }, Promise.resolve(false)),
  );

  deps.handle(
    'apiKey:chat',
    guard(
      async (_e, payload: unknown): Promise<ApiKeyChatResult> => {
        const p = (payload ?? {}) as {
          requestId?: unknown;
          purpose?: unknown;
          messages?: unknown;
          tools?: unknown;
          sessionId?: unknown;
        };
        const requestId = readRequestId(p.requestId);
        const purpose = readPurpose(p.purpose);
        const messages = readMessages(p.messages);
        const tools = readTools(p.tools);
        if (!requestId || !purpose || !messages || tools === null) {
          return { ok: false, reason: 'key-provider-error' };
        }
        if (running.has(requestId)) return { ok: false, reason: 'busy' };
        if (running.size >= MAX_CONCURRENT) return { ok: false, reason: 'busy' };

        const active = vault.getActive();
        if (!active) return { ok: false, reason: 'key-missing' };
        // 고른 모델 파일은 평문이다 — 보내기 직전에 쌤핀 규칙(무료·학습 이용·형식)을 다시 본다.
        if (!isUsableApiKeyModel(active.service, { id: active.model })) {
          return { ok: false, reason: 'key-model-unavailable' };
        }
        const key = vault.getKey(active.service);
        if (!key) return { ok: false, reason: 'key-missing' };
        if (!allowRequest()) return { ok: false, reason: 'key-rate-limited' };

        const ctrl = new AbortController();
        running.set(requestId, { ctrl, service: active.service });
        try {
          const limits = PURPOSE_LIMITS[purpose];
          const r = await client.chat({
            service: active.service,
            key,
            model: active.model,
            messages,
            ...(tools.length > 0 ? { tools } : {}),
            maxTokens: limits.maxTokens,
            timeoutMs: limits.timeoutMs,
            sessionId: readRequestId(p.sessionId) ?? requestId,
            signal: ctrl.signal,
          });
          if (!r.ok) return { ok: false, reason: r.reason };
          return {
            ok: true,
            text: r.text,
            toolCalls: r.toolCalls.map((c) => ({ name: c.name, rawArguments: c.rawArguments })),
            service: active.service,
            model: active.model,
          };
        } finally {
          running.delete(requestId);
        }
      },
      Promise.resolve<ApiKeyChatResult>({ ok: false, reason: 'key-missing' }),
    ),
  );

  deps.handle(
    'apiKey:cancel',
    guard((_e, requestId: unknown): boolean => {
      const id = readRequestId(requestId);
      const r = id ? running.get(id) : undefined;
      if (!r) return false;
      r.ctrl.abort();
      return true;
    }, false),
  );

  return {
    cancelAll: () => {
      for (const r of running.values()) r.ctrl.abort();
      running.clear();
    },
  };
}
