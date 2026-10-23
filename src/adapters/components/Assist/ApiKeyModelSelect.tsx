/**
 * 내 API 키로 답할 때 쓰는 모델 고르기 — AI 패널 머리와 생기부 초안 패널이 같이 쓴다 (ADR-143).
 *
 * 고른 값은 main 의 금고(`active.json`)에 바로 들어간다. 설정 > AI 연결의 고르기와 **같은 값**이라
 * 어디서 바꾸든 다른 곳에도 그대로 보인다.
 */
import { useEffect } from 'react';

import { shortApiKeyModelLabel } from '@domain/entities/ApiKeyProvider';
import { useApiKeyStatusStore } from '@adapters/stores/useApiKeyStatusStore';

interface Props {
  readonly disabled?: boolean;
  readonly className?: string;
}

export function ApiKeyModelSelect({ disabled = false, className }: Props) {
  const active = useApiKeyStatusStore((s) => s.snapshot?.active ?? null);
  const models = useApiKeyStatusStore((s) => (active ? s.models[active.service] : undefined));
  const loadModels = useApiKeyStatusStore((s) => s.loadModels);
  const setActive = useApiKeyStatusStore((s) => s.setActive);

  useEffect(() => {
    if (active) void loadModels(active.service);
  }, [active, loadModels]);

  if (!active) return null;

  const options = models?.state === 'ready' ? models.models : [];
  // 목록을 아직 못 받았거나 고른 모델이 목록에 없어도 지금 값은 보여야 한다.
  const hasCurrent = options.some((m) => m.id === active.model);

  return (
    <select
      value={active.model}
      onChange={(e) => void setActive(active.service, e.target.value)}
      disabled={disabled || options.length === 0}
      aria-label="API 키 모델 고르기"
      className={
        className ??
        'max-w-[10rem] rounded-lg border border-sp-border bg-sp-bg px-1.5 py-0.5 text-xs text-sp-text disabled:opacity-50'
      }
    >
      {!hasCurrent && <option value={active.model}>{shortApiKeyModelLabel(active.model)}</option>}
      {options.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
          {m.recommended ? ' (추천)' : ''}
        </option>
      ))}
    </select>
  );
}
