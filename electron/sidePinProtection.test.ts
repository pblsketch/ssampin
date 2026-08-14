/**
 * 옆핀 보호 상태 판단 테스트.
 *
 * 이 판단이 틀리면 **잠금 화면 위로 손잡이와 메모 내용이 그대로 드러난다.**
 * 실제로 잠그고 재워 봐야 알 수 있는 상황들을 값으로 재현해 고정한다.
 */
import { describe, expect, it } from 'vitest';
import { createSidePinProtectionTracker } from './sidePinProtection';

describe('한 가지 이유', () => {
  it('잠그면 숨기고, 풀면 다시 보인다', () => {
    const tracker = createSidePinProtectionTracker();

    expect(tracker.protect('lock')).toEqual({ kind: 'protect', reason: 'lock' });
    expect(tracker.isProtected()).toBe(true);

    expect(tracker.release('lock')).toEqual({ kind: 'release' });
    expect(tracker.isProtected()).toBe(false);
  });

  it('같은 이유가 두 번 와도 상태는 그대로다', () => {
    const tracker = createSidePinProtectionTracker();
    tracker.protect('lock');

    expect(tracker.protect('lock')).toEqual({ kind: 'none' });
  });

  it('숨긴 적 없는 이유를 풀면 아무 일도 없다', () => {
    const tracker = createSidePinProtectionTracker();

    expect(tracker.release('suspend')).toEqual({ kind: 'none' });
    expect(tracker.isProtected()).toBe(false);
  });
});

describe('잠금과 절전이 겹칠 때 — 이 기능의 핵심', () => {
  it('잠근 채로 절전에 들어갔다가 깨어나도 잠금이 남아 있으면 계속 숨는다', () => {
    // 실제 순서: 잠금 → 절전 → resume(로그인 전) → 사용자가 로그인 → unlock
    // resume 시점에 풀어 버리면 잠금 화면 위로 메모가 드러난다.
    const tracker = createSidePinProtectionTracker();
    tracker.protect('lock');
    tracker.protect('suspend');

    const afterResume = tracker.release('suspend');

    expect(afterResume).toEqual({ kind: 'protect', reason: 'lock' });
    expect(tracker.isProtected()).toBe(true);
  });

  it('로그인까지 끝나야 비로소 풀린다', () => {
    const tracker = createSidePinProtectionTracker();
    tracker.protect('lock');
    tracker.protect('suspend');
    tracker.release('suspend');

    expect(tracker.release('lock')).toEqual({ kind: 'release' });
    expect(tracker.isProtected()).toBe(false);
  });

  it('푸는 순서가 뒤바뀌어도 마지막 하나가 풀릴 때만 보인다', () => {
    const tracker = createSidePinProtectionTracker();
    tracker.protect('suspend');
    tracker.protect('lock');

    expect(tracker.release('lock')).toEqual({ kind: 'protect', reason: 'suspend' });
    expect(tracker.release('suspend')).toEqual({ kind: 'release' });
  });
});

describe('main.ts 가 실제로 이 판단을 쓴다', () => {
  it('전원 이벤트 네 곳에 모두 연결되어 있다', async () => {
    // tsc 가 electron/ 을 검사하지 않아, 연결이 빠져도 타입으로는 막히지 않는다.
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(__dirname, 'main.ts'), 'utf-8');

    expect(src).toContain("protectSidePin('suspend')");
    expect(src).toContain("releaseSidePinProtection('suspend')");
    expect(src).toContain("protectSidePin('lock')");
    expect(src).toContain("releaseSidePinProtection('lock')");
  });
});
