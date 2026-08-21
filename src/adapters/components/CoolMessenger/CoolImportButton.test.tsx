// @vitest-environment jsdom
/**
 * "쿨메신저에서 가져오기" 버튼 노출 규칙 테스트.
 *
 * 잠그는 계약 — **설정에서 켜지 않으면 어디에도 보이지 않는다.**
 * 쿨메신저를 안 쓰는 시도교육청이 많아서, 안 쓰는 선생님께 이 버튼이 보이면
 * 기능이 아니라 잡음이 된다. 기본값이 실수로 켬으로 바뀌는 회귀를 여기서 막는다.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const settingsState = {
  settings: { coolMessengerImportEnabled: false } as Record<string, unknown>,
};

vi.mock('@adapters/stores/useSettingsStore', () => ({
  useSettingsStore: (selector: (s: typeof settingsState) => unknown) => selector(settingsState),
}));
vi.mock('@adapters/stores/useEventsStore', () => ({
  useEventsStore: (selector: (s: { addEvent: unknown }) => unknown) =>
    selector({ addEvent: vi.fn() }),
}));
vi.mock('@adapters/stores/useTodoStore', () => ({
  useTodoStore: (selector: (s: { addTodo: unknown }) => unknown) => selector({ addTodo: vi.fn() }),
}));
vi.mock('@adapters/stores/useStudentStore', () => ({
  useStudentStore: (selector: (s: { students: unknown[] }) => unknown) =>
    selector({ students: [] }),
}));

import { CoolImportButton } from './CoolImportButton';

afterEach(cleanup);

beforeEach(() => {
  settingsState.settings = { coolMessengerImportEnabled: false };
});

describe('노출 규칙', () => {
  it('★ 설정이 꺼져 있으면 아무것도 그리지 않는다', () => {
    const { container } = render(<CoolImportButton />);
    expect(container.innerHTML).toBe('');
  });

  it('★ 설정값이 아예 없는 기존 사용자에게도 안 보인다 (기본 = 꺼짐)', () => {
    settingsState.settings = {};
    const { container } = render(<CoolImportButton />);
    expect(container.innerHTML).toBe('');
  });

  it('설정을 켜면 버튼이 보인다', () => {
    settingsState.settings = { coolMessengerImportEnabled: true };
    render(<CoolImportButton />);
    expect(screen.getByRole('button', { name: /쿨메신저/ })).toBeTruthy();
  });

  it('true 가 아닌 값(문자열 등)은 켜진 것으로 보지 않는다', () => {
    settingsState.settings = { coolMessengerImportEnabled: 'yes' };
    const { container } = render(<CoolImportButton />);
    expect(container.innerHTML).toBe('');
  });

  it('처음에는 모달이 떠 있지 않다', () => {
    settingsState.settings = { coolMessengerImportEnabled: true };
    render(<CoolImportButton />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
