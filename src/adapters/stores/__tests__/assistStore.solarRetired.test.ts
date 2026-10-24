/** @vitest-environment jsdom */
/**
 * 무료 쌤핀 AI 종료 (ADR-142 결정 7, v2.5.6) — 예전에 켜 둔 값은 불러올 때 꺼진다.
 * 남겨 두면 답이 오지 않는 통로로 질문이 나가고, 구독·키 실패 때 쌤핀 AI 로 넘기는 폴백도 살아 있게 된다.
 */
import { describe, expect, it } from 'vitest';
import { useAssistStore } from '../useAssistStore';

describe('무료 쌤핀 AI 종료', () => {
  it('저장된 enabled:true 는 불러오면 false — 다른 설정은 그대로', async () => {
    localStorage.setItem(
      'ssampin-assist-v1',
      JSON.stringify({
        state: { enabled: true, ownAiEnabled: true, provider: 'apikey', installId: 'keep-me' },
        version: 0,
      }),
    );
    await useAssistStore.persist.rehydrate();
    const s = useAssistStore.getState();
    expect(s.enabled).toBe(false);
    expect(s.ownAiEnabled).toBe(true);
    expect(s.provider).toBe('apikey');
    expect(s.installId).toBe('keep-me');
  });
});
