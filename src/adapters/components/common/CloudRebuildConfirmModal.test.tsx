/**
 * @vitest-environment jsdom
 *
 * CloudRebuildConfirmModal — 안심 3종 안내와 이해 확인 게이트.
 *
 * 이 모달은 클라우드를 통째로 지웠다 다시 만든다. 잘못 눌리면 다른 기기에만 있던
 * 자료가 사라지므로, 체크박스를 켜기 전에는 실행 단추가 눌리면 안 된다
 * (FirstSyncConfirmModal 과 같은 안전 패턴).
 *
 * 동시에 "안심시키는 말"이 빠지면 선생님이 겁먹고 아무것도 못 한 채 동기화가
 * 계속 멈춰 있게 된다. 그래서 안심 문구 2종도 회귀 대상이다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CloudRebuildConfirmModal } from './CloudRebuildConfirmModal';

afterEach(() => cleanup());

function renderModal() {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(<CloudRebuildConfirmModal open onCancel={onCancel} onConfirm={onConfirm} />);
  return { onCancel, onConfirm };
}

/** 실행 단추 — 이름이 바뀌면 이 헬퍼 하나만 고치면 된다. */
function confirmButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: '다시 만들기' }) as HTMLButtonElement;
}

describe('CloudRebuildConfirmModal — 안내 문구', () => {
  beforeEach(() => renderModal());

  it('이 컴퓨터 자료가 안전하다는 것을 알려준다', () => {
    expect(screen.getByText(/이 컴퓨터에 있는 자료는 하나도 지워지지 않아요/)).toBeTruthy();
  });

  it('휴지통에서 30일간 되살릴 수 있다는 것을 알려준다', () => {
    expect(screen.getByText(/휴지통에 30일 동안 남아 되살릴 수 있어요/)).toBeTruthy();
  });

  it('다른 기기에만 있는 변경분이 사라진다는 위험을 알려준다', () => {
    expect(
      screen.getByText(/다른 컴퓨터에서만 바꾸고 이 컴퓨터로 아직 받아오지 않은 내용은 사라져요/),
    ).toBeTruthy();
  });
});

describe('CloudRebuildConfirmModal — 이해 확인 게이트', () => {
  it('체크 전에는 실행 단추가 눌리지 않는다', () => {
    const { onConfirm } = renderModal();
    expect(confirmButton().disabled).toBe(true);
    fireEvent.click(confirmButton());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('체크하면 실행할 수 있다', () => {
    const { onConfirm } = renderModal();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(confirmButton().disabled).toBe(false);
    fireEvent.click(confirmButton());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('취소는 체크 없이도 언제나 가능하다', () => {
    const { onCancel } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('CloudRebuildConfirmModal — body 직속 렌더(유리 모드 함정)', () => {
  // 이 모달은 사이드바 안에서 렌더된다. 사이드바에는 data-sp-glass-surface 가 붙어 있고
  // 유리를 켜면 backdrop-filter 가 걸리는데, 그러면 그 조상이 position:fixed 의
  // containing block 이 되어 모달이 폭 256px 사이드바에 갇히고 잘린다.
  // jsdom 은 레이아웃을 안 재므로 "몸통이 body 직속인가"로 대신 잠근다.
  it('부모 컨테이너 밖(document.body 직속)에 렌더된다', () => {
    const { container } = render(
      <div data-testid="sidebar-like">
        <CloudRebuildConfirmModal open onCancel={() => {}} onConfirm={() => {}} />
      </div>,
    );

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    // 사이드바 흉내 컨테이너 안에 있으면 안 된다.
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
  });

  it('소스가 createPortal 을 실제로 쓴다 (되돌림 방지)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(resolve(__dirname, 'CloudRebuildConfirmModal.tsx'), 'utf-8');
    expect(source).toContain('createPortal(');
    expect(source).toContain('document.body');
  });
});

describe('CloudRebuildConfirmModal — 디자인 규칙', () => {
  it('하드코딩 HEX 와 rounded-sp-* 를 쓰지 않는다', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(resolve(__dirname, 'CloudRebuildConfirmModal.tsx'), 'utf-8');
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toContain('rounded-sp-');
    // sp-* 토큰 + Tailwind 투명도 수식은 클래스가 생성되지 않아 조용히 투명해진다.
    expect(source).not.toMatch(/(bg|text|border)-sp-[a-z-]+\//);
  });
});
