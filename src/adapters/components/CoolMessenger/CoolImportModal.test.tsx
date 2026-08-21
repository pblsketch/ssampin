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

const ALL = [MSG_MEETING, MSG_DEADLINE, MSG_NO_DATE];

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

  it('★ "까지 제출"인 쪽지는 할일로 추천한다', async () => {
    const { user } = setup();
    await user.click(await screen.findByText('연수 신청서 제출'));
    const todoBtn = await screen.findByRole('button', { name: /할일로/ });
    await waitFor(() => expect(todoBtn.getAttribute('aria-pressed')).toBe('true'));
  });

  it('일반 회의 쪽지는 일정으로 추천한다', async () => {
    const { user } = setup();
    await user.click(await screen.findByText('학폭위 심의 안내'));
    const eventBtn = await screen.findByRole('button', { name: /일정으로/ });
    await waitFor(() => expect(eventBtn.getAttribute('aria-pressed')).toBe('true'));
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

describe('등록', () => {
  it('고른 항목이 그대로 넘어간다', async () => {
    const { onSubmit, user } = setup();
    await user.click(await screen.findByText('학폭위 심의 안내'));
    await screen.findByText(/8월 27일 \(목\)/);
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

  it('체크를 풀면 등록 버튼이 잠긴다', async () => {
    const { user } = setup();
    await user.click(await screen.findByText('학폭위 심의 안내'));
    await user.click(await screen.findByLabelText('이 항목 등록하기'));
    const btn = screen.getByRole('button', { name: /0건 등록/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByText('등록할 항목을 하나 이상 선택하세요.')).toBeTruthy();
  });

  it('일정↔할일을 바꾸면 바꾼 대로 넘어간다', async () => {
    const { onSubmit, user } = setup();
    await user.click(await screen.findByText('학폭위 심의 안내'));
    await user.click(await screen.findByRole('button', { name: /할일로/ }));
    await user.click(screen.getByRole('button', { name: '1건 등록' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const items = onSubmit.mock.calls[0]![0] as readonly CoolImportItem[];
    expect(items[0]!.target).toBe('todo');
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
