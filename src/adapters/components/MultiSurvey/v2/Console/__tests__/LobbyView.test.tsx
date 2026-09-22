// @vitest-environment jsdom
/**
 * 교사 콘솔의 학생 입장 대기 화면.
 *
 * 인터넷 참여 주소가 나오기 전에는 **주소 칸도 QR도 그리지 않는다.**
 * 옛 화면은 같은 Wi-Fi 주소를 먼저 띄워 놓고 인터넷 주소가 나오면 갈아치웠는데,
 * 그 사이 선생님이 되지도 않을 주소를 불러 줄 수 있었다.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LobbyView } from '../LobbyView';

const toDataURL = vi.hoisted(() => vi.fn(async () => 'data:image/png;base64,QQ=='));
vi.mock('qrcode', () => ({ default: { toDataURL } }));

afterEach(() => {
  cleanup();
  toDataURL.mockClear();
});

const LAN = 'http://192.168.0.5:63108';

describe('입장 대기 화면', () => {
  it('인터넷 주소가 나오면 QR·주소·코드를 안내한다', async () => {
    render(
      <LobbyView
        entryUrl="https://ssampin.app/s/HAPPY7"
        entryCode="HAPPY7"
        entryKind="internet"
        students={[]}
      />,
    );
    expect(await screen.findByAltText('입장 QR 코드')).toBeTruthy();
    expect(screen.getByLabelText('입장 주소').textContent).toBe('https://ssampin.app/s/HAPPY7');
    expect(screen.getByLabelText('입장 코드 HAPPY7')).toBeTruthy();
  });

  it('준비 중에는 주소 칸도 QR도 그리지 않는다', () => {
    render(<LobbyView entryUrl="" entryKind="preparing" students={[]} />);
    expect(screen.queryByLabelText('입장 주소')).toBeNull();
    expect(screen.queryByLabelText('입장 QR 코드')).toBeNull();
    expect(toDataURL).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('준비 중에는 기다리지 않고 같은 Wi-Fi 주소로 내려갈 수 있다', () => {
    const onUseLocalEntry = vi.fn();
    render(
      <LobbyView
        entryUrl=""
        entryKind="preparing"
        onUseLocalEntry={onUseLocalEntry}
        students={[]}
      />,
    );
    const escape = screen.getByRole('button', { name: '기다리지 않고 같은 Wi-Fi 주소로 시작하기' });
    escape.click();
    expect(onUseLocalEntry).toHaveBeenCalledOnce();
  });

  it('같은 Wi-Fi 주소가 없으면 내려갈 단추도 두지 않는다', () => {
    render(<LobbyView entryUrl="" entryKind="preparing" students={[]} />);
    expect(screen.queryByRole('button', { name: /같은 Wi-Fi 주소로 시작/ })).toBeNull();
  });

  it('같은 Wi-Fi 주소로 내려가면 제목이 그것을 말한다', async () => {
    render(<LobbyView entryUrl={LAN} entryKind="local" students={[]} />);
    expect(screen.getByText('같은 Wi-Fi 주소로 입장 대기 중')).toBeTruthy();
    expect(screen.getByLabelText('입장 주소').textContent).toBe(LAN);
    // 주소가 있으니 QR은 그린다 — 교실에서 찍을 수는 있어야 한다.
    expect(await screen.findByAltText('입장 QR 코드')).toBeTruthy();
    // 내려온 뒤에는 되돌릴 단추를 두지 않는다(이미 불러 준 주소를 갈아치우지 않는다).
    expect(screen.queryByRole('button', { name: /같은 Wi-Fi 주소로 시작/ })).toBeNull();
  });
});
