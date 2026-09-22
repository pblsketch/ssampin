// @vitest-environment jsdom
/**
 * 교실 화면 상단 입장 배너.
 *
 * 특히 **대기 → 활동 시작**에서 QR을 다시 그리는지 고정한다.
 * 그때 주소는 그대로라, 주소만 의존성으로 보면 효과가 다시 돌지 않아
 * 활동 내내 빈 캔버스가 남는다(실제로 그랬다). 학교망에서는 주소가 IP라
 * 학생이 QR 없이 26글자를 손으로 쳐야 해서 그냥 넘길 수 없다.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ShareEntryCodeBar } from '../ShareEntryCodeBar';

const toCanvas = vi.hoisted(() => vi.fn());
vi.mock('qrcode', () => ({ default: { toCanvas } }));

afterEach(() => {
  cleanup();
  toCanvas.mockClear();
});

const LAN = 'http://125.177.195.51:63108';

describe('교실 화면 입장 배너', () => {
  it('활동 중에는 QR을 그려 학생이 주소를 치지 않아도 되게 한다', () => {
    render(<ShareEntryCodeBar entryUrl={LAN} studentCount={3} showQr />);
    expect(screen.getByLabelText('학생 입장 QR 코드')).toBeTruthy();
    expect(toCanvas).toHaveBeenCalledOnce();
    expect(toCanvas.mock.calls[0]?.[1]).toBe(LAN);
  });

  it('대기 화면에서는 배너 QR을 숨긴다 — 본문에 큰 QR이 이미 있다', () => {
    render(<ShareEntryCodeBar entryUrl={LAN} studentCount={0} showQr={false} />);
    expect(screen.queryByLabelText('학생 입장 QR 코드')).toBeNull();
    expect(screen.getByText('참여 주소')).toBeTruthy();
  });

  it('대기에서 활동으로 넘어가면 같은 주소여도 QR을 다시 그린다', () => {
    const { rerender } = render(
      <ShareEntryCodeBar entryUrl={LAN} studentCount={0} showQr={false} />,
    );
    expect(toCanvas).not.toHaveBeenCalled();
    rerender(<ShareEntryCodeBar entryUrl={LAN} studentCount={1} showQr />);
    // 주소가 그대로여도 캔버스가 새로 붙었으므로 다시 그려야 한다.
    expect(toCanvas).toHaveBeenCalledOnce();
    expect(toCanvas.mock.calls[0]?.[1]).toBe(LAN);
  });

  it('주소가 바뀌면(로컬 IP → 짧은 주소) QR도 따라 바뀐다', () => {
    const { rerender } = render(<ShareEntryCodeBar entryUrl={LAN} studentCount={0} showQr />);
    rerender(<ShareEntryCodeBar entryUrl="https://ssampin.app/s/HAPPY7" studentCount={0} showQr />);
    expect(toCanvas).toHaveBeenCalledTimes(2);
    expect(toCanvas.mock.calls[1]?.[1]).toBe('https://ssampin.app/s/HAPPY7');
  });

  it('QR은 테마와 무관하게 밝은 바탕·어두운 모듈로 그린다 — 안 그러면 안 찍힌다', () => {
    render(<ShareEntryCodeBar entryUrl={LAN} studentCount={0} showQr />);
    expect(toCanvas.mock.calls[0]?.[2]).toMatchObject({
      color: { dark: '#000000', light: '#ffffff' },
    });
  });

  it('코드가 있으면 코드를 따로 크게 보여 준다', () => {
    render(
      <ShareEntryCodeBar
        entryUrl="https://ssampin.app/s/HAPPY7"
        entryCode="HAPPY7"
        studentCount={2}
        showQr
      />,
    );
    expect(screen.getByLabelText('입장 코드 HAPPY7')).toBeTruthy();
  });

  it('코드 발급이 실패해도 주소만으로 진행한다', () => {
    render(<ShareEntryCodeBar entryUrl={LAN} entryCode={null} studentCount={2} showQr />);
    expect(screen.queryByText('코드')).toBeNull();
    expect(screen.getByLabelText(`입장 주소 ${LAN}`)).toBeTruthy();
  });

  it('주소를 준비하는 중에는 빈 주소 칸도 QR도 그리지 않는다', () => {
    render(<ShareEntryCodeBar entryUrl="" studentCount={0} showQr entryKind="preparing" />);
    expect(screen.queryByLabelText('학생 입장 QR 코드')).toBeNull();
    expect(screen.queryByLabelText('입장 주소 ')).toBeNull();
    expect(toCanvas).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('같은 Wi-Fi 주소일 때는 그 한계를 화면에 적는다', () => {
    render(<ShareEntryCodeBar entryUrl={LAN} studentCount={2} showQr entryKind="local" />);
    expect(screen.getByLabelText(`입장 주소 ${LAN}`)).toBeTruthy();
    expect(screen.getByText(/같은 Wi-Fi/)).toBeTruthy();
  });

  it('인터넷 주소에는 군더더기 안내를 붙이지 않는다', () => {
    render(
      <ShareEntryCodeBar
        entryUrl="https://ssampin.app/s/HAPPY7"
        studentCount={2}
        showQr
        entryKind="internet"
      />,
    );
    expect(screen.queryByText(/같은 Wi-Fi/)).toBeNull();
  });

  it('주소를 잘라 보여 줘도 QR과 읽어 주는 이름에는 원본이 그대로 들어간다', () => {
    const long = `https://example.com/${'a'.repeat(80)}`;
    render(<ShareEntryCodeBar entryUrl={long} studentCount={0} showQr />);
    expect(screen.getByLabelText(`입장 주소 ${long}`)).toBeTruthy();
    expect(toCanvas.mock.calls[0]?.[1]).toBe(long);
  });
});
