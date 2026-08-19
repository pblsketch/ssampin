/**
 * @vitest-environment jsdom
 *
 * 옆핀 위젯 칸 테스트.
 *
 * 여기서 지키는 것은 **조용히 망가지는 것들**이다.
 *
 * - 여는 동안 "쓰는 중"을 안 알리면 고치는 도중에 패널이 접혀 입력이 날아간다
 * - 화면을 떠나며 손을 떼지 않으면 창이 영영 접히지 않는다
 * - 크게 보기만 하는 위젯에 여는 단추를 달면 열어 놓고 "왜 안 고쳐지지"가 된다
 * - 열어 둔 위젯이 목록에서 사라지면 아무것도 안 그려진 빈 칸에 갇힌다
 */
import { describe, expect, test, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { WidgetDefinition } from '@widgets/types';
import type { MemoEditorActivity } from '@domain/entities/SidePinRuntimeState';
import { SidePinWidgetZone } from './SidePinWidgetZone';

afterEach(cleanup);

/** 요약/전체를 눈에 보이게 구분하는 가짜 위젯 본문 */
function Body({ isCompactMode = true }: { isCompactMode?: boolean } = {}) {
  return <div>{isCompactMode ? '요약 본문' : '고치는 본문'}</div>;
}

function widget(id: string, modalMode?: WidgetDefinition['modalMode']): WidgetDefinition {
  return {
    id,
    name: `${id} 이름`,
    icon: '📌',
    description: '',
    category: 'info',
    defaultSize: { w: 1, h: 1 },
    minSize: { w: 1, h: 1 },
    availableFor: { schoolLevel: [], role: [] },
    component: Body,
    sidePin: { eligible: true, navigationTarget: 'schedule' },
    ...(modalMode === undefined ? {} : { modalMode }),
  };
}

let onActivity: ReturnType<typeof vi.fn<(activity: MemoEditorActivity) => void>>;

function renderZone(definitions: WidgetDefinition[], selectedIds?: string[]) {
  onActivity = vi.fn<(activity: MemoEditorActivity) => void>();
  const view = render(
    <SidePinWidgetZone
      definitions={definitions}
      selectedIds={selectedIds ?? definitions.map((d) => d.id)}
      onOpenInApp={vi.fn()}
      onEditorActivityChange={onActivity}
    />,
  );
  return view;
}

/** 마지막으로 창에 알린 상태 */
function lastActivity(): string | undefined {
  const calls = onActivity.mock.calls;
  return calls.length === 0 ? undefined : (calls[calls.length - 1]?.[0] as string);
}

describe('여는 단추', () => {
  test('고칠 수 있는 위젯에만 단추를 단다', () => {
    renderZone([widget('할일', 'view+edit')]);

    expect(screen.getByRole('button', { name: '할일 이름 열기' })).toBeTruthy();
  });

  test('크게 보기만 하는 위젯에는 달지 않는다 — 열어 놓고 못 고치면 고장으로 보인다', () => {
    renderZone([widget('급식', 'expanded')]);

    expect(screen.queryByRole('button', { name: '급식 이름 열기' })).toBeNull();
  });
});

describe('열어서 고치기', () => {
  test('열면 요약이 아니라 고치는 본문을 그린다', () => {
    renderZone([widget('할일', 'view+edit')]);
    expect(screen.getByText('요약 본문')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '할일 이름 열기' }));

    expect(screen.getByText('고치는 본문')).toBeTruthy();
    expect(screen.queryByText('요약 본문')).toBeNull();
  });

  test('여는 동안 "쓰는 중"을 건다 — 안 걸면 고치는 도중에 패널이 접힌다', () => {
    renderZone([widget('할일', 'view+edit')]);

    fireEvent.click(screen.getByRole('button', { name: '할일 이름 열기' }));

    expect(lastActivity()).toBe('editing');
  });

  test('목록으로 돌아오면 "쓰는 중"이 풀린다 — 안 그러면 창이 영영 안 접힌다', () => {
    renderZone([widget('할일', 'view+edit')]);

    fireEvent.click(screen.getByRole('button', { name: '할일 이름 열기' }));
    fireEvent.click(screen.getByRole('button', { name: '위젯 목록으로' }));

    expect(lastActivity()).toBe('idle');
  });

  test('화면을 떠나면 손을 뗀다 — 열어 둔 채 사라지면 창이 영영 안 접힌다', () => {
    const { unmount } = renderZone([widget('할일', 'view+edit')]);
    fireEvent.click(screen.getByRole('button', { name: '할일 이름 열기' }));

    unmount();

    expect(lastActivity()).toBe('idle');
  });

  test('Esc는 목록으로 돌아간다 — 패널을 닫아 버리면 안 된다', () => {
    renderZone([widget('할일', 'view+edit')]);
    fireEvent.click(screen.getByRole('button', { name: '할일 이름 열기' }));

    fireEvent.keyDown(screen.getByLabelText('할일 이름 열기'), { key: 'Escape' });

    expect(screen.getByText('요약 본문')).toBeTruthy();
  });

  test('열어 둔 위젯이 목록에서 사라지면 목록으로 돌린다 — 빈 칸에 갇히면 안 된다', () => {
    const definitions = [widget('할일', 'view+edit'), widget('일정', 'view+edit')];
    const { rerender } = renderZone(definitions);
    fireEvent.click(screen.getByRole('button', { name: '할일 이름 열기' }));
    expect(screen.getByText('고치는 본문')).toBeTruthy();

    rerender(
      <SidePinWidgetZone
        definitions={definitions}
        selectedIds={['일정']}
        onOpenInApp={vi.fn()}
        onEditorActivityChange={onActivity}
      />,
    );

    expect(screen.getByRole('button', { name: '일정 이름 열기' })).toBeTruthy();
    expect(lastActivity()).toBe('idle');
  });
});
