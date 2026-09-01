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
 * - 파일 대화상자를 보는 동안 "쓰는 중"을 안 걸면 패널이 접혀 고른 그림이 붙지 못한다
 * - 이미지 안내를 안 치우면 다음에 연 메모에 엉뚱하게 붙어 있다
 * - 검색 칸을 "쓰는 중"으로 안 치면 찾는 말을 치는 도중에 패널이 접힌다
 * - 검색 결과가 없을 때 "첫 메모 쓰기"를 내밀면 있는 메모를 없다고 말하는 셈이 된다
 */
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Memo } from '@domain/entities/Memo';
import type { MemoEditorActivity } from '@domain/entities/SidePinRuntimeState';
import { DEFAULT_MEMO_FONT_SIZE } from '@domain/valueObjects/MemoFontSize';
import { SidePinMemoZone } from './SidePinMemoZone';
import { useMemoStore } from '@adapters/stores/useMemoStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { hashPin } from '@domain/rules/pinRules';

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
    updateFontSize: vi.fn(async (id: string, fontSize: string) => {
      set({
        memos: (get()['memos'] as Memo[]).map((m) => (m.id === id ? { ...m, fontSize } : m)),
      });
    }),
    // 진짜 attachImage는 크기·형식을 보고 리사이즈까지 한다. 여기서는 그 결과만 흉내 낸다.
    attachImage: vi.fn(async (id: string, blob: Blob, fileName: string) => {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(blob.type)) {
        return { ok: false as const, reason: 'mime' as const };
      }
      const image = {
        dataUrl: 'data:image/png;base64,AAAA',
        fileName,
        mimeType: blob.type,
        width: 10,
        height: 10,
        originalSize: blob.size,
      };
      set({
        memos: (get()['memos'] as Memo[]).map((m) => (m.id === id ? { ...m, image } : m)),
      });
      return { ok: true as const };
    }),
    detachImage: vi.fn(async (id: string) => {
      set({
        memos: (get()['memos'] as Memo[]).map((m) => {
          if (m.id !== id) return m;
          const { image: _dropped, ...rest } = m;
          return rest as Memo;
        }),
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

function renderZone(locked = false) {
  onActivity = vi.fn<(activity: MemoEditorActivity) => void>();
  return render(<SidePinMemoZone locked={locked} onEditorActivityChange={onActivity} />);
}

/** 마지막으로 창에 알린 편집 상태 */
function lastActivity(): string | undefined {
  const calls = onActivity.mock.calls;
  return calls.length === 0 ? undefined : (calls[calls.length - 1]?.[0] as string);
}

beforeEach(() => {
  useMemoStore.setState({ memos: [], loaded: true });
  // 설정이 실려 있어야 "메모를 잠글 기능인지"를 판단할 수 있다.
  // 안 실려 있으면 메모 칸은 **잠긴 쪽으로** 판단해 아무것도 안 그린다(의도된 동작).
  useSettingsStore.setState({ loaded: true });
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('목록', () => {
  test('최근에 고친 것이 위로 온다', () => {
    seed([
      memo('a', '가장 오래된', '2026-01-01T00:00:00.000Z'),
      memo('f', '가장 최근', '2026-01-06T00:00:00.000Z'),
    ]);
    renderZone();

    const labels = screen
      .getAllByRole('button')
      .map((b) => b.textContent ?? '')
      .filter((t) => t.includes('가장'));
    expect(labels[0]).toContain('가장 최근');
  });

  test('개수를 자르지 않는다 — 옆핀 안에서 위아래로 훑어 전부 볼 수 있다', () => {
    // 5개만 보여주고 나머지를 본체로 넘기면, 메모 하나 찾으러 매번 앱을 열어야 한다.
    seed(
      Array.from({ length: 9 }, (_, i) =>
        memo(`m${i}`, `할 일 ${i}`, `2026-01-0${i + 1}T00:00:00.000Z`),
      ),
    );
    renderZone();

    for (let i = 0; i < 9; i += 1) {
      expect(screen.getByRole('button', { name: new RegExp(`할 일 ${i}`) })).toBeTruthy();
    }
  });

  test('목록이 스크롤된다 — 길어져도 머리말이 밀려나지 않는다', () => {
    seed([memo('a', '하나', '2026-01-01T00:00:00.000Z')]);
    const { container } = renderZone();

    const scroller = container.querySelector('.overflow-y-auto');
    expect(scroller).toBeTruthy();
    // min-h-0 이 없으면 안쪽 스크롤이 부모를 밀어내 머리말이 잘린다.
    expect(scroller?.className).toContain('min-h-0');
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

    rerender(<SidePinMemoZone locked onEditorActivityChange={onActivity} />);

    expect(screen.queryByRole('textbox', { name: '메모 내용' })).toBeNull();
  });

  test('보호로 접히면 화면에서 **즉시** 사라진다 — 저장을 기다리지 않는다', () => {
    // 저장을 기다렸다 닫으면 보호가 걸린 뒤에도 한 박자 동안 내용이 남는다.
    // 가려야 할 순간에는 화면을 치우는 쪽이 먼저다(계획서 P3).
    // 그 대가로 미저장 분량(저장 지연 이내)은 잃는다 — 알려진 한계이고
    // 잠금·절전에서도 원래부터 같았다.
    seed([memo('a', '원래 내용', '2026-01-05T00:00:00.000Z')]);
    const { rerender } = renderZone();
    fireEvent.click(screen.getByRole('button', { name: /원래 내용/ }));

    const box = screen.getByRole('textbox', { name: '메모 내용' });
    fireEvent.change(box, { target: { value: '방금 친 글자' } });

    rerender(<SidePinMemoZone locked onEditorActivityChange={onActivity} />);

    expect(screen.queryByRole('textbox', { name: '메모 내용' })).toBeNull();
  });

  test('바깥에서 지워져 접히는 경우에는 저장하지 않는다 — 지운 메모를 되살리면 안 된다', () => {
    seed([memo('a', '곧 지워질 항목', '2026-01-05T00:00:00.000Z')]);
    renderZone();
    fireEvent.click(screen.getByRole('button', { name: /곧 지워질 항목/ }));

    seed([]);

    expect(useMemoStore.getState()['updateMemo']).not.toHaveBeenCalled();
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

describe('글자 크기', () => {
  test('고른 크기를 저장한다 — 본체 메모와 같은 값을 함께 쓴다', async () => {
    seed([memo('a', '오늘 할 일', '2026-01-05T00:00:00.000Z')]);
    renderZone();

    fireEvent.click(screen.getByRole('button', { name: /오늘 할 일/ }));
    fireEvent.click(screen.getByRole('button', { name: '글자 크기' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '크게' }));
    });

    expect(useMemoStore.getState()['updateFontSize']).toHaveBeenCalledWith('a', 'lg');
  });

  test('고른 크기가 글 쓰는 칸에 실제로 적용된다', async () => {
    // 저장만 되고 화면이 그대로면 사람 눈에는 "안 먹는 기능"이다.
    seed([memo('a', '오늘 할 일', '2026-01-05T00:00:00.000Z')]);
    renderZone();

    fireEvent.click(screen.getByRole('button', { name: /오늘 할 일/ }));
    fireEvent.click(screen.getByRole('button', { name: '글자 크기' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '아주 크게' }));
    });

    expect(screen.getByRole('textbox', { name: '메모 내용' }).className).toContain('text-xl');
  });

  test('글자 크기 줄이 펴져 있으면 Esc는 그 줄만 닫는다', () => {
    seed([memo('a', '오늘 할 일', '2026-01-05T00:00:00.000Z')]);
    renderZone();

    fireEvent.click(screen.getByRole('button', { name: /오늘 할 일/ }));
    fireEvent.click(screen.getByRole('button', { name: '글자 크기' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: '메모 내용' }), { key: 'Escape' });

    expect(screen.queryByRole('button', { name: '크게' })).toBeNull();
    expect(screen.getByRole('textbox', { name: '메모 내용' })).toBeTruthy();
  });
});

describe('이미지', () => {
  /** 파일 선택 창을 여는 단추를 누른다 */
  function openPicker(): void {
    fireEvent.click(screen.getByRole('button', { name: '이미지 넣기' }));
  }

  function pngFile(): File {
    return new File(['x'], '칠판.png', { type: 'image/png' });
  }

  test('파일 선택 창을 여는 동안 "쓰는 중"을 건다 — 안 걸면 패널이 접혀 그림이 붙지 못한다', () => {
    seed([memo('a', '오늘 할 일', '2026-01-05T00:00:00.000Z')]);
    renderZone();

    fireEvent.click(screen.getByRole('button', { name: /오늘 할 일/ }));
    openPicker();

    expect(lastActivity()).toBe('dialog-open');
  });

  test('아무것도 고르지 않고 닫으면 "쓰는 중"이 풀린다 — 안 그러면 패널이 영영 안 접힌다', async () => {
    seed([memo('a', '오늘 할 일', '2026-01-05T00:00:00.000Z')]);
    const { container } = renderZone();

    fireEvent.click(screen.getByRole('button', { name: /오늘 할 일/ }));
    openPicker();

    const input = container.querySelector('input[type="file"]');
    expect(input).toBeTruthy();
    await act(async () => {
      // 취소하면 파일 없이 change가 온다.
      fireEvent.change(input as HTMLInputElement, { target: { files: [] } });
    });

    expect(lastActivity()).not.toBe('dialog-open');
  });

  test('고른 그림을 메모에 붙인다', async () => {
    seed([memo('a', '오늘 할 일', '2026-01-05T00:00:00.000Z')]);
    const { container } = renderZone();

    fireEvent.click(screen.getByRole('button', { name: /오늘 할 일/ }));
    openPicker();
    await act(async () => {
      fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, {
        target: { files: [pngFile()] },
      });
    });

    expect(useMemoStore.getState()['attachImage']).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '이미지 크게 보기' })).toBeTruthy();
  });

  test('붙일 수 없는 파일이면 이유를 사람 말로 알려 준다 — 조용히 실패하면 안 된다', async () => {
    seed([memo('a', '오늘 할 일', '2026-01-05T00:00:00.000Z')]);
    const { container } = renderZone();

    fireEvent.click(screen.getByRole('button', { name: /오늘 할 일/ }));
    openPicker();
    await act(async () => {
      fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, {
        target: { files: [new File(['x'], '보고서.pdf', { type: 'application/pdf' })] },
      });
    });

    expect(screen.getByRole('alert').textContent).toContain('PNG');
  });

  test('목록으로 나가면 안내가 사라진다 — 다음에 연 메모에 엉뚱하게 붙어 있으면 안 된다', async () => {
    seed([
      memo('a', '오늘 할 일', '2026-01-05T00:00:00.000Z'),
      memo('b', '다른 메모', '2026-01-04T00:00:00.000Z'),
    ]);
    const { container } = renderZone();

    fireEvent.click(screen.getByRole('button', { name: /오늘 할 일/ }));
    openPicker();
    await act(async () => {
      fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, {
        target: { files: [new File(['x'], '보고서.pdf', { type: 'application/pdf' })] },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '메모 목록으로' }));
    });
    fireEvent.click(screen.getByRole('button', { name: /다른 메모/ }));

    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('붙은 그림을 뺄 수 있다', async () => {
    seed([
      {
        ...memo('a', '오늘 할 일', '2026-01-05T00:00:00.000Z'),
        image: {
          dataUrl: 'data:image/png;base64,AAAA',
          fileName: '칠판.png',
          mimeType: 'image/png',
          width: 10,
          height: 10,
          originalSize: 100,
        },
      },
    ]);
    renderZone();

    fireEvent.click(screen.getByRole('button', { name: /오늘 할 일/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '이미지 빼기' }));
    });

    expect(useMemoStore.getState()['detachImage']).toHaveBeenCalledWith('a');
  });
});

describe('메모 찾기', () => {
  /** 검색 칸이 뜨고도 남을 만큼(5개) 메모를 깔아 둔다 */
  function seedMany(): void {
    seed([
      memo('a', '3월 학년 회의', '2026-01-05T00:00:00.000Z'),
      memo('b', '급식 신청 마감', '2026-01-04T00:00:00.000Z'),
      memo('c', '동아리 명단', '2026-01-03T00:00:00.000Z'),
      memo('d', '체험학습 안내', '2026-01-02T00:00:00.000Z'),
      memo('e', '상담 일정', '2026-01-01T00:00:00.000Z'),
    ]);
  }

  test('찾는 말에 걸리는 메모만 남는다', () => {
    seedMany();
    renderZone();

    fireEvent.change(screen.getByRole('searchbox', { name: '메모 찾기' }), {
      target: { value: '급식' },
    });

    expect(screen.getByRole('button', { name: /급식 신청 마감/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /3월 학년 회의/ })).toBeNull();
  });

  test('검색 칸에 손이 가 있으면 "쓰는 중"을 건다 — 안 걸면 치는 도중에 접힌다', () => {
    seedMany();
    renderZone();

    fireEvent.focus(screen.getByRole('searchbox', { name: '메모 찾기' }));

    expect(lastActivity()).toBe('editing');
  });

  test('검색 칸에서 손을 떼면 "쓰는 중"이 풀린다 — 안 그러면 패널이 영영 안 접힌다', () => {
    seedMany();
    renderZone();

    const box = screen.getByRole('searchbox', { name: '메모 찾기' });
    fireEvent.focus(box);
    fireEvent.blur(box);

    expect(lastActivity()).toBe('idle');
  });

  test('걸린 게 없으면 "첫 메모 쓰기"가 아니라 "찾는 메모가 없습니다"를 보여준다', () => {
    // 메모는 있는데 없다고 말하면, 찾는 말을 지우면 나온다는 걸 알 길이 없다.
    seedMany();
    renderZone();

    fireEvent.change(screen.getByRole('searchbox', { name: '메모 찾기' }), {
      target: { value: '있을 리 없는 말' },
    });

    expect(screen.getByText('찾는 메모가 없습니다')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '첫 메모 쓰기' })).toBeNull();
  });

  test('메모가 몇 개 없으면 검색 칸을 띄우지 않는다 — 자리만 차지한다', () => {
    seed([memo('a', '하나뿐인 메모', '2026-01-05T00:00:00.000Z')]);
    renderZone();

    expect(screen.queryByRole('searchbox', { name: '메모 찾기' })).toBeNull();
  });

  // 아래 두 개가 기준값(SIDE_PIN_SEARCH_MIN_MEMOS)을 실제로 붙잡는 그물이다.
  // 위의 "메모 1개" 테스트만으로는 기준이 3이든 5든 똑같이 통과해 버린다.
  test('메모 2개까지는 검색 칸이 안 뜬다 — 기준값 바로 아래', () => {
    seed([
      memo('a', '3월 학년 회의', '2026-01-05T00:00:00.000Z'),
      memo('b', '급식 신청 마감', '2026-01-04T00:00:00.000Z'),
    ]);
    renderZone();

    expect(screen.queryByRole('searchbox', { name: '메모 찾기' })).toBeNull();
  });

  test('메모 3개부터 검색 칸이 뜬다 — 기준값을 5에서 낮춘 지점', () => {
    seed([
      memo('a', '3월 학년 회의', '2026-01-05T00:00:00.000Z'),
      memo('b', '급식 신청 마감', '2026-01-04T00:00:00.000Z'),
      memo('c', '동아리 명단', '2026-01-03T00:00:00.000Z'),
    ]);
    renderZone();

    expect(screen.getByRole('searchbox', { name: '메모 찾기' })).toBeTruthy();
  });

  test('새 메모를 만들면 찾던 말을 지운다 — 안 지우면 방금 만든 것이 목록에서 사라진다', async () => {
    seedMany();
    renderZone();

    fireEvent.change(screen.getByRole('searchbox', { name: '메모 찾기' }), {
      target: { value: '급식' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '새 메모' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '메모 목록으로' }));
    });

    expect(screen.getByRole('searchbox', { name: '메모 찾기' })).toHaveProperty('value', '');
    expect(screen.getByRole('button', { name: /3월 학년 회의/ })).toBeTruthy();
  });

  test('잠기면 검색 칸이 사라진다 — 쳐도 걸러지지 않으므로 남겨 두면 고장으로 보인다', () => {
    seedMany();
    renderZone(true);

    expect(screen.queryByRole('searchbox', { name: '메모 찾기' })).toBeNull();
  });
});

// ─── 메모 칸 PIN 잠금 ───────────────────────────────────────────

describe('메모 칸 PIN 잠금', () => {
  const PIN = '1234';

  /** 메모를 잠금 대상으로 세운다 */
  function lockMemo(): void {
    const cur = useSettingsStore.getState();
    useSettingsStore.setState({
      loaded: true,
      settings: {
        ...cur.settings,
        pin: {
          ...cur.settings.pin,
          enabled: true,
          pinHash: hashPin(PIN),
          protectedFeatures: { ...cur.settings.pin.protectedFeatures, memo: true },
        },
      },
    });
  }

  test('★ 잠기면 메모 내용이 DOM 에 없다', () => {
    useMemoStore.setState({
      memos: [memo('a', '학부모 상담 메모', '2026-01-05T00:00:00.000Z')],
      loaded: true,
    });
    lockMemo();

    render(
      <SidePinMemoZone locked={false} pinUnlockedAt={null} onEditorActivityChange={vi.fn()} />,
    );

    expect(screen.queryByText(/학부모 상담 메모/)).toBeNull();
    expect(screen.getByRole('button', { name: '잠금 해제' })).toBeTruthy();
  });

  test('★ 잠기면 검색 칸도 안 보인다 — 쳐도 안 걸러지면 고장으로 보인다', () => {
    useMemoStore.setState({ memos: [memo('a', '내용', '2026-01-05T00:00:00.000Z')], loaded: true });
    lockMemo();

    render(
      <SidePinMemoZone locked={false} pinUnlockedAt={null} onEditorActivityChange={vi.fn()} />,
    );

    expect(screen.queryByRole('searchbox', { name: '메모 찾기' })).toBeNull();
  });

  test('창이 "풀려 있다"고 하면 메모가 보인다', () => {
    useMemoStore.setState({
      memos: [memo('a', '학부모 상담 메모', '2026-01-05T00:00:00.000Z')],
      loaded: true,
    });
    lockMemo();

    render(
      <SidePinMemoZone
        locked={false}
        pinUnlockedAt={Date.now()}
        onEditorActivityChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/학부모 상담 메모/)).toBeTruthy();
  });

  test('메모를 잠금 대상으로 안 골랐으면 그대로 보인다', () => {
    useMemoStore.setState({
      memos: [memo('a', '학부모 상담 메모', '2026-01-05T00:00:00.000Z')],
      loaded: true,
    });
    const cur = useSettingsStore.getState();
    useSettingsStore.setState({
      loaded: true,
      settings: {
        ...cur.settings,
        pin: {
          ...cur.settings.pin,
          enabled: true,
          pinHash: hashPin(PIN),
          protectedFeatures: { ...cur.settings.pin.protectedFeatures, memo: false },
        },
      },
    });

    render(
      <SidePinMemoZone locked={false} pinUnlockedAt={null} onEditorActivityChange={vi.fn()} />,
    );

    expect(screen.getByText(/학부모 상담 메모/)).toBeTruthy();
  });

  test('★ 설정이 아직 안 실렸으면 메모를 안 그린다', () => {
    // 기본값을 믿고 열어 주면 설정이 실리기 전 몇 프레임 동안 잠근 메모가 그대로 보인다.
    useMemoStore.setState({
      memos: [memo('a', '학부모 상담 메모', '2026-01-05T00:00:00.000Z')],
      loaded: true,
    });
    useSettingsStore.setState({ loaded: false });

    render(
      <SidePinMemoZone locked={false} pinUnlockedAt={null} onEditorActivityChange={vi.fn()} />,
    );

    expect(screen.queryByText(/학부모 상담 메모/)).toBeNull();
    // 잠글 기능인지조차 모르므로 자물쇠도 안 보여 준다
    expect(screen.queryByRole('button', { name: '잠금 해제' })).toBeNull();
  });

  test('보호(잠금·절전·발표) 중에는 자물쇠를 안 보여 준다 — 창이 이미 화면에서 사라졌다', () => {
    useMemoStore.setState({ memos: [memo('a', '내용', '2026-01-05T00:00:00.000Z')], loaded: true });
    lockMemo();

    render(<SidePinMemoZone locked pinUnlockedAt={null} onEditorActivityChange={vi.fn()} />);

    expect(screen.queryByRole('button', { name: '잠금 해제' })).toBeNull();
  });

  test('★ PIN 을 맞추면 창의 답을 기다리지 않고 바로 열린다', async () => {
    useMemoStore.setState({
      memos: [memo('a', '학부모 상담 메모', '2026-01-05T00:00:00.000Z')],
      loaded: true,
    });
    lockMemo();

    render(
      <SidePinMemoZone
        locked={false}
        pinUnlockedAt={null}
        onPinUnlocked={() => {}}
        onEditorActivityChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '잠금 해제' }));
    for (const d of PIN.split('')) fireEvent.click(screen.getByRole('button', { name: d }));

    await screen.findByText(/학부모 상담 메모/, undefined, { timeout: 3_000 });
  });
});
