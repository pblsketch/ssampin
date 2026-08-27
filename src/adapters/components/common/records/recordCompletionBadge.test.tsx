// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
/**
 * RecordCompletionBadge 상태별 표현 차등 검증.
 *
 * 증빙서류 배지가 질병 출결까지 상시로 붙게 되면서 목록 밀도가 올라갔다. 그래서
 * **끝난 일은 맨 아이콘, 남은 일만 알약**으로 나눴다(같은 행의 후속조치 표시와 같은 언어).
 * 라벨이 사라지는 완료 상태에서 **의미가 aria-label로 보존되는지**, 그리고
 * **완료 상태도 되돌릴 수 있는지**가 이 테스트의 존재 이유다.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RecordCompletionBadge } from './RecordCompletionBadge';

afterEach(cleanup);

describe('완료 상태 — 조용한 아이콘', () => {
  it('라벨 글자를 노출하지 않는다 (목록 밀도)', () => {
    render(<RecordCompletionBadge kind="document" completed onToggle={vi.fn()} />);
    expect(screen.queryByText('증빙서류')).not.toBeInTheDocument();
    expect(screen.queryByText('미제출')).not.toBeInTheDocument();
  });

  it('라벨 대신 aria-label로 의미를 남긴다 (접근성 보존)', () => {
    render(<RecordCompletionBadge kind="document" completed onToggle={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: '증빙서류 제출 완료 (클릭하여 취소)' }),
    ).toBeInTheDocument();
  });

  it('완료 상태도 눌러서 되돌릴 수 있다 (오조작 복구 경로 유지)', () => {
    const onToggle = vi.fn();
    render(<RecordCompletionBadge kind="document" completed onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe('미완료 상태 — 알약으로 외친다', () => {
  it('증빙서류 미제출은 "미제출" 글자를 보여준다', () => {
    render(<RecordCompletionBadge kind="document" completed={false} onToggle={vi.fn()} />);
    expect(screen.getByText('미제출')).toBeInTheDocument();
  });

  it('나이스 미반영도 같은 규칙 — 글자를 보여준다', () => {
    render(<RecordCompletionBadge kind="neis" completed={false} onToggle={vi.fn()} />);
    expect(screen.getByText('미반영')).toBeInTheDocument();
  });

  it('나이스 반영 완료는 글자 없이 aria-label만 남는다', () => {
    render(<RecordCompletionBadge kind="neis" completed onToggle={vi.fn()} />);
    expect(screen.queryByText('나이스')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '나이스 반영 완료 (클릭하여 취소)' }),
    ).toBeInTheDocument();
  });
});

describe('클릭 전파', () => {
  it('배지 클릭이 카드 클릭으로 새지 않는다 (stopPropagation)', () => {
    const onCard = vi.fn();
    const onToggle = vi.fn();
    render(
      <div onClick={onCard}>
        <RecordCompletionBadge kind="document" completed={false} onToggle={onToggle} />
      </div>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onCard).not.toHaveBeenCalled();
  });
});
