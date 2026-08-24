// @vitest-environment jsdom
/**
 * 가져오기 화면 공격 테스트 (UltraQA).
 *
 * 실기기 검증이 안 된 화면이라, 실제로 일어날 법한 험한 조작을 밀어넣는다.
 * 특히 **"조용히 실패하지 않는다"** 계약이 등록 단계에서도 지켜지는지 본다 —
 * 저장이 실패했는데 아무 말이 없으면 선생님은 등록된 줄 알고 넘어간다.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CoolImportModal } from './CoolImportModal';
import type { CoolMessage } from '@domain/entities/CoolMessage';

afterEach(cleanup);

const MSG_A: CoolMessage = {
  key: 1,
  sender: '교무부',
  receivedAt: new Date(2026, 7, 20, 9, 0).toISOString(),
  title: '학폭위 심의',
  body: '8월 27일(목) 14:00 회의실',
  isUnread: true,
};
const MSG_B: CoolMessage = {
  key: 2,
  sender: '연구부',
  receivedAt: new Date(2026, 7, 19, 9, 0).toISOString(),
  title: '연수 안내',
  body: '9월 3일(수) 10:00 시청각실',
  isUnread: false,
};

function setup(over: Partial<Parameters<typeof CoolImportModal>[0]> = {}) {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  render(
    <CoolImportModal
      isOpen
      onClose={onClose}
      loadMessages={() => Promise.resolve([MSG_A, MSG_B])}
      loadMessage={(k) => Promise.resolve([MSG_A, MSG_B].find((m) => m.key === k) ?? null)}
      onSubmit={onSubmit}
      {...over}
    />,
  );
  return { onSubmit, onClose, user: userEvent.setup() };
}

describe('★ 등록 실패를 삼키지 않는다', () => {
  it('저장이 실패하면 이유를 보여주고 모달을 닫지 않는다', async () => {
    const { onClose, user } = setup({
      onSubmit: vi.fn().mockRejectedValue(new Error('저장 공간이 가득 찼습니다')),
    });
    await user.click(await screen.findByText('학폭위 심의'));
    // 프로그램이 미리 고르지 않으므로, 먼저 '일정'을 눌러야 등록 버튼이 열린다
    await user.click(await screen.findByRole('button', { name: '일정' }));
    await screen.findByRole('button', { name: '1건 등록' });
    await user.click(screen.getByRole('button', { name: '1건 등록' }));

    // 실패했으면 닫히면 안 된다 — 닫히면 선생님은 등록된 줄 안다
    await waitFor(() => expect(screen.getByText(/등록하지 못했습니다/)).toBeTruthy());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('성공하면 모달이 닫힌다', async () => {
    const { onClose, user } = setup();
    await user.click(await screen.findByText('학폭위 심의'));
    // 프로그램이 미리 고르지 않으므로, 먼저 '일정'을 눌러야 등록 버튼이 열린다
    await user.click(await screen.findByRole('button', { name: '일정' }));
    await screen.findByRole('button', { name: '1건 등록' });
    await user.click(screen.getByRole('button', { name: '1건 등록' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe('험한 조작', () => {
  it('★ 등록 버튼을 연타해도 두 번 등록되지 않는다', async () => {
    // 배열에 모으는 이유 — `let x: (()=>void)|null` 에 콜백 안에서 대입하면 TypeScript 가
    // 그 대입을 추적하지 못해 계속 null 로 좁혀버린다(호출 불가 오류).
    const resolvers: Array<() => void> = [];
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolvers.push(r);
        }),
    );
    const { user } = setup({ onSubmit });
    await user.click(await screen.findByText('학폭위 심의'));
    // 프로그램이 미리 고르지 않으므로, 먼저 '일정'을 눌러야 등록 버튼이 열린다
    await user.click(await screen.findByRole('button', { name: '일정' }));
    await screen.findByRole('button', { name: '1건 등록' });

    const btn = screen.getByRole('button', { name: '1건 등록' });
    await user.click(btn);
    await user.click(btn);
    await user.click(btn);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    resolvers.forEach((r) => r());
  });

  it('★ 쪽지를 빠르게 바꿔도 이전 쪽지 결과가 덮어쓰지 않는다', async () => {
    // A는 늦게, B는 즉시 응답 — A를 먼저 누르고 바로 B를 누르면 B가 남아야 한다
    const loadMessage = (k: number): Promise<CoolMessage | null> =>
      k === 1 ? new Promise((r) => setTimeout(() => r(MSG_A), 120)) : Promise.resolve(MSG_B);
    const { user } = setup({ loadMessage });

    await user.click(await screen.findByText('학폭위 심의'));
    await user.click(screen.getByText('연수 안내'));

    await screen.findAllByText(/9월 3일/);
    await new Promise((r) => setTimeout(r, 200)); // 늦은 A 응답이 도착할 시간

    expect(screen.queryAllByText(/8월 27일/)).toHaveLength(0);
    expect(screen.getAllByText(/9월 3일/).length).toBeGreaterThan(0);
  });
});

describe('이상한 쪽지', () => {
  it('제목·본문이 비어 있어도 죽지 않는다', async () => {
    const empty: CoolMessage = { ...MSG_A, title: '', body: '' };
    const { user } = setup({
      loadMessages: () => Promise.resolve([empty]),
      loadMessage: () => Promise.resolve(empty),
    });
    await user.click(await screen.findByText('(제목 없음)'));
    expect(await screen.findByText('이 쪽지에서 날짜를 찾지 못했습니다.')).toBeTruthy();
  });

  it('아주 긴 본문도 처리한다', async () => {
    const huge: CoolMessage = { ...MSG_A, body: '안내드립니다. '.repeat(3000) + '8월 27일(목)' };
    const { user } = setup({
      loadMessages: () => Promise.resolve([huge]),
      loadMessage: () => Promise.resolve(huge),
    });
    await user.click(await screen.findByText('학폭위 심의'));
    expect((await screen.findAllByText(/8월 27일/)).length).toBeGreaterThan(0);
  });

  it('쪽지 전문을 못 가져오면 빈 화면 대신 실패 안내가 남는다', async () => {
    // 예전에는 "여는 중…"에 영원히 멈췄다(null 을 로딩과 구분하지 못했다 — 2026-08-24 수정).
    const { user } = setup({ loadMessage: () => Promise.resolve(null) });
    await user.click(await screen.findByText('학폭위 심의'));
    expect(await screen.findByText(/쪽지를 열지 못했습니다/)).toBeTruthy();
  });

  it('쪽지 읽기가 실패해도 실패 안내가 남는다', async () => {
    const { user } = setup({ loadMessage: () => Promise.reject(new Error('쪽지함이 잠겼습니다')) });
    await user.click(await screen.findByText('학폭위 심의'));
    expect(await screen.findByText(/쪽지함이 잠겼습니다/)).toBeTruthy();
  });
});
