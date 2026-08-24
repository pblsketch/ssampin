/**
 * 쌤핀 AI — 요청 실패 사유 판정
 *
 * 배경(2026-08-23 사용자 신고): 인터넷이 멀쩡한데 "인터넷이 끊겨 AI 요약을 못 받았어요"가
 * 떴다. `fetch` 가 실패한 모든 경우를 `offline` 하나로 몰아넣었기 때문이다. 사유가 다르면
 * 선생님이 할 일도 다르므로(기다린다 / 인터넷을 본다 / 우리 쪽 문제다) 여기서 갈라준다.
 */
import { describe, it, expect, afterEach } from 'vitest';

import { classifyFetchFailure } from '../AssistClient';

/** `navigator.onLine` 은 읽기 전용이라 테스트에서 갈아끼우려면 정의를 덮어야 한다. */
function setOnLine(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

afterEach(() => {
  setOnLine(true);
});

describe('classifyFetchFailure', () => {
  it('시간 초과는 timeout — 인터넷 탓으로 돌리지 않는다', () => {
    setOnLine(true);
    const timeout = new DOMException('signal timed out', 'TimeoutError');

    expect(classifyFetchFailure(timeout)).toBe('timeout');
  });

  it('인터넷이 정말 끊겼을 때만 offline', () => {
    setOnLine(false);

    expect(classifyFetchFailure(new TypeError('Failed to fetch'))).toBe('offline');
  });

  it('인터넷은 되는데 요청이 실패하면 unreachable — 이것이 오진하던 경우다', () => {
    setOnLine(true);

    expect(classifyFetchFailure(new TypeError('Failed to fetch'))).toBe('unreachable');
  });

  it('끊긴 상태에서도 시간 초과는 timeout이 먼저다', () => {
    setOnLine(false);
    const timeout = new DOMException('signal timed out', 'TimeoutError');

    expect(classifyFetchFailure(timeout)).toBe('timeout');
  });
});
