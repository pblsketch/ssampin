/**
 * @vitest-environment jsdom
 *
 * 수정 창 — 수업 교체 쌍의 한쪽은 날짜·교시가 잠긴다.
 *
 * 수정 창에서 교체 한쪽의 날짜·교시를 바꾸면 옛 항목이 지워지고 pairId 없는 새 항목이 생겨
 * 짝이 끊겼다("반쪽 교체"). 짝이 살아 있으면 맞바꾼 상대를 안내하고 날짜·교시를 잠근다.
 * 짝이 없는 항목(일반 변동·이미 생긴 반쪽)은 예전처럼 날짜·교시까지 고친다.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { TimetableOverride } from '@domain/entities/Timetable';
import { TempChangeModal } from './TempChangeModal';

afterEach(() => cleanup());

/** 2026-11-10(화) 2교시 ↔ 2026-11-17(화) 5교시 교체의 A 쪽 */
const SWAP_HALF: TimetableOverride = {
  id: 'a',
  date: '2026-11-10',
  period: 2,
  subject: '국어',
  classroom: '3-3',
  reason: '수업 교환',
  kind: 'swap',
  pairId: 'pair-1',
  scope: 'teacher',
  createdAt: '2026-11-09T09:00:00.000Z',
};

const dateInput = (): HTMLInputElement | null =>
  document.querySelector<HTMLInputElement>('input[type="date"]');

describe('TempChangeModal — 수정 모드의 수업 교체', () => {
  it('수정 모드의 교체 항목은 짝 교시를 안내하고 날짜·교시가 잠긴다', () => {
    const onSaveEdit = vi.fn();
    render(
      <TempChangeModal
        mode="edit"
        initialOverride={SWAP_HALF}
        swapPartner={{ date: '2026-11-17', period: 5 }}
        date={SWAP_HALF.date}
        period={SWAP_HALF.period}
        currentSubject={SWAP_HALF.subject}
        maxPeriods={7}
        onClose={vi.fn()}
        onSaveEdit={onSaveEdit}
      />,
    );

    // 짝이 다른 주에 있어도 알 수 있게 날짜·요일·교시를 함께 보인다
    const notice = screen.getByRole('status');
    expect(notice.textContent).toContain('11월 17일(화) 5교시 수업과 맞바꾼 교체예요.');
    expect(notice.textContent).toContain('교체를 지우고 다시 등록해 주세요');

    // 날짜·교시 칸이 없다(읽기 전용 글자로만 보인다)
    expect(dateInput()).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('2026.11.10 · 2교시')).toBeTruthy();

    // 과목·교실은 고칠 수 있고, 저장 값의 날짜·교시는 원래 그대로다
    fireEvent.change(screen.getByPlaceholderText('비우면 공강/자습'), {
      target: { value: '수학' },
    });
    fireEvent.change(screen.getByPlaceholderText('교실'), { target: { value: '3-1' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(onSaveEdit).toHaveBeenCalledTimes(1);
    expect(onSaveEdit.mock.calls[0]?.[0]).toBe('a');
    expect(onSaveEdit.mock.calls[0]?.[1]).toMatchObject({
      date: '2026-11-10',
      period: 2,
      subject: '수학',
      classroom: '3-1',
      kind: 'swap',
      scope: 'teacher',
    });
  });

  it('짝이 없는 항목(이미 생긴 반쪽·일반 변동)은 안내 없이 날짜·교시까지 고친다', () => {
    const onSaveEdit = vi.fn();
    render(
      <TempChangeModal
        mode="edit"
        initialOverride={SWAP_HALF}
        swapPartner={null}
        date={SWAP_HALF.date}
        period={SWAP_HALF.period}
        currentSubject={SWAP_HALF.subject}
        maxPeriods={7}
        onClose={vi.fn()}
        onSaveEdit={onSaveEdit}
      />,
    );

    expect(screen.queryByRole('status')).toBeNull();
    const input = dateInput();
    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { value: '2026-11-12' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(onSaveEdit.mock.calls[0]?.[1]).toMatchObject({ date: '2026-11-12', period: 4 });
  });
});
