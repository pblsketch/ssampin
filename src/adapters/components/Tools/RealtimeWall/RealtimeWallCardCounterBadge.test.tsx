// @vitest-environment jsdom
/**
 * β-Step7 — RealtimeWallCardCounterBadge 단위 테스트.
 *
 * Spec L189 (UI presentation) / Plan §2.2 Step 7.
 *
 * 검증:
 *   - likeCount / commentCount 숫자 노출
 *   - hasLiked=true 시 filled heart icon (favorite)
 *   - hasLiked=false 시 outline heart icon (favorite_border)
 *   - onLikeClick 미전달 시 like 버튼 disabled (read-only)
 *   - onCommentClick 미전달 시 comment 버튼 disabled (read-only)
 *   - 클릭 시 콜백 호출 (1회)
 *   - 항상 visible: data-counter-badge 속성 + group-hover/opacity-0 CSS 클래스 부재
 *
 * 패턴: `globals: false` 환경이라 `cleanup()` 수동 호출. jest-dom matcher 미사용 —
 * getByX 가 미발견 시 throw 하므로 fetch 자체가 assertion 역할.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RealtimeWallCardCounterBadge } from './RealtimeWallCardCounterBadge';

afterEach(() => {
  cleanup();
});

describe('RealtimeWallCardCounterBadge', () => {
  it('likeCount / commentCount 숫자 노출', () => {
    render(<RealtimeWallCardCounterBadge likeCount={5} commentCount={3} />);
    expect(screen.getByText('5')).not.toBeNull();
    expect(screen.getByText('3')).not.toBeNull();
  });

  it('hasLiked=true 시 filled heart icon (favorite)', () => {
    render(<RealtimeWallCardCounterBadge likeCount={1} commentCount={0} hasLiked={true} />);
    expect(screen.getByText('favorite')).not.toBeNull();
  });

  it('hasLiked=false 시 outline heart icon (favorite_border)', () => {
    render(<RealtimeWallCardCounterBadge likeCount={1} commentCount={0} hasLiked={false} />);
    expect(screen.getByText('favorite_border')).not.toBeNull();
  });

  it('onLikeClick 미전달 시 like 버튼 disabled', () => {
    render(<RealtimeWallCardCounterBadge likeCount={0} commentCount={0} />);
    const likeBtn = screen.getByLabelText('좋아요 누르기') as HTMLButtonElement;
    expect(likeBtn.disabled).toBe(true);
  });

  it('onLikeClick 전달 시 클릭 1회 호출', () => {
    const onLike = vi.fn();
    render(<RealtimeWallCardCounterBadge likeCount={0} commentCount={0} onLikeClick={onLike} />);
    fireEvent.click(screen.getByLabelText('좋아요 누르기'));
    expect(onLike).toHaveBeenCalledTimes(1);
  });

  it('onCommentClick 미전달 시 comment 버튼 disabled', () => {
    render(<RealtimeWallCardCounterBadge likeCount={0} commentCount={2} />);
    const commentBtn = screen.getByLabelText('댓글 패널 토글') as HTMLButtonElement;
    expect(commentBtn.disabled).toBe(true);
  });

  it('onCommentClick 전달 시 클릭 1회 호출', () => {
    const onComment = vi.fn();
    render(
      <RealtimeWallCardCounterBadge likeCount={0} commentCount={2} onCommentClick={onComment} />,
    );
    fireEvent.click(screen.getByLabelText('댓글 패널 토글'));
    expect(onComment).toHaveBeenCalledTimes(1);
  });

  it('data-counter-badge 속성 부착 + group-hover/opacity-0 의존 X (hover 없이 visible)', () => {
    const { container } = render(<RealtimeWallCardCounterBadge likeCount={0} commentCount={0} />);
    const badge = container.querySelector('[data-counter-badge="true"]');
    expect(badge).not.toBeNull();
    const className = badge?.className ?? '';
    expect(className).not.toMatch(/group-hover/);
    expect(className).not.toMatch(/opacity-0/);
  });

  it('composite aria-label (스크린리더 접근성)', () => {
    render(<RealtimeWallCardCounterBadge likeCount={7} commentCount={4} />);
    expect(screen.getByLabelText('좋아요 7개, 댓글 4개')).not.toBeNull();
  });

  it('viewerRole=student + hasLiked=true 시 rose-500 색상 클래스', () => {
    const { container } = render(
      <RealtimeWallCardCounterBadge
        likeCount={1}
        commentCount={0}
        hasLiked
        viewerRole="student"
        onLikeClick={() => {}}
      />,
    );
    const likeBtn = container.querySelector('button[aria-pressed="true"]');
    expect(likeBtn?.className ?? '').toMatch(/text-rose-500/);
  });

  it('viewerRole=teacher (기본) + hasLiked=true 시 rose-400 색상 클래스', () => {
    const { container } = render(
      <RealtimeWallCardCounterBadge
        likeCount={1}
        commentCount={0}
        hasLiked
        onLikeClick={() => {}}
      />,
    );
    const likeBtn = container.querySelector('button[aria-pressed="true"]');
    expect(likeBtn?.className ?? '').toMatch(/text-rose-400/);
  });
});
