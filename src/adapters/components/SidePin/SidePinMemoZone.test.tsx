/**
 * @vitest-environment jsdom
 *
 * 옆핀 메모 칸 테스트.
 *
 * 여기서 지키는 것은 **조용히 망가지는 것들**이다. 화면에 오류가 뜨지 않아서
 * 사람이 알아채기 어려운 자리만 골라 고정했다.
 *
 * - 열어만 봤는데 저장되면 목록 순서가 멋대로 뒤집힌다
 * - "쓰는 중"을 안 알리면 타이핑 도중 패널이 접혀 글이 날아간다
 * - 화면을 떠나며 손을 떼지 않으면 창이 영영 접히지 않는다
 * - 바깥에서 지운 메모를 열어 두면 저장이 조용히 실패한다
 */
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Memo } from '@domain/entities/Memo';
import type { MemoEditorActivity } from '@domain/entities/SidePinRuntimeState';
import { DEFAULT_MEMO_FONT_SIZE } from '@domain/valueObjects/MemoFontSize';
import { SidePinMemoZone } from './SidePinMemoZone';
import { useMemoStore } from '@adapters/stores/useMemoStore';

/** 실제 저장소 대신, 같은 모양으로 동작하는 메모리 저장소를 쓴다 */
vi.mock('@adapters/stores/useMemoStore', async () => {
  const { create } = await vi.importActual<typeof import('zustand')>('zustand');
  let seq = 0;
  const useMemoStore = create<Record<string, unknown>>((set, get) => ({
    memos: [] as Memo[],
    loaded: true,
    // 진짜 저장소는 다 읽으면 loaded를 세우지만 여기서는 세우지 않는다.
    // "아직 읽는 중"을 시험하려면 그 상태에 머무를 수 있어야 한다.
    load: vi.fn(async () => {}),
    addMemo: vi.fn(async (content: string, color: string) => {
      seq += 1;
      const now = new Date(2026, 0, 1, 0, 0, seq).toISOString();
      const created = { ...baseMemo(`new-${seq}`), content, color, createdAt: now, updatedAt: now };
      set({ memos: [...(get()['memos'] as Memo[]), created] });
    }),
    updateMemo: vi.fn(async (id: string, content: string) => {
      set({
        memos: (get()['memos'] as Memo[]).map((m) =>
          m.id === id ? { ...m, content, updatedAt: new Date().toISOString() } : m,
        ),
      });
    }),
    updateColor: vi.fn(async (id: string, color: string) => {
      set({
        memos: (get()['memos'] as Memo[]).map((m) => (m.id === id ? { ...m, color } : m)),
      });
    }),
    deleteMemo: vi.fn(async (id: string) => {
      set({ memos: (get()['memos'] as Memo[]).filter((m) => m.id !== id) });
    }),
  }));
  return { useMemoStore };
});

function baseMemo(id: string): Memo {
  return {
    id,
    content: '',
    color: 'yellow',
    x: 0,
    y: 0,
    width: 280,
    height: 220,
    rotation: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archived: false,
    fontSize: DEFAULT_MEMO_FONT_SIZE,
  };
}

function memo(id: string, content: string, updatedAt: string, archived = false): Memo {
  return { ...baseMemo(id), content, updatedAt, archived };
}

function seed(memos: Memo[]): void {
  act(() => {
    useMemoStore.setState({ memos, loaded: true });
  });
}

// 가짜 함수도 실제 계약과 같은 모양이어야 한다. 헐겁게 두면 계약이 바뀌어도
// 테스트가 그대로 통과해, 그물이 있는데 아무것도 못 잡는 상태가 된다.
let onActivity: ReturnType<typeof vi.fn<(activity: MemoEditorActivity) => void>>;
let onOpenMain: ReturnType<typeof vi.fn<() => void>>;

function renderZone(locked = false) {
  onActivity = vi.fn<(activity: MemoEditorActivity) => void>();
  onOpenMain = vi.fn<() => void>();
  return render(
    <SidePinMemoZone locked={locked} onOpenMain={onOpenMain} onEditorActivityChange={onActivity} />,
  );
}

/** 마지막으로 창에 알린 편집 상태 */
function lastActivity(): string | undefined {
  const calls = onActivity.mock.calls;
  return calls.length === 0 ? undefined : (calls[calls.length - 1]?.[0] as string);
}

beforeEach(() => {
  useMemoStore.setState({ memos: [], loaded: true });
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('목록', () => {
  test('최근에 고친 것부터 최대 5개까지 보여준다', () => {
    seed([
      memo('a', '가장 오래된', '2026-01-01T00:00:00.000Z'),
      memo('b', '둘째', '2026-01-02T00:00:00.000Z'),
      memo('c', '셋째', '2026-01-03T00:00:00.000Z'),
      memo('d', '넷째', '2026-01-04T00:00:00.000Z'),
      memo('e', '다섯째', '2026-01-05T00:00:00.000Z'),
      memo('f', '가장 최근', '2026-01-06T00:00:00.000Z'),
    ]);
    renderZone();

    expect(screen.getByRole('button', { name: /가장 최근/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /가장 오래된/ })).toBeNull();
  });

  test('5개를 넘으면 나머지가 있다는 것을 알린다 — 사라진 것처럼 보이면 안 된다', () => {
    seed(
      Array.from({ length: 7 }, (_, i) =>
        memo(`m${i}`, `할 일 ${i}`, `2026-01-0${i + 1}T00:00:00.000Z`),
      ),
    );
    renderZone();

    fireEvent.click(screen.getByRole('button', { name: /모두 보기/ }));

    expect(onOpenMain).toHaveBeenCalled();
  });

  test('보관한 메모는 목록에 나오지 않는다', () => {
    seed([memo('a', '보관됨', '2026-01-09T00:00:00.000Z', true)]);
    renderZone();

    expect(screen.queryByRole('button', { name: /보관됨/ })).toBeNull();
  });

  test('메모가 없으면 첫 메모를 쓰도록 안내한다', () => {
    renderZone();

    expect(screen.getByRole('button', { name: '첫 메모 쓰기' })).toBeTruthy();
  });

  test('아직 불러오는 중이면 "없습니다"라고 말하지 않는다', () => {
    act(() => {
      useMemoStore.setState({ memos: [], loaded: false });
    });
    renderZone();

    expect(screen.queryByRole('button', { name: '첫 메모 쓰기' })).toBeNull();
  });
});

describe('저장 시점', () => {
  test('열어만 보고 나가면 저장하지 않는다 — 목록 순서가 멋대로 뒤집힌다', async () => {
    seed([memo('a', '그대로 둔 항목', '2026-01-05T00:00:00.000Z')]);
    renderZone();

    fireEvent.click(screen.getByRole('button', { name: /그대로 둔 항목/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '메모 목록으로' }));
    });

    expect(useMemoStore.getState()['updateMemo']).not.toHaveBeenCalled();
  });

  test('고치고 나가면 저장한다', async () => {
    seed([memo('a', '원래 내용', '2026-01-05T00:00:00.000Z')]);
    renderZone();

    fireEvent.click(screen.getByRole('button', { name: /원래 내용/ }));
    fireEvent.change(screen.getByRole('textbox', { name: '메모 내용' }), {
      target: { value: '고친 내용' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '메모 목록으로' }));
    });

    expect(useMemoStore.getState()['updateMemo']).toHaveBeenCalledWith('a', '고친 내용');
  });

  test('타자가 멈추면 나가지 않아도 저장한다 — 저장 단추가 없기 때문이다', async () => {
    vi.useFakeTimers();
    seed([memo('a', '원래 내용', '2026-01-05T00:00:00.000Z')]);
    renderZone();

    fireEvent.click(screen.getByRole('button', { name: /원래 내용/ }));
    fireEvent.change(screen.getByRole('textbox', { name: '메모 내용' }), {
      target: { value: '쓰는 중' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });

    expect(useMemoStore.getState()['updateMemo']).toHaveBeenCalledWith('a', '쓰는 중');
  });
});

describe('창에 알리는 편집 상태 — 없으면 타이핑 도중 접힌다', () => {
  test('메모를 열면 쓰는 중이라고 알린다', () => {
    seed([memo('a', '오늘 할 일', '2026-01-05T00:00:00.000Z')]);
    renderZone();

    fireEvent.click(screen.getByRole('button', { name: /오늘 할 일/ }));

    expect(lastActivity()).toBe('editing');
  });

  test('목록으로 돌아가면 손을 뗀다', async () => {
    seed([memo('a', '오늘 할 일', '2026-01-05T00:00:00.000Z')]);
    renderZone();

    fireEvent.click(screen.getByRole('button', { name: /오늘 할 일/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '메모 목록으로' }));
    });

    expect(lastActivity()).toBe('idle');
  });

  test('삭제를 물어보는 동안에도 접히지 않는다', () => {
    seed([memo('a', '오늘 할 일', '2026-01-05T00:00:00.000Z')]);
    renderZone();

    fireEvent.click(screen.getByRole('button', { name: /오늘 할 일/ }));
    fireEvent.click(screen.getByRole('button', { name: '메모 삭제' }));

    expect(lastActivity()).toBe('dialog-open');
  });

  test('화면이 사라질 때 손을 뗀다 — 안 그러면 창이 영영 접히지 않는다', () => {
    seed([memo('a', '오늘 할 일', '2026-01-05T00:00:00.000Z')]);
    const { unmount } = renderZone();

    fireEvent.click(screen.getByRole('button', { name: /오늘 할 일/ }));
    unmount();

    expect(lastActivity()).toBe('idle');
  });
});

describe('바깥에서 벌어진 일', () => {
  test('열어 둔 메모가 다른 창에서 지워지면 목록으로 돌아간다', () => {
    seed([memo('a', '곧 지워질 항목', '2026-01-05T00:00:00.000Z')]);
    renderZone();
    fireEvent.click(screen.getByRole('button', { name: /곧 지워질 항목/ }));

    seed([]);

    expect(screen.getByRole('button', { name: '첫 메모 쓰기' })).toBeTruthy();
  });

  test('보호 상태가 되면 편집을 접는다 — 잠금 화면 위로 내용이 보이면 안 된다', () => {
    seed([memo('a', '비밀 항목', '2026-01-05T00:00:00.000Z')]);
    const { rerender } = renderZone();
    fireEvent.click(screen.getByRole('button', { name: /비밀 항목/ }));

    rerender(
      <SidePinMemoZone locked onOpenMain={onOpenMain} onEditorActivityChange={onActivity} />,
    );

    expect(screen.queryByRole('textbox', { name: '메모 내용' })).toBeNull();
  });
});

describe('빠른 추가와 삭제', () => {
  test('새 메모는 노란색으로 만들고 바로 쓸 수 있게 연다', async () => {
    renderZone();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '첫 메모 쓰기' }));
    });

    expect(useMemoStore.getState()['addMemo']).toHaveBeenCalledWith('', 'yellow');
    expect(screen.getByRole('textbox', { name: '메모 내용' })).toBeTruthy();
  });

  test('삭제는 한 번 더 물어본다', () => {
    seed([memo('a', '지울 항목', '2026-01-05T00:00:00.000Z')]);
    renderZone();

    fireEvent.click(screen.getByRole('button', { name: /지울 항목/ }));
    fireEvent.click(screen.getByRole('button', { name: '메모 삭제' }));

    expect(useMemoStore.getState()['deleteMemo']).not.toHaveBeenCalled();
    expect(screen.getByText('이 메모를 지울까요?')).toBeTruthy();
  });

  test('확인하면 지우고 목록으로 돌아간다', async () => {
    seed([memo('a', '지울 항목', '2026-01-05T00:00:00.000Z')]);
    renderZone();

    fireEvent.click(screen.getByRole('button', { name: /지울 항목/ }));
    fireEvent.click(screen.getByRole('button', { name: '메모 삭제' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    });

    expect(useMemoStore.getState()['deleteMemo']).toHaveBeenCalledWith('a');
  });

  test('지운 메모에 마지막 입력을 저장하지 않는다 — 되살아난 것처럼 보인다', async () => {
    seed([memo('a', '지울 항목', '2026-01-05T00:00:00.000Z')]);
    renderZone();

    fireEvent.click(screen.getByRole('button', { name: /지울 항목/ }));
    fireEvent.change(screen.getByRole('textbox', { name: '메모 내용' }), {
      target: { value: '지우기 직전에 친 글' },
    });
    fireEvent.click(screen.getByRole('button', { name: '메모 삭제' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    });

    expect(useMemoStore.getState()['updateMemo']).not.toHaveBeenCalled();
  });
});

describe('Esc', () => {
  test('Esc는 목록으로 돌아간다 — 패널을 닫아 버리면 안 된다', async () => {
    seed([memo('a', '오늘 할 일', '2026-01-05T00:00:00.000Z')]);
    renderZone();

    fireEvent.click(screen.getByRole('button', { name: /오늘 할 일/ }));
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('textbox', { name: '메모 내용' }), { key: 'Escape' });
    });

    expect(screen.queryByRole('textbox', { name: '메모 내용' })).toBeNull();
  });

  test('삭제를 물어보는 중이면 Esc는 그 물음만 닫는다', () => {
    seed([memo('a', '오늘 할 일', '2026-01-05T00:00:00.000Z')]);
    renderZone();

    fireEvent.click(screen.getByRole('button', { name: /오늘 할 일/ }));
    fireEvent.click(screen.getByRole('button', { name: '메모 삭제' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: '메모 내용' }), { key: 'Escape' });

    expect(screen.queryByText('이 메모를 지울까요?')).toBeNull();
    expect(screen.getByRole('textbox', { name: '메모 내용' })).toBeTruthy();
  });
});
