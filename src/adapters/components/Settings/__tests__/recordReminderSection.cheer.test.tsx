// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
/**
 * ADR-135 — 설정의 '응원·잔디' 스위치와 '제외 학생' 목록은 알림을 꺼 둬도 흐려지지 않고,
 * [다시 넣기]는 누르는 즉시 저장된다(목록은 초안이 아니라 저장된 값을 읽는다).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { Settings } from '@domain/entities/Settings';
import { DEFAULT_REMINDER_SETTINGS } from '@domain/entities/RecordReminder';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { RecordReminderSection } from '../RecordReminderSection';

vi.mock('@adapters/stores/useRecordReminderStore', () => ({
  useRecordReminderStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      pausedUntil: null,
      pauseForToday: vi.fn(),
      pauseForWeek: vi.fn(),
      clearPause: vi.fn(),
    }),
  isReminderPaused: () => false,
}));

const removeReminderExclusion = vi.fn(async () => {});
const noop = async (): Promise<void> => {};

beforeEach(() => {
  removeReminderExclusion.mockClear();
  useSettingsStore.setState({
    removeReminderExclusion,
    settings: {
      ...useSettingsStore.getState().settings,
      className: '2학년 3반',
      recordReminder: {
        ...DEFAULT_REMINDER_SETTINGS,
        enabled: false,
        exclusions: [{ key: 'b', until: '2099-10-06' }],
      },
    },
  });
  useStudentStore.setState({
    students: [
      { id: 'a', name: '김가람', studentNumber: 1 },
      { id: 'b', name: '이나래', studentNumber: 2 },
    ],
    loaded: true,
    load: noop,
  });
  useTeachingClassStore.setState({ classes: [], loaded: true, load: noop });
});

afterEach(cleanup);

/** 초안에는 빼기 목록이 없다 — 화면은 저장된 값(스토어)을 읽어야 한다. */
const draft = {
  recordReminder: { ...DEFAULT_REMINDER_SETTINGS, enabled: false },
} as unknown as Settings;

describe("설정 '응원·잔디'·'제외 학생'", () => {
  it('알림을 꺼 둬도 흐리게 막히지 않는다', () => {
    render(<RecordReminderSection draft={draft} patch={vi.fn()} />);
    const toggle = screen.getByText('응원·잔디 표시').closest('div.flex.items-center');
    expect(toggle?.closest('[aria-disabled="true"]')).toBeNull();
    const row = screen.getByText('이나래').closest('li');
    expect(row?.closest('[aria-disabled="true"]')).toBeNull();
  });

  it('스위치를 끄면 초안에 cheerEnabled: false 로 담는다', () => {
    const patch = vi.fn();
    render(<RecordReminderSection draft={draft} patch={patch} />);
    const section = screen.getByText('응원·잔디 표시').closest('div.flex.items-center');
    const sw = section?.querySelector('[role="switch"]');
    expect(sw).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(sw as Element);
    expect(patch).toHaveBeenCalledWith({
      recordReminder: expect.objectContaining({ cheerEnabled: false }),
    });
  });

  it('제외 학생은 반·번호·이름·기간과 함께 늘 펼쳐 보이고, [다시 넣기]는 바로 저장한다', async () => {
    render(<RecordReminderSection draft={draft} patch={vi.fn()} />);
    const row = screen.getByText('이나래').closest('li') as HTMLElement;
    expect(row).toHaveTextContent('2학년 3반');
    expect(row).toHaveTextContent('2번');
    expect(row).toHaveTextContent('10월 6일까지');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '다시 넣기' }));
    });
    expect(removeReminderExclusion).toHaveBeenCalledWith('b');
  });

  it('뺀 학생이 없으면 안내 한 줄', () => {
    useSettingsStore.setState({
      settings: {
        ...useSettingsStore.getState().settings,
        recordReminder: { ...DEFAULT_REMINDER_SETTINGS, exclusions: [] },
      },
    });
    render(<RecordReminderSection draft={draft} patch={vi.fn()} />);
    expect(
      screen.getByText('아직 뺀 학생이 없어요. 반 카드의 칸 메뉴에서 뺄 수 있어요.'),
    ).toBeInTheDocument();
  });

  it("옛 '제외/관심 학생' 칸은 '관심 학생'만 남았다", () => {
    render(<RecordReminderSection draft={draft} patch={vi.fn()} />);
    expect(screen.queryByText('제외/관심 학생')).not.toBeInTheDocument();
    expect(screen.getByText('관심 학생')).toBeInTheDocument();
  });
});
