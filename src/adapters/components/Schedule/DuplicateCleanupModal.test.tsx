/**
 * @vitest-environment jsdom
 *
 * 중복 일정 정리 모달.
 *
 * 여기서 잠그는 것은 "렌더가 되나"가 아니라 **어떤 일정이 접히는가**다.
 * 선생님이 직접 만든 일정을 실수로 접어 버리면 자료가 사라진 것처럼 보이고, 그건
 * 이 기능이 고치려던 문제보다 훨씬 나쁘다. 그래서 접기 대상 id 목록을 그물로 잡는다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { DuplicateCleanupModal } from './DuplicateCleanupModal';
import type { SchoolEvent, CategoryItem } from '@domain/entities/SchoolEvent';

afterEach(cleanup);

const CATEGORIES: readonly CategoryItem[] = [
  { id: 'neis-schedule', name: '학사일정(NEIS)', color: 'purple' },
  { id: 'teacher@gmail.com', name: 'teacher@gmail.com', color: 'blue' },
  { id: 'school', name: '학교', color: 'blue' },
];

/** 제보와 같은 모양 — NEIS 원본 1 + 구글 사본 2 */
const REPORTED: readonly SchoolEvent[] = [
  {
    id: 'neis-1',
    title: '대체휴일',
    date: '2026-10-05',
    category: 'neis-schedule',
    source: 'neis',
  },
  {
    id: 'g-1',
    title: '대체휴일',
    date: '2026-10-05',
    category: 'teacher@gmail.com',
    source: 'google',
  },
  {
    id: 'g-2',
    title: '대체휴일',
    date: '2026-10-05',
    category: 'teacher@gmail.com',
    source: 'google',
  },
];

type CleanupFn = (ids: readonly string[]) => Promise<number>;

function cleanupSpy(count: number) {
  return vi.fn<CleanupFn>(async () => count);
}

function setup(events: readonly SchoolEvent[], onCleanup: CleanupFn = cleanupSpy(0)) {
  render(
    <DuplicateCleanupModal
      events={events}
      categories={CATEGORIES}
      onCleanup={onCleanup}
      onClose={vi.fn()}
    />,
  );
  return { onCleanup };
}

describe('DuplicateCleanupModal', () => {
  it('겹치는 줄 수를 버튼에 그대로 보여 준다', () => {
    setup(REPORTED);
    expect(screen.getByRole('button', { name: '2건 정리하기' })).toBeTruthy();
  });

  it('구글 사본만 접고 NEIS 원본은 넘기지 않는다', async () => {
    const onCleanup = cleanupSpy(2);
    setup(REPORTED, onCleanup);

    fireEvent.click(screen.getByRole('button', { name: '2건 정리하기' }));

    await waitFor(() => expect(onCleanup).toHaveBeenCalledTimes(1));
    expect(onCleanup.mock.calls[0]![0]).toEqual(['g-1', 'g-2']);
  });

  it('선생님이 직접 만든 일정은 접기 대상에 넣지 않는다', () => {
    setup([
      { id: 'mine-1', title: '학년 회의', date: '2026-10-05', category: 'school' },
      { id: 'mine-2', title: '학년 회의', date: '2026-10-05', category: 'school' },
    ]);
    expect(screen.getByText('겹치는 일정이 없습니다.')).toBeTruthy();
  });

  it('정리한 뒤에는 몇 건이 정리됐는지 알려 준다', async () => {
    setup(REPORTED, cleanupSpy(2));

    fireEvent.click(screen.getByRole('button', { name: '2건 정리하기' }));

    await waitFor(() => expect(screen.getByText('2건을 정리했어요')).toBeTruthy());
    // 같은 작업을 두 번 실행하지 못하게 정리 버튼은 사라진다
    expect(screen.queryByRole('button', { name: /정리하기/ })).toBeNull();
  });
});
