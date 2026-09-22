// @vitest-environment jsdom
/**
 * 교사 주도 진행의 [학생 참여 링크] 모달 — 어떤 주소를 언제 보여 주는가 (ADR-132 와 같은 규칙).
 *
 * 예전에는 QR 주소가 `displayUrl || localUrl` 이라, **인터넷 주소를 기다리는 동안
 * 같은 Wi-Fi 주소와 그 QR이 먼저** 떴다. 그 주소는 교사 컴퓨터와 같은 Wi-Fi에 붙은
 * 기기에서만 열리는데 선생님은 그걸 모르고 불러 준다(휴대전화 데이터를 쓰는 학생은 못 들어온다).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TeacherControlPanel } from './TeacherControlPanel';

// 인자 두 개를 받는 것으로 두어야 `calls[0][1]`(그린 주소)을 타입 안전하게 볼 수 있다.
const toCanvas = vi.hoisted(() =>
  vi.fn(async (_canvas: unknown, _url: string): Promise<void> => undefined),
);
vi.mock('qrcode', () => ({ default: { toCanvas } }));

afterEach(() => {
  cleanup();
  toCanvas.mockClear();
});

const LAN = 'http://192.168.0.5:63108';

const baseProps = {
  phase: 'lobby' as const,
  currentQuestionIndex: 0,
  totalQuestions: 2,
  totalConnected: 0,
  totalAnswered: 0,
  roster: [],
  onActivate: () => {},
  onReveal: () => {},
  onAdvance: () => {},
  onPrev: () => {},
  onReopen: () => {},
  onEnd: () => {},
};

/** 초대 모달을 연다 */
function openInvite(): void {
  const button = screen
    .getAllByRole('button')
    .find((b) => (b.getAttribute('aria-label') ?? '').includes('학생 참여 링크'));
  if (!button) throw new Error('학생 참여 링크 버튼을 찾지 못했다');
  fireEvent.click(button);
}

describe('학생 초대 모달 — 주소를 내놓는 순서', () => {
  it('인터넷 주소를 기다리는 동안에는 같은 Wi-Fi 주소도 QR도 내놓지 않는다', () => {
    render(
      <TeacherControlPanel {...baseProps} liveDisplayUrl="" liveLocalUrl={LAN} liveTunnelLoading />,
    );
    openInvite();
    expect(screen.getByText('인터넷 참여 주소를 준비하고 있어요')).toBeTruthy();
    expect(screen.queryByText(LAN)).toBeNull();
    expect(toCanvas).not.toHaveBeenCalled();
  });

  it('기다리지 않고 같은 Wi-Fi 주소로 내려갈 수 있다 — 그때는 경고가 함께 뜬다', () => {
    render(
      <TeacherControlPanel {...baseProps} liveDisplayUrl="" liveLocalUrl={LAN} liveTunnelLoading />,
    );
    openInvite();
    fireEvent.click(screen.getByText('기다리지 않고 같은 Wi-Fi 주소로 시작하기'));
    expect(screen.getByText(LAN)).toBeTruthy();
    const alert = screen.getByRole('alert').textContent ?? '';
    expect(alert).toContain('같은 Wi-Fi');
    // 아직 만드는 중이므로 "만들지 못했어요"라고 하면 안 된다.
    expect(alert).not.toContain('만들지 못했어요');
    expect(toCanvas.mock.calls[0]?.[1]).toBe(LAN);
  });

  it('인터넷 주소가 나오면 그 주소로 QR을 그리고 경고를 붙이지 않는다', () => {
    render(
      <TeacherControlPanel
        {...baseProps}
        liveDisplayUrl="https://ssampin.app/s/HAPPY7"
        liveShortUrl="https://ssampin.app/s/HAPPY7"
        liveLocalUrl={LAN}
      />,
    );
    openInvite();
    expect(toCanvas.mock.calls[0]?.[1]).toBe('https://ssampin.app/s/HAPPY7');
    expect(screen.queryByText(LAN)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('인터넷 주소가 끝내 실패하면 같은 Wi-Fi 주소를 경고와 함께 내놓는다', () => {
    render(
      <TeacherControlPanel
        {...baseProps}
        liveDisplayUrl=""
        liveLocalUrl={LAN}
        liveTunnelLoading={false}
        liveTunnelError="터널 연결에 실패했습니다"
      />,
    );
    openInvite();
    expect(screen.getByText(LAN)).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('만들지 못했어요');
    expect(toCanvas.mock.calls[0]?.[1]).toBe(LAN);
  });

  it('주소가 하나도 없으면 QR을 그리지 않고 이유를 적는다', () => {
    render(<TeacherControlPanel {...baseProps} liveDisplayUrl="" liveTunnelLoading={false} />);
    openInvite();
    expect(screen.getByText(/접속 주소를 생성할 수 없습니다/)).toBeTruthy();
    expect(toCanvas).not.toHaveBeenCalled();
  });
});
