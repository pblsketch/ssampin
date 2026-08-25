/**
 * OneClickPortalLaunchModal 렌더 테스트 — 무엇이 실제로 화면에 그려지는가.
 *
 * @vitest-environment jsdom
 *
 * 특히 업무 고르기는 **옆핀 즐겨찾기 위젯에서도 이 모달로만** 안내가 나간다.
 * 위젯 창에는 토스트 표시기가 없어서, 여기 안 그려지면 선생님은 아무 설명도 못 받는다.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OneClickPortalLaunchModal } from './OneClickPortalLaunchModal';
import { ONECLICK_PORTAL_TASKS } from '@adapters/constants/oneclickPortalTasks';

// 이 저장소는 vitest globals:false 라 testing-library 자동 정리가 걸리지 않는다.
// 없으면 앞 테스트의 화면이 남아 "버튼이 두 개"로 잡힌다.
afterEach(cleanup);

const noop = () => {};

function renderPicker(overrides: Partial<Parameters<typeof OneClickPortalLaunchModal>[0]> = {}) {
  const onSelectTask = vi.fn();
  const onClose = vi.fn();
  render(
    <OneClickPortalLaunchModal
      open
      mode="task-picker"
      onClose={onClose}
      onLaunch={noop}
      onSelectTask={onSelectTask}
      onOpenSite={noop}
      {...overrides}
    />,
  );
  return { onSelectTask, onClose };
}

describe('업무 고르기', () => {
  it('업무 6가지가 모두 버튼으로 그려진다', () => {
    renderPicker();
    for (const task of ONECLICK_PORTAL_TASKS) {
      expect(screen.getByRole('button', { name: new RegExp(task.label) })).toBeTruthy();
    }
    // 목록이 조용히 줄어드는 일이 없도록 개수도 못 박는다.
    expect(ONECLICK_PORTAL_TASKS).toHaveLength(6);
  });

  it('업무를 누르면 그 이름이 그대로 올라간다', async () => {
    const { onSelectTask } = renderPicker();
    await userEvent.click(screen.getByRole('button', { name: /복무/ }));
    expect(onSelectTask).toHaveBeenCalledWith('leave');
  });

  it("'프로그램만 열기'는 업무 없이 올린다", async () => {
    const { onSelectTask } = renderPicker();
    await userEvent.click(screen.getByRole('button', { name: '프로그램만 열기' }));
    expect(onSelectTask).toHaveBeenCalledWith();
  });

  it('취소는 실행하지 않고 닫기만 한다', async () => {
    const { onSelectTask, onClose } = renderPicker();
    await userEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(onSelectTask).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

describe('첫 실행 고지', () => {
  it('첫 회에는 "쌤핀이 만든 것이 아니다"와 시작 프로그램 등록을 알린다', () => {
    renderPicker({ showNotice: true });
    const notice = screen.getByText(/쌤핀이 만든 기능이 아니라/);
    expect(notice.textContent).toContain('온영범');
    expect(notice.textContent).toContain('시작 프로그램');
  });

  it('두 번째부터는 고지를 접는다 (이 도구의 목적이 클릭 줄이기다)', () => {
    renderPicker({ showNotice: false });
    expect(screen.queryByText(/쌤핀이 만든 기능이 아니라/)).toBeNull();
    // 고지가 없어도 업무는 그대로 고를 수 있어야 한다.
    expect(screen.getByRole('button', { name: /기안/ })).toBeTruthy();
  });
});

describe('구버전·미설치 안내는 그대로 남아 있다', () => {
  it('구버전 첫 실행 안내에는 실행하기가 있다', () => {
    const onLaunch = vi.fn();
    render(
      <OneClickPortalLaunchModal
        open
        mode="first-run"
        onClose={noop}
        onLaunch={onLaunch}
        onOpenSite={noop}
      />,
    );
    expect(screen.getByRole('button', { name: '실행하기' })).toBeTruthy();
    // 구버전에는 업무 목록이 보이면 안 된다 — 눌러도 되지 않는다.
    expect(screen.queryByRole('button', { name: /에듀파인/ })).toBeNull();
  });

  it('미설치 안내는 공식 배포처로 보낸다', async () => {
    const onOpenSite = vi.fn();
    render(
      <OneClickPortalLaunchModal
        open
        mode="not-installed"
        onClose={noop}
        onLaunch={noop}
        onOpenSite={onOpenSite}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /설치하러 가기/ }));
    expect(onOpenSite).toHaveBeenCalled();
  });
});
