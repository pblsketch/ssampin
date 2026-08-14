/**
 * @vitest-environment jsdom
 *
 * 옆핀 안 모양 조절 판 테스트.
 */
import { describe, expect, test, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SidePinAppearancePopover } from './SidePinAppearancePopover';

afterEach(cleanup);

function renderPopover(overrides: Partial<Parameters<typeof SidePinAppearancePopover>[0]> = {}) {
  const props = {
    opacity: 1,
    cardOpacity: 1,
    onOpacityChange: vi.fn<(value: number) => void>(),
    onCardOpacityChange: vi.fn<(value: number) => void>(),
    onClose: vi.fn<() => void>(),
    ...overrides,
  };
  render(<SidePinAppearancePopover {...props} />);
  return props;
}

describe('모양 조절', () => {
  test('배경과 카드를 따로 조절한다', () => {
    const props = renderPopover();

    fireEvent.change(screen.getByLabelText('배경 투명도'), { target: { value: '60' } });

    expect(props.onOpacityChange).toHaveBeenCalledWith(0.6);
    expect(props.onCardOpacityChange).not.toHaveBeenCalled();
  });

  test('카드 투명도도 따로 전달된다', () => {
    const props = renderPopover();

    fireEvent.change(screen.getByLabelText('카드 투명도'), { target: { value: '40' } });

    expect(props.onCardOpacityChange).toHaveBeenCalledWith(0.4);
    expect(props.onOpacityChange).not.toHaveBeenCalled();
  });

  test('지금 값을 퍼센트로 보여준다 — 얼마인지 모르면 맞출 수 없다', () => {
    renderPopover({ opacity: 0.35, cardOpacity: 0.8 });

    expect(screen.getByText('35%')).toBeTruthy();
    expect(screen.getByText('80%')).toBeTruthy();
  });

  test('0%까지 내릴 수 있다 — 완전히 투명한 배경도 고를 수 있어야 한다', () => {
    const props = renderPopover();

    fireEvent.change(screen.getByLabelText('배경 투명도'), { target: { value: '0' } });

    expect(props.onOpacityChange).toHaveBeenCalledWith(0);
  });

  test('Esc로 닫는다', () => {
    const props = renderPopover();

    fireEvent.keyDown(screen.getByLabelText('배경 투명도'), { key: 'Escape' });

    expect(props.onClose).toHaveBeenCalled();
  });

  test('닫기 버튼으로도 닫는다', () => {
    const props = renderPopover();

    fireEvent.click(screen.getByRole('button', { name: '모양 설정 닫기' }));

    expect(props.onClose).toHaveBeenCalled();
  });
});
