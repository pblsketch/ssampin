/**
 * @vitest-environment jsdom
 *
 * 입력 중 주제 연결 선택기 — 계획 §4.2 상태표를 화면 동작으로 잠근다.
 *
 * 핵심 계약:
 *   - 본문이 비면 연결할 수 없다(주제부터 고민하게 만들지 않는다).
 *   - 주제 미선택으로 저장을 막지 않는다 = 이 컴포넌트는 저장 버튼에 관여하지 않는다.
 *   - 마친 주제는 **바로 연결되지 않는다.** 다시 열기가 성공한 뒤에만 이어진다.
 *   - 새 주제는 확정해도 **저장소에 쓰지 않는다** — 이름만 부모에게 넘긴다.
 *   - 여러 학생·여러 날짜면 선택 UI 자체를 그리지 않는다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { InquiryThread } from '@domain/entities/InquiryThread';

const { threadState, updateSpy, loadSpy } = vi.hoisted(() => {
  const updateSpy = vi.fn(async () => undefined);
  const loadSpy = vi.fn(async () => undefined);
  const state = {
    records: [] as InquiryThread[],
    loaded: true,
    loadError: null as string | null,
    update: updateSpy,
    load: loadSpy,
  };
  return { threadState: state, updateSpy, loadSpy };
});

vi.mock('@adapters/stores/useInquiryThreadStore', () => ({
  useInquiryThreadStore: (sel: (s: typeof threadState) => unknown) => sel(threadState),
}));

import { ObservationTopicPicker } from '../ObservationTopicPicker';

const thread = (p: Partial<InquiryThread> & Pick<InquiryThread, 'id'>): InquiryThread => ({
  studentRef: 'tc:c1:1-2-3',
  title: `주제 ${p.id}`,
  keywords: [],
  status: 'open',
  createdAt: 1,
  updatedAt: 1,
  ...p,
});

function renderPicker(over: Partial<Parameters<typeof ObservationTopicPicker>[0]> = {}) {
  const onSelect = vi.fn();
  render(
    <ObservationTopicPicker
      studentRef="tc:c1:1-2-3"
      content="수업 중 근거를 들어 반박했다"
      multiTarget={false}
      selected={null}
      onSelect={onSelect}
      {...over}
    />,
  );
  return { onSelect };
}

beforeEach(() => {
  threadState.records = [];
  threadState.loaded = true;
  threadState.loadError = null;
  updateSpy.mockClear();
  loadSpy.mockClear();
});
afterEach(cleanup);

describe('본문이 비었을 때', () => {
  it('★연결할 수 없다고 알리고 목록·새 주제를 그리지 않는다', () => {
    threadState.records = [thread({ id: 't1' })];
    renderPicker({ content: '   ' });
    expect(screen.getByText('내용을 적으면 주제에 연결할 수 있어요')).toBeTruthy();
    expect(screen.queryByText('주제 t1')).toBeNull();
    expect(screen.queryByLabelText('새 주제 만들기')).toBeNull();
  });
});

describe('여러 학생·여러 날짜', () => {
  it('★선택 UI 자체를 그리지 않고 보드에서 묶으라고 안내한다', () => {
    threadState.records = [thread({ id: 't1' })];
    renderPicker({ multiTarget: true });
    expect(
      screen.getByText('여러 학생·날짜 기록은 저장 후 학생별 근거 보드에서 묶어 주세요'),
    ).toBeTruthy();
    expect(screen.queryByLabelText('새 주제 만들기')).toBeNull();
  });
});

describe('기본 상태', () => {
  it('열린 주제를 최근 수정 순으로 보여 준다', () => {
    threadState.records = [
      thread({ id: 'old', title: '오래된 주제', updatedAt: 10 }),
      thread({ id: 'new', title: '최근 주제', updatedAt: 99 }),
    ];
    renderPicker();
    const chips = screen.getAllByRole('button', { pressed: false });
    expect(chips[0]?.textContent).toContain('최근 주제');
  });

  it('★다른 학생의 주제는 보이지 않는다', () => {
    threadState.records = [
      thread({ id: 'mine', title: '내 주제' }),
      thread({ id: 'other', title: '남의 주제', studentRef: 'tc:c1:9-9-9' }),
    ];
    renderPicker();
    expect(screen.getByText('내 주제')).toBeTruthy();
    expect(screen.queryByText('남의 주제')).toBeNull();
  });

  it('주제를 고르면 부모에게 알리고, 다시 누르면 선택을 푼다', () => {
    threadState.records = [thread({ id: 't1', title: '주제 하나' })];
    const { onSelect } = renderPicker();
    fireEvent.click(screen.getByText('주제 하나'));
    expect(onSelect).toHaveBeenCalledWith({ kind: 'existing', threadId: 't1' });

    cleanup();
    const second = renderPicker({ selected: { kind: 'existing', threadId: 't1' } });
    fireEvent.click(screen.getByText('주제 하나'));
    expect(second.onSelect).toHaveBeenCalledWith(null);
  });
});

describe('불러오기 실패', () => {
  it('빈 목록과 구별해 알리고 다시 시도를 제공한다', () => {
    threadState.loadError = 'EIO';
    renderPicker();
    expect(screen.getByText('주제를 불러오지 못했습니다')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('주제 목록 다시 불러오기'));
    expect(loadSpy).toHaveBeenCalledWith(true);
  });
});

describe('마친 주제', () => {
  it('★기본 목록에 없다', () => {
    threadState.records = [thread({ id: 'c1', title: '마친 것', status: 'closed' })];
    renderPicker();
    expect(screen.queryByText('마친 것')).toBeNull();
  });

  it('★다시 열기가 성공한 뒤에만 연결된다', async () => {
    threadState.records = [thread({ id: 'c1', title: '마친 것', status: 'closed' })];
    const { onSelect } = renderPicker();
    fireEvent.click(screen.getByText(/마친 주제 포함/));
    expect(screen.getByText('마친 것')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('마친 것 주제를 다시 열고 연결'));
    await waitFor(() => expect(updateSpy).toHaveBeenCalledWith('c1', { status: 'open' }));
    await waitFor(() =>
      expect(onSelect).toHaveBeenCalledWith({ kind: 'existing', threadId: 'c1' }),
    );
  });

  it('★다시 열기가 실패하면 연결하지 않고 그 항목에 오류를 남긴다', async () => {
    threadState.records = [thread({ id: 'c1', title: '마친 것', status: 'closed' })];
    updateSpy.mockRejectedValueOnce(new Error('쓰기 실패'));
    const { onSelect } = renderPicker();
    fireEvent.click(screen.getByText(/마친 주제 포함/));
    fireEvent.click(screen.getByLabelText('마친 것 주제를 다시 열고 연결'));

    await waitFor(() => expect(screen.getByText('다시 열지 못했습니다')).toBeTruthy());
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('새 주제 만들기', () => {
  it('★확정해도 저장소에 쓰지 않고 이름만 부모에게 넘긴다', async () => {
    const { onSelect } = renderPicker();
    fireEvent.click(screen.getByLabelText('새 주제 만들기'));

    const input = await screen.findByLabelText('주제 이름');
    fireEvent.change(input, { target: { value: '  할인 문구와 선택  ' } });
    fireEvent.click(screen.getByText('만들기'));

    expect(onSelect).toHaveBeenCalledWith({ kind: 'new', title: '할인 문구와 선택' });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('이름이 비면 만들 수 없다', async () => {
    renderPicker();
    fireEvent.click(screen.getByLabelText('새 주제 만들기'));
    await screen.findByLabelText('주제 이름');
    expect((screen.getByText('만들기') as HTMLButtonElement).disabled).toBe(true);
  });

  it('비슷한 이름의 기존 주제를 고르면 새로 만들지 않는다', async () => {
    threadState.records = [thread({ id: 't1', title: '할인 문구와 선택' })];
    const { onSelect } = renderPicker();
    fireEvent.click(screen.getByLabelText('새 주제 만들기'));

    const input = await screen.findByLabelText('주제 이름');
    fireEvent.change(input, { target: { value: '할인' } });
    fireEvent.click(await screen.findByText('비슷한 이름의 주제가 있어요. 이걸 선택할까요?'));
    fireEvent.click(screen.getAllByText('할인 문구와 선택')[1]!);

    expect(onSelect).toHaveBeenCalledWith({ kind: 'existing', threadId: 't1' });
  });
});
