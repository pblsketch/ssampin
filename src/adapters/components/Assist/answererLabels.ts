/**
 * 패널 헤더(고르기)와 답변 배지가 **같은 말**을 쓰게 하는 작은 사전.
 *
 * 헤더는 `AssistDock`, 배지는 `AssistThread` 에 있고 `AssistDock` 이 `AssistThread` 를
 * import 하므로, 둘 다 여기서 가져가야 순환 import 가 생기지 않는다.
 */
import type { OwnAiProviderId } from '@domain/entities/OwnAiProvider';
import {
  AI_RUN_PROVIDER_LABELS,
  shortApiKeyModelLabel,
  type AiRunProviderId,
} from '@domain/entities/ApiKeyProvider';
import { OWN_AI_MODELS } from '@domain/rules/ownAiCliRules';

/** 누가 답하는가 — 쌤핀 AI(서버), 선생님 구독 CLI, 또는 선생님 API 키. */
export type Answerer = AiRunProviderId | 'ssampin';

export function answererLabel(a: Answerer): string {
  return a === 'ssampin' ? '쌤핀 AI' : AI_RUN_PROVIDER_LABELS[a];
}

/** 배지에 쓸 모델 이름 — 구독 CLI 는 쌤핀 목록의 이름, API 키는 서비스가 준 id 를 줄여서. */
export function runModelLabel(provider: AiRunProviderId, model: string): string {
  return provider === 'apikey' ? shortApiKeyModelLabel(model) : shortModelLabel(provider, model);
}

/** "Sonnet — 빠름" → "Sonnet", "기본 (권장)" → "기본". 목록에 없는 값은 그대로 보여 준다. */
export function shortModelLabel(provider: OwnAiProviderId, model: string): string {
  const label = OWN_AI_MODELS[provider].find((m) => m.id === model)?.label ?? model;
  const head = label.split(' — ')[0] ?? label;
  return head.replace(/\s*\(권장\)$/, '');
}
