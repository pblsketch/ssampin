/**
 * 패널 헤더(고르기)와 답변 배지가 **같은 말**을 쓰게 하는 작은 사전.
 *
 * 헤더는 `AssistDock`, 배지는 `AssistThread` 에 있고 `AssistDock` 이 `AssistThread` 를
 * import 하므로, 둘 다 여기서 가져가야 순환 import 가 생기지 않는다.
 */
import { OWN_AI_PROVIDER_LABELS, type OwnAiProviderId } from '@domain/entities/OwnAiProvider';
import { OWN_AI_MODELS } from '@domain/rules/ownAiCliRules';

/** 누가 답하는가 — 쌤핀 AI(무료·서버) 또는 선생님 구독 CLI. */
export type Answerer = OwnAiProviderId | 'ssampin';

export function answererLabel(a: Answerer): string {
  return a === 'ssampin' ? '쌤핀 AI' : OWN_AI_PROVIDER_LABELS[a];
}

/** "Sonnet — 빠름" → "Sonnet", "기본 (권장)" → "기본". 목록에 없는 값은 그대로 보여 준다. */
export function shortModelLabel(provider: OwnAiProviderId, model: string): string {
  const label = OWN_AI_MODELS[provider].find((m) => m.id === model)?.label ?? model;
  const head = label.split(' — ')[0] ?? label;
  return head.replace(/\s*\(권장\)$/, '');
}
