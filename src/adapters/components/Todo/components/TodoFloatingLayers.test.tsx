/**
 * @vitest-environment jsdom
 *
 * 할 일 화면의 떠 있는 면 두 가지가 유리 효과에서 가려지거나 투명해지던 문제.
 *
 *  - 날짜 달력(2026-09-28 신고): "수정하려고 날짜를 누르면 달력이 아래 리스트에 가려져 날짜를
 *    선택할 수 없다." 달력을 누른 자리 안쪽에 그려, 유리 효과의 카드별 층에 갇혔다.
 *  - 수정 창(2026-09-30 신고): "표로 볼 때 할 일을 누르면 수정 팝업이 투명하게 뜬다." 표 카드
 *    안에서 그려져 "카드 안의 카드는 배경을 지운다" 규칙에 배경을 잃었다.
 *
 * 둘 다 화면 맨 바깥(body)에 그려야 한다. jsdom 은 겹침을 그리지 않으므로 여기서는
 * "어디에 그려지는가"와 "그래도 제대로 동작하는가"를 잠근다. 실제 겹침은 실화면으로 확인한다.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Todo } from '@domain/entities/Todo';
import { DatePopover } from './DatePopover';
import { TodoEditModal } from './TodoEditModal';

afterEach(() => cleanup());

describe('DatePopover — 달력은 화면 맨 바깥에 그린다', () => {
  function open() {
    const onDateChange = vi.fn();
    const view = render(
      <div data-testid="card">
        <DatePopover
          date="2026-11-10"
          onDateChange={onDateChange}
          onEndDateChange={vi.fn()}
          onNoDueDateChange={vi.fn()}
        >
          <button type="button">날짜</button>
        </DatePopover>
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: '날짜' }));
    return { onDateChange, view };
  }

  it('달력이 누른 카드 안이 아니라 body 바로 아래에 그려진다', () => {
    open();

    const panel = document.querySelector('[data-sp-floating]');
    expect(panel).not.toBeNull();
    expect(screen.getByTestId('card').contains(panel)).toBe(false);
    expect(panel?.parentElement).toBe(document.body);
    expect(panel?.className).toContain('fixed');
  });

  it('달력 안을 눌러도 바깥 클릭으로 닫히지 않고 날짜가 선택된다', () => {
    const { onDateChange } = open();
    const panel = document.querySelector('[data-sp-floating]') as HTMLElement;
    const day = Array.from(panel.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === '15',
    ) as HTMLButtonElement;

    fireEvent.mouseDown(day);
    expect(document.querySelector('[data-sp-floating]')).not.toBeNull();
    fireEvent.click(day);

    expect(onDateChange).toHaveBeenCalledWith('2026-11-15');
  });

  it('달력 밖을 누르면 닫힌다', () => {
    open();

    fireEvent.mouseDown(document.body);

    expect(document.querySelector('[data-sp-floating]')).toBeNull();
  });
});

describe('TodoEditModal — 수정 창은 불투명한 대화 상자로 맨 바깥에 그린다', () => {
  const todo = {
    id: 't1',
    text: '가정통신문 걷기',
    completed: false,
    priority: 'none',
    createdAt: '2026-11-10T00:00:00.000Z',
  } as unknown as Todo;

  it('표 카드 안이 아니라 body 아래에, 대화 상자 표시를 달고 그려진다', () => {
    render(
      <div data-testid="table-card" className="bg-sp-card overflow-hidden">
        <TodoEditModal todo={todo} categories={[]} onUpdate={vi.fn()} onClose={vi.fn()} />
      </div>,
    );

    const dialog = screen.getByRole('dialog', { name: '할 일 수정' });
    expect(screen.getByTestId('table-card').contains(dialog)).toBe(false);
    expect(dialog.hasAttribute('data-sp-overlay-surface')).toBe(true);
    expect(dialog.className).toContain('bg-sp-card');
  });

  it('창 안을 눌러도 닫히지 않고, 바깥 막을 누르면 닫힌다', () => {
    const onClose = vi.fn();
    render(<TodoEditModal todo={todo} categories={[]} onUpdate={vi.fn()} onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: '할 일 수정' });

    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(dialog.parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
