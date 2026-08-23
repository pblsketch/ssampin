// @vitest-environment jsdom
/**
 * 쿨메신저 가져오기 화면 동작 테스트.
 *
 * 쪽지함을 읽는 함수를 주입받는 구조라 **쿨메신저 없이도** 화면 전체를 검증할 수 있다.
 *
 * 잠그는 계약:
 *   - 개인정보는 자동으로 지워지지 않는다 (표시만 — 사용자가 결정)
 *   - '까지/제출'이 붙은 쪽지는 할일로 추천된다
 *   - 등록 결과가 사용자가 화면에서 고친 그대로 나간다
 *   - 쪽지함을 못 읽어도 조용히 빈 화면이 되지 않는다
 *
 * 이 저장소는 `@testing-library/jest-dom` 매처를 등록하지 않는다(`vitest.config.ts`에
 * setupFiles 없음). `SplitDivider.test.tsx` 선례대로 **기본 vitest 매처 + afterEach(cleanup)**
 * 만 쓴다.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CoolImportModal } from './CoolImportModal';
import type { CoolImportItem, CoolMessage } from '@domain/entities/CoolMessage';

afterEach(cleanup);

const MSG_MEETING: CoolMessage = {
  key: 1,
  sender: '교무부',
  receivedAt: new Date(2026, 7, 20, 9, 0).toISOString(),
  title: '학폭위 심의 안내',
  body: '3학년 김철수 학생 건으로 8월 27일(목) 14:00 회의실에서 열립니다. 담당 010-1234-5678',
  isUnread: true,
};

const MSG_DEADLINE: CoolMessage = {
  key: 2,
  sender: '연구부',
  receivedAt: new Date(2026, 7, 19, 10, 0).toISOString(),
  title: '연수 신청서 제출',
  body: '8월 28일까지 제출 바랍니다.',
  isUnread: false,
};

const MSG_NO_DATE: CoolMessage = {
  key: 3,
  sender: '행정실',
  receivedAt: new Date(2026, 7, 18, 11, 0).toISOString(),
  title: '인사말',
  body: '안녕하세요. 감사합니다.',
  isUnread: false,
};

/** 후보가 여럿인 쪽지 — 각각 따로 고를 수 있는지 확인용 */
const MSG_MULTI: CoolMessage = {
  key: 4,
  sender: '진로부',
  receivedAt: new Date(2026, 7, 20, 15, 0).toISOString(),
  title: '진로체험 안내',
  body: '사전교육 8월 26일(수) 15:00\n체험 당일 8월 31일(월) 09:00\n보고서 9월 4일(금)까지',
  isUnread: false,
};

const ALL = [MSG_MEETING, MSG_DEADLINE, MSG_NO_DATE, MSG_MULTI];

function setup(overrides: Partial<Parameters<typeof CoolImportModal>[0]> = {}) {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  render(
    <CoolImportModal
      isOpen
      onClose={onClose}
      loadMessages={() => Promise.resolve(ALL)}
      loadMessage={(key) => Promise.resolve(ALL.find((m) => m.key === key) ?? null)}
      roster={new Set(['김철수'])}
      onSubmit={onSubmit}
      {...overrides}
    />,
  );
  return { onSubmit, onClose, user: userEvent.setup() };
}

describe('쪽지 목록', () => {
  it('보낸 사람과 제목을 보여준다', async () => {
    setup();
    expect(await screen.findByText('학폭위 심의 안내')).toBeTruthy();
    expect(screen.getByText('교무부')).toBeTruthy();
  });

  it('안읽은 쪽지를 표시한다', async () => {
    setup();
    await screen.findByText('학폭위 심의 안내');
    // 예시 3건 중 안읽음은 1건뿐이다
    expect(screen.getAllByLabelText('안읽음')).toHaveLength(1);
  });

  it('처음엔 고르라고 안내한다', async () => {
    setup();
    expect(await screen.findByText('왼쪽에서 쪽지를 고르세요.')).toBeTruthy();
  });
});

describe('날짜 후보', () => {
  it('쪽지를 고르면 찾아낸 날짜를 보여준다', async () => {
    const { user } = setup();
    await user.click(await screen.findByText('학폭위 심의 안내'));
    expect(await screen.findByText(/8월 27일 \(목\)/)).toBeTruthy();
    expect(screen.getByText(/오후 2:00/)).toBeTruthy();
  });

  it('★ 프로그램이 일정·할일을 미리 정해두지 않는다 ("안 함"이 기본)', async () => {
    const { user } = setup();
    await user.click(await screen.findByText('학폭위 심의 안내'));
    await screen.findByText(/8월 27일 \(목\)/);
    // 어느 것도 눌려 있지 않고, '안 함'만 켜져 있어야 한다
    expect(screen.getByRole('button', { name: /일정/ }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: /할일/ }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: /둘 다/ }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(screen.getByRole('button', { name: /안 함/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('★ "까지 제출"이 붙은 쪽지도 미리 할일로 정해두지 않는다', async () => {
    const { user } = setup();
    await user.click(await screen.findByText('연수 신청서 제출'));
    await screen.findByRole('button', { name: '안 함' }); // 후보 카드가 뜰 때까지
    expect(screen.getByRole('button', { name: /할일/ }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: /안 함/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('날짜가 없는 쪽지는 그렇다고 알려준다 (빈 화면 금지)', async () => {
    const { user } = setup();
    await user.click(await screen.findByText('인사말'));
    expect(await screen.findByText('이 쪽지에서 날짜를 찾지 못했습니다.')).toBeTruthy();
  });
});

describe('★ 개인정보 — 표시만 하고 지우지 않는다', () => {
  it('원문의 이름·전화번호를 빨갛게 표시한다', async () => {
    const { user } = setup();
    await user.click(await screen.findByText('학폭위 심의 안내'));
    await user.click(await screen.findByText(/쪽지 원문 보기/));
    const marked = [...document.querySelectorAll('mark')].map((m) => m.textContent);
    expect(marked).toContain('김철수');
    expect(marked).toContain('010-1234-5678');
  });

  it('자동으로 가리지 않는다 — 원문 글자가 그대로 남아 있다', async () => {
    const { user } = setup();
    await user.click(await screen.findByText('학폭위 심의 안내'));
    await user.click(await screen.findByText(/쪽지 원문 보기/));
    expect(document.body.textContent).toContain('김철수');
    expect(document.body.textContent).not.toContain('○○○');
  });
});

describe('등록 — 선생님이 고른 대로만 나간다', () => {
  it('★ 아무것도 고르지 않으면 등록 버튼이 잠긴다', async () => {
    const { user } = setup();
    await user.click(await screen.findByText('학폭위 심의 안내'));
    await screen.findByText(/8월 27일 \(목\)/);
    const btn = screen.getByRole('button', { name: /0건 등록/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByText('각 항목을 일정·할일·둘 다 중에서 골라 주세요.')).toBeTruthy();
  });

  it('"일정"을 고르면 일정 한 건이 나간다', async () => {
    const { onSubmit, user } = setup();
    await user.click(await screen.findByText('학폭위 심의 안내'));
    await user.click(await screen.findByRole('button', { name: /일정/ }));
    await user.click(screen.getByRole('button', { name: '1건 등록' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const items = onSubmit.mock.calls[0]![0] as readonly CoolImportItem[];
    expect(items).toHaveLength(1);
    expect(items[0]!.sourceMessageKey).toBe(1);
    expect(items[0]!.target).toBe('event');
    expect(items[0]!.allDay).toBe(false);
    expect(items[0]!.start.getMonth()).toBe(7); // 8월
    expect(items[0]!.start.getDate()).toBe(27);
    expect(items[0]!.start.getHours()).toBe(14);
  });

  it('"할일"을 고르면 할일 한 건이 나간다', async () => {
    const { onSubmit, user } = setup();
    await user.click(await screen.findByText('학폭위 심의 안내'));
    await user.click(await screen.findByRole('button', { name: /할일/ }));
    await user.click(screen.getByRole('button', { name: '1건 등록' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const items = onSubmit.mock.calls[0]![0] as readonly CoolImportItem[];
    expect(items).toHaveLength(1);
    expect(items[0]!.target).toBe('todo');
  });

  it('★ "둘 다"를 고르면 일정·할일 두 건이 나간다', async () => {
    const { onSubmit, user } = setup();
    await user.click(await screen.findByText('학폭위 심의 안내'));
    await user.click(await screen.findByRole('button', { name: /둘 다/ }));
    expect(screen.getByText('일정 1건 · 할일 1건 등록합니다.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '2건 등록' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const items = onSubmit.mock.calls[0]![0] as readonly CoolImportItem[];
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.target).sort()).toEqual(['event', 'todo']);
    // 같은 내용이 두 곳으로 간다
    expect(items[0]!.title).toBe(items[1]!.title);
    expect(items[0]!.start.getTime()).toBe(items[1]!.start.getTime());
  });

  it('★ 골랐다가 "안 함"으로 되돌리면 다시 잠긴다', async () => {
    const { user } = setup();
    await user.click(await screen.findByText('학폭위 심의 안내'));
    await user.click(await screen.findByRole('button', { name: /일정/ }));
    expect((screen.getByRole('button', { name: '1건 등록' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    await user.click(screen.getByRole('button', { name: /안 함/ }));
    expect((screen.getByRole('button', { name: /0건 등록/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('★ 후보가 여럿이면 각각 따로 고른다 (안 고른 것은 안 나간다)', async () => {
    const { onSubmit, user } = setup();
    await user.click(await screen.findByText('진로체험 안내'));
    await screen.findByText(/8월 26일 \(수\)/);
    const eventBtns = await screen.findAllByRole('button', { name: /^일정$/ });
    expect(eventBtns.length).toBeGreaterThanOrEqual(2);
    // 첫 후보만 일정으로, 나머지는 그대로 '안 함'
    await user.click(eventBtns[0]!);
    await user.click(screen.getByRole('button', { name: '1건 등록' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const items = onSubmit.mock.calls[0]![0] as readonly CoolImportItem[];
    expect(items).toHaveLength(1);
    expect(items[0]!.start.getDate()).toBe(26);
  });
});

describe('안전 실패', () => {
  it('쪽지함을 못 읽으면 이유를 보여준다 (조용히 빈 화면 금지)', async () => {
    setup({
      loadMessages: () =>
        Promise.reject(new Error('쿨메신저 쪽지함 구조가 예상과 다릅니다: tbl_recv 표가 없습니다')),
    });
    expect(await screen.findByText('쪽지함을 읽지 못했습니다.')).toBeTruthy();
    expect(screen.getByText(/tbl_recv 표가 없습니다/)).toBeTruthy();
  });

  it('쪽지가 하나도 없으면 그렇다고 알려준다', async () => {
    setup({ loadMessages: () => Promise.resolve([]) });
    expect(await screen.findByText('받은 쪽지가 없습니다.')).toBeTruthy();
  });
});
