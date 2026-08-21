/**
 * @vitest-environment jsdom
 *
 * 숨긴 일정 다시 보기.
 *
 * 여기서 잠그는 것은 **되돌리기가 실제로 그 일정을 가리키는가**다. 이 화면이 틀리면
 * 선생님이 "다시 보기"를 눌렀는데 엉뚱한 일정이 살아나거나, 아무 일도 안 일어난다.
 * 중복이라 접힌 것을 되돌리면 달력이 다시 두 줄이 되므로 그 경고가 뜨는지도 함께 본다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { HiddenEventsModal } from './HiddenEventsModal';
import type { SchoolEvent, CategoryItem } from '@domain/entities/SchoolEvent';

afterEach(cleanup);

const CATEGORIES: readonly CategoryItem[] = [
  { id: 'neis-schedule', name: '학사일정(NEIS)', color: 'purple' },
  { id: 'teacher@gmail.com', name: 'teacher@gmail.com', color: 'blue' },
];

const HIDDEN: readonly SchoolEvent[] = [
  {
    id: 'neis-1',
    title: '재량휴업일',
    date: '2026-10-05',
    category: 'neis-schedule',
    source: 'neis',
    isHidden: true,
    hiddenReason: 'manual',
    hiddenAt: '2026-08-21T01:00:00.000Z',
  },
  {
    id: 'g-1',
    title: '대체휴일',
    date: '2026-10-05',
    category: 'teacher@gmail.com',
    source: 'google',
    isHidden: true,
    hiddenReason: 'duplicate',
    hiddenAt: '2026-08-21T02:00:00.000Z',
  },
];

type RestoreFn = (ids: readonly string[]) => Promise<number>;

function restoreSpy(count: number) {
  return vi.fn<RestoreFn>(async () => count);
}

function setup(events: readonly SchoolEvent[], onRestore: RestoreFn = restoreSpy(0)) {
  render(
    <HiddenEventsModal
      events={events}
      categories={CATEGORIES}
      onRestore={onRestore}
      onClose={vi.fn()}
    />,
  );
}

describe('HiddenEventsModal', () => {
  it('숨긴 일정이 없으면 그렇다고 말한다', () => {
    setup([{ id: 'a', title: '개학', date: '2026-08-17', category: 'school' }]);
    expect(screen.getByText('숨긴 일정이 없습니다.')).toBeTruthy();
  });

  it('최근에 치운 것부터 보여 준다', () => {
    setup(HIDDEN);
    const titles = screen.getAllByText(/재량휴업일|대체휴일/).map((el) => el.textContent);
    expect(titles).toEqual(['대체휴일', '재량휴업일']);
  });

  it('되돌리기를 누르면 그 일정 하나만 넘긴다', async () => {
    const onRestore = restoreSpy(1);
    setup(HIDDEN, onRestore);

    // 첫 줄(가장 최근에 접힌 구글 사본)의 되돌리기
    fireEvent.click(screen.getAllByRole('button', { name: '다시 보기' })[0]!);

    await waitFor(() => expect(onRestore).toHaveBeenCalledTimes(1));
    expect(onRestore.mock.calls[0]![0]).toEqual(['g-1']);
  });

  it('모두 되돌리기는 확인을 한 번 거친다', async () => {
    const onRestore = restoreSpy(2);
    setup(HIDDEN, onRestore);

    fireEvent.click(screen.getByRole('button', { name: '2건 모두 되돌리기' }));
    expect(onRestore).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '모두 되돌리기' }));
    await waitFor(() => expect(onRestore).toHaveBeenCalledTimes(1));
    expect(onRestore.mock.calls[0]![0]).toEqual(['g-1', 'neis-1']);
  });

  it('중복이라 접힌 것이 있으면 되돌렸을 때 다시 겹친다고 미리 알린다', () => {
    setup(HIDDEN);
    expect(screen.getByText(/되돌리면 달력에 그 일정이 다시 두 줄로 보입니다/)).toBeTruthy();
    // 안내문과 해당 줄 양쪽에 같은 문구가 쓰인다 — 줄 단위 표시는 아래 '직접 치움' 테스트가 잡는다
    expect(screen.getAllByText('중복이라 접힘').length).toBeGreaterThan(0);
  });

  it('중복으로 접힌 것이 없으면 겹침 경고를 띄우지 않는다', () => {
    setup([HIDDEN[0]!]);
    expect(screen.queryByText(/다시 두 줄로 보입니다/)).toBeNull();
    expect(screen.getByText('직접 치움')).toBeTruthy();
  });

  it('외부 구독 캘린더 일정은 되돌릴 수 없으니 목록에 없다', () => {
    setup([
      {
        id: 'ext:1',
        title: '외부 일정',
        date: '2026-10-05',
        category: 'school',
        isHidden: true,
      },
    ]);
    expect(screen.getByText('숨긴 일정이 없습니다.')).toBeTruthy();
  });
});
