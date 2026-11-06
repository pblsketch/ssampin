/**
 * @vitest-environment jsdom
 *
 * 모바일 안내 배너 — 창 조작 버튼과 겹치지 않는가
 *
 * 배경(2026-11-06 교사 신고): 배너의 [더 알아보기]·[✕]가 창 오른쪽 위에 떠 있는
 * 최소화·최대화·닫기 버튼 밑에 깔려, 누르면 창 버튼이 눌렸다. 배너를 끌 수도 없었다.
 *
 * 비워 두는 폭은 OS 가 알려 주는 값(`env(titlebar-area-*)`)이라 jsdom 에서 잴 수 없다.
 * 끌기 영역(`-webkit-app-region`)도 jsdom 이 속성째 버려서 볼 수 없다 — 실제 창에서 확인한다.
 * 여기서는 창 버튼이 떠 있을 때 배너가 오른쪽 자리를 비우는지, 창 버튼이 없는 환경에서는
 * 아무것도 바꾸지 않는지만 본다.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('qrcode', () => ({ default: { toDataURL: () => Promise.resolve('') } }));

import { MobileAnnouncementBanner } from '../MobileAnnouncementBanner';

function setWindowControlsOverlay(visible: boolean): void {
  Object.defineProperty(navigator, 'windowControlsOverlay', {
    value: { visible, addEventListener: () => {}, removeEventListener: () => {} },
    configurable: true,
  });
}

/** 배너 줄 = [더 알아보기] 단추를 품은 맨 바깥 줄 */
function bannerRow(): HTMLElement {
  const row = screen.getByRole('button', { name: '더 알아보기' }).parentElement?.parentElement;
  if (!row) throw new Error('배너 줄을 찾지 못했다');
  return row;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  Reflect.deleteProperty(navigator, 'windowControlsOverlay');
});

describe('MobileAnnouncementBanner — 창 조작 버튼 자리', () => {
  it('창 버튼이 떠 있으면 오른쪽에 창 버튼 자리를 비운다', () => {
    setWindowControlsOverlay(true);
    render(<MobileAnnouncementBanner />);

    const style = bannerRow().getAttribute('style') ?? '';
    expect(style).toContain('padding-right');
    expect(style).toContain('titlebar-area-width');
  });

  it('창 버튼이 없는 환경(브라우저·macOS)에서는 줄 모양을 바꾸지 않는다', () => {
    setWindowControlsOverlay(false);
    render(<MobileAnnouncementBanner />);

    expect(bannerRow().getAttribute('style')).toBeNull();
  });

  it('닫기를 누르면 배너가 사라진다', () => {
    setWindowControlsOverlay(true);
    render(<MobileAnnouncementBanner />);

    fireEvent.click(screen.getByRole('button', { name: '모바일 안내 닫기' }));

    expect(screen.queryByRole('button', { name: '더 알아보기' })).toBeNull();
  });
});
