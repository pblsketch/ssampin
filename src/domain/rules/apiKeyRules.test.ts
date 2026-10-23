import { describe, expect, it } from 'vitest';
import {
  buildApiKeyPanelSystemPrompt,
  classifyApiKeyHttpError,
  formatSeoulToday,
  guessApiKeyService,
  isApiKeyServiceId,
  isPlausibleModelId,
  maskApiKey,
  normalizeApiKeyInput,
  redactSecret,
  selectApiKeyModels,
} from './apiKeyRules';

const KEY = 'sk-or-v1-0123456789abcdef0123456789abcdef';

describe('normalizeApiKeyInput — 선생님이 실제로 붙여 넣는 모양', () => {
  it.each([
    [`  ${KEY}\n`],
    [`"${KEY}"`],
    [`'${KEY}'`],
    [`Bearer ${KEY}`],
    [`OPENROUTER_API_KEY=${KEY}`],
    [`OPENROUTER_API_KEY: "${KEY}"`],
    [`\u200B${KEY}\uFEFF`],
  ])('%j → 키만 남긴다', (raw) => {
    expect(normalizeApiKeyInput(raw)).toEqual({ ok: true, key: KEY });
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['sk-short', 'too-short'],
    [`${KEY} ${KEY}`, 'invalid-chars'],
    [`키${KEY}`, 'invalid-chars'],
    ['x'.repeat(600), 'too-long'],
  ])('%j → %s', (raw, problem) => {
    expect(normalizeApiKeyInput(raw)).toEqual({ ok: false, problem });
  });
});

describe('maskApiKey / guessApiKeyService', () => {
  it('끝 4자리만 보인다', () => {
    expect(maskApiKey(KEY)).toBe('••••cdef');
    expect(maskApiKey('short-key')).toBe('••••');
  });
  it('모양으로 서비스를 짐작한다(안내용)', () => {
    expect(guessApiKeyService(KEY)).toBe('openrouter');
    expect(guessApiKeyService('AIzaSyD' + 'x'.repeat(30))).toBe('gemini');
    expect(guessApiKeyService('sk-abc')).toBeNull();
  });
});

describe('redactSecret', () => {
  it('원문·앞뒤 절반·키처럼 생긴 덩어리를 모두 지운다', () => {
    const half = KEY.slice(0, KEY.length / 2);
    const text = `bad key ${KEY} / ${half}... / other sk-abcdefghijklmnop / AIza${'q'.repeat(30)} / Bearer abc.def.ghi123`;
    const out = redactSecret(text, KEY);
    expect(out).not.toContain(KEY);
    expect(out).not.toContain(half);
    expect(out).not.toContain('sk-abcdefghijklmnop');
    expect(out).not.toContain('AIza');
    expect(out).not.toContain('abc.def.ghi123');
    expect(out).toContain('bad key');
  });
});

describe('classifyApiKeyHttpError', () => {
  it.each([
    [401, '', 'key-invalid'],
    [403, '', 'key-invalid'],
    [402, '', 'key-no-credit'],
    [429, '', 'key-rate-limited'],
    [404, '', 'key-model-unavailable'],
    [400, 'API key not valid. Please pass a valid API key.', 'key-invalid'],
    [400, 'Insufficient balance', 'key-no-credit'],
    [400, 'Model is unavailable', 'key-model-unavailable'],
    [400, 'messages must not be empty', 'key-provider-error'],
    [504, '', 'key-timeout'],
    [500, '', 'key-provider-error'],
  ])('%i %j → %s', (status, body, kind) => {
    expect(classifyApiKeyHttpError(status, body)).toBe(kind);
  });
});

describe('selectApiKeyModels', () => {
  it('제미나이: 대화 모델만, 늘-최신 Flash 를 추천', () => {
    const r = selectApiKeyModels('gemini', [
      { id: 'models/gemini-2.5-flash' },
      { id: 'models/gemini-2.5-flash-preview-tts' },
      { id: 'models/gemini-3.1-flash-image' },
      { id: 'models/gemma-4-31b-it' },
      { id: 'models/gemini-embedding-2' },
      { id: 'models/gemini-3.8-live' },
      { id: 'models/deep-research-preview-04-2026' },
      { id: 'models/gemini-flash-latest' },
      { id: 'models/gemini-flash-latest' },
    ]);
    expect(r).toEqual([
      { id: 'models/gemini-flash-latest', label: 'Gemini Flash (늘 최신)', recommended: true },
      { id: 'models/gemini-2.5-flash', label: 'gemini-2.5-flash', recommended: false },
    ]);
  });

  it('오픈라우터: 세 회사·유료·글 출력·도구 지원만, 변형(:batch)·무료 제외', () => {
    const base = {
      promptPrice: '0.000001',
      outputModalities: ['text'],
      supportedParameters: ['tools'],
    };
    const r = selectApiKeyModels('openrouter', [
      { id: 'google/gemini-3.8-flash', name: 'Google: Gemini 3.8 Flash', ...base },
      { id: 'anthropic/claude-haiku-5.5', name: 'Anthropic: Claude Haiku 5.5', ...base },
      { id: 'anthropic/claude-haiku-5.5:batch', name: 'x', ...base },
      { id: 'google/gemma-4-31b-it:free', name: 'x', ...base, promptPrice: '0' },
      { id: 'deepseek/deepseek-v4', name: 'x', ...base },
      { id: 'openai/gpt-5.4-image-2', name: 'x', ...base, outputModalities: ['image', 'text'] },
      { id: 'openai/gpt-x-notools', name: 'x', ...base, supportedParameters: ['temperature'] },
    ]);
    expect(r.map((m) => [m.id, m.label, m.recommended])).toEqual([
      ['anthropic/claude-haiku-5.5', 'Claude Haiku 5.5', true],
      ['google/gemini-3.8-flash', 'Gemini 3.8 Flash', false],
    ]);
  });

  it('오픈코드: OpenAI 형식 집안만, 무료·코딩 판본 제외', () => {
    const ids = [
      'big-pickle',
      'glm-5.3-flash-free',
      'claude-haiku-5-5',
      'gpt-6-luna',
      'gemini-3.8-flash',
      'qwen3.8-max',
      'kimi-k2.7-code',
      'muse-spark-1.3-contributor',
      'deepseek-v4.1-flash',
      'kimi-k3',
      'glm-5.3',
    ].map((id) => ({ id }));
    expect(selectApiKeyModels('opencode-go', ids).map((m) => [m.id, m.recommended])).toEqual([
      ['glm-5.3', true],
      ['deepseek-v4.1-flash', false],
      ['kimi-k3', false],
    ]);
  });

  it('쓸 수 있는 모델이 없으면 빈 배열', () => {
    expect(selectApiKeyModels('opencode-zen', [{ id: 'big-pickle' }])).toEqual([]);
  });
});

describe('입력 검사', () => {
  it('서비스 id', () => {
    expect(isApiKeyServiceId('gemini')).toBe(true);
    expect(isApiKeyServiceId('../gemini')).toBe(false);
    expect(isApiKeyServiceId(1)).toBe(false);
  });
  it('모델 id', () => {
    expect(isPlausibleModelId('models/gemini-flash-latest')).toBe(true);
    expect(isPlausibleModelId('anthropic/claude-haiku-5.5')).toBe(true);
    expect(isPlausibleModelId('a b')).toBe(false);
    expect(isPlausibleModelId('')).toBe(false);
  });
});

describe('패널 지시문', () => {
  it('서울 날짜를 쓴다 — UTC 자정 직후에도 서울 날짜', () => {
    expect(formatSeoulToday(new Date('2026-10-23T16:30:00Z'))).toBe('2026-10-24 (토)');
  });
  it('날짜·별칭 안내·평문 지시가 들어 있다', () => {
    const p = buildApiKeyPanelSystemPrompt(new Date('2026-10-24T01:00:00Z'));
    expect(p).toContain('2026-10-24 (토)');
    expect(p).toContain('［이름1］');
    expect(p).toContain('마크다운을 쓰지 마세요');
  });
});
