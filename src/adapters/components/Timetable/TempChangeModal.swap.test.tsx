/**
 * @vitest-environment jsdom
 *
 * 수업 교환 — 반(교실)은 수업을 따라가야 한다 (2026-09-16 신고).
 *
 * "수업 교환을 등록하면 몇 반 수업인지 안 뜨고 '수업교환'이라고만 떠서 보기 불편하다."
 * 교환하면 과목은 서로 바뀌는데 반은 각 자리의 원래 반이 그대로 남았다. 같은 과목을 여러 반에서
 * 가르치는 선생님은 교환 뒤에도 칸이 그대로라, 어느 반 수업이 왔는지 알 수 없었다.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TempChangeModal } from './TempChangeModal';

afterEach(() => cleanup());

/** 화 2교시 = 국어 3-1, 화 1교시 = 국어 3-3 인 교사 시간표 */
const BASE: Record<number, { subject: string; classroom: string }> = {
  1: { subject: '국어', classroom: '3-3' },
  2: { subject: '국어', classroom: '3-1' },
};

describe('TempChangeModal — 수업 교환', () => {
  it('교환하면 각 자리에 상대 수업의 과목과 반이 함께 들어간다', () => {
    const onSaveSwap = vi.fn();
    render(
      <TempChangeModal
        date="2026-11-10"
        period={2}
        currentSubject="국어"
        currentClassroom="3-1"
        onClose={vi.fn()}
        resolveBaseSubject={(_d, p) => BASE[p]?.subject ?? ''}
        resolveBaseClassroom={(_d, p) => BASE[p]?.classroom ?? ''}
        onSaveSingle={vi.fn()}
        onSaveSwap={onSaveSwap}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /교체/ }));
    fireEvent.click(screen.getByRole('button', { name: '교체 등록' }));

    expect(onSaveSwap).toHaveBeenCalledTimes(1);
    const input = onSaveSwap.mock.calls[0]?.[0] as {
      slotA: { period: number; subject: string; classroom?: string };
      slotB: { period: number; subject: string; classroom?: string };
    };
    // A(2교시) 자리에는 B(1교시) 수업 = 국어 3-3 이 온다
    expect(input.slotA).toMatchObject({ period: 2, subject: '국어', classroom: '3-3' });
    // B(1교시) 자리에는 A(2교시) 수업 = 국어 3-1 이 온다
    expect(input.slotB).toMatchObject({ period: 1, subject: '국어', classroom: '3-1' });
  });
});
