/**
 * 말로 남기기 통로 — 판정 규칙 테스트.
 *
 * 이 통로에서 조용히 틀리면 **선생님이 말하기 시작했는데 아무것도 안 적히는** 상황이 된다.
 * 그래서 못 박는 것은 두 가지다:
 *  1. 윈도우가 아니면 키를 보내지 않고, 그 OS 의 받아쓰기 여는 법을 한국어로 알려 준다.
 *  2. 키 전송이 실패해도 **예외가 IPC 경계를 넘지 않는다** — 항상 한국어 한 줄로 돌아온다.
 *
 * 이 프로젝트에서 electron 코드를 실제로 실행해 보는 게이트는 `npm run test` 뿐이라
 * (reference_electron_build_and_typecheck), 판정 로직을 Electron 없이 부를 수 있게
 * 떼어 둔 것을 여기서 쓴다.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}));

const {
  planForPlatform,
  startVoiceTyping,
  unsupportedPlatformMessage,
  sendFailureMessage,
  STARTED_RESULT,
} = await import('./voiceTyping');

describe('planForPlatform — 윈도우에서만 키를 보낸다', () => {
  it('윈도우면 null 을 돌려준다 (= 키를 보내라)', () => {
    expect(planForPlatform('win32')).toBeNull();
  });

  it('맥은 fn 키 두 번을 알려 준다 — "지원하지 않습니다" 로 끝내지 않는다', () => {
    const r = planForPlatform('darwin');
    expect(r?.ok).toBe(false);
    expect(r?.reason).toBe('unsupported-platform');
    expect(r?.message).toContain('fn');
  });

  it('그 밖의 OS 도 한국어 안내를 돌려준다', () => {
    const r = planForPlatform('linux');
    expect(r?.ok).toBe(false);
    expect(r?.reason).toBe('unsupported-platform');
    expect(r?.message.length).toBeGreaterThan(0);
  });
});

describe('startVoiceTyping — 실패해도 예외가 밖으로 나가지 않는다', () => {
  it('윈도우에서 성공하면 키를 정확히 한 번 보낸다', () => {
    const send = vi.fn();
    const r = startVoiceTyping('win32', send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(r).toEqual(STARTED_RESULT);
    expect(r.ok).toBe(true);
  });

  it('윈도우가 아니면 키를 아예 보내지 않는다', () => {
    const send = vi.fn();
    const r = startVoiceTyping('darwin', send);
    expect(send).not.toHaveBeenCalled();
    expect(r.ok).toBe(false);
  });

  it('키 전송이 던져도 한국어 결과로 바뀐다 (throw 하지 않는다)', () => {
    const send = vi.fn(() => {
      throw new Error('SendInput이 입력을 전달하지 못했습니다 (0/4).');
    });
    const r = startVoiceTyping('win32', send);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('send-failed');
    // 직접 누르는 길을 먼저 알려 준다 — 원인은 앱이 가려낼 수 없기 때문이다.
    expect(r.message).toContain('직접');
    expect(r.message).toContain('Windows');
  });

  it('Error 가 아닌 값을 던져도 견딘다', () => {
    const send = vi.fn(() => {
      throw 'koffi 없음';
    });
    const r = startVoiceTyping('win32', send);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('koffi 없음');
  });
});

describe('안내 문구', () => {
  it('진단 문구가 비어 있으면 괄호를 붙이지 않는다', () => {
    expect(sendFailureMessage('   ')).not.toContain('(');
  });

  it('진단 문구가 있으면 괄호로 덧붙인다 — 문의·로그에 쓰인다', () => {
    expect(sendFailureMessage('UIPI 차단')).toContain('(UIPI 차단)');
  });

  it('모든 안내는 한국어이고 비어 있지 않다', () => {
    for (const platform of ['darwin', 'linux', 'freebsd']) {
      const msg = unsupportedPlatformMessage(platform);
      expect(msg.trim().length).toBeGreaterThan(0);
      expect(/[가-힣]/.test(msg)).toBe(true);
    }
  });
});
