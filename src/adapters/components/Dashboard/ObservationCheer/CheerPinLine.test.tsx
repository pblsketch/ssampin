// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
/**
 * ADR-137 — 핀 줄의 [쉴게요]/[다시 켜기]와 먼저 거는 말, 핀 줄 아래 '오늘 챙길 학생' 칩 줄.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useObservationStore } from '@adapters/stores/useObservationStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useRecordReminderStore } from '@adapters/stores/useRecordReminderStore';
import { useObservationDayStore, TALK_KEY } from '@adapters/stores/useObservationDayStore';
import { useObservationPanelStore } from '@adapters/stores/useObservationPanelStore';
import { useQuickAddStore } from '@adapters/stores/useQuickAddStore';
import { DEFAULT_REMINDER_SETTINGS, type ReminderSettings } from '@domain/entities/RecordReminder';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import { EMPTY_TALK_STATE, decideTalk } from '@domain/rules/proactiveTalk';
import { emptyTodayStudents } from '@domain/rules/todayStudents';
import { CheerPinLine } from './CheerPinLine';
import { TodayFocusChipRow } from './TodayFocusChipRow';

const noop = async (): Promise<void> => {};
const TODAY = '2026-09-25'; // 금요일

function setReminder(patch: Partial<ReminderSettings> = {}) {
  useSettingsStore.setState({
    loaded: true,
    settings: {
      ...useSettingsStore.getState().settings,
      className: '2학년 3반',
      recordReminder: {
        ...DEFAULT_REMINDER_SETTINGS,
        enabled: true,
        weekdays: [],
        targets: ['homeroom'],
        ...patch,
      },
    },
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 25, 9, 0));
  window.localStorage.clear();
  useObservationDayStore.getState().refresh();
  useObservationPanelStore.setState({ panel: null });
  useStudentStore.setState({
    students: [
      { id: 'a', name: '김가람', studentNumber: 1 },
      { id: 'b', name: '이나래', studentNumber: 2 },
    ],
    loaded: true,
    load: noop,
  });
  useTeachingClassStore.setState({ classes: [], loaded: true, load: noop });
  useStudentRecordsStore.setState({ records: [], loaded: true, load: noop });
  useObservationStore.setState({ records: [], loaded: true, load: noop });
  useEventsStore.setState({ events: [], loaded: true, load: noop });
  useRecordReminderStore.setState({ pausedUntil: null });
  setReminder();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('핀 줄 — 오늘은 쉴게요', () => {
  it('[쉴게요]를 누르면 "오늘은 쉬어요"와 [다시 켜기], 다시 누르면 돌아온다', () => {
    render(<CheerPinLine />);
    fireEvent.click(screen.getByRole('button', { name: '오늘은 쉴게요' }));
    expect(screen.getByText('오늘은 쉬어요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '오늘 쉬기를 풀고 다시 켜기' }));
    expect(screen.queryByText('오늘은 쉬어요')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '오늘은 쉴게요' })).toBeInTheDocument();
  });
});

describe('핀 줄 — 먼저 거는 말', () => {
  function pendWeekly(): void {
    window.localStorage.setItem(
      TALK_KEY,
      JSON.stringify(decideTalk(EMPTY_TALK_STATE, TODAY, [{ kind: 'weekly', key: '2026-09-21' }])),
    );
    useObservationDayStore.getState().refresh();
  }

  it('열어 볼 때까지 남고, 누르면 한 주 정리가 열리며 걷힌다', () => {
    pendWeekly();
    render(<CheerPinLine />);
    fireEvent.click(screen.getByRole('button', { name: '이번 주 정리가 왔어요' }));
    expect(useObservationPanelStore.getState().panel).toEqual({
      kind: 'weekly',
      week: '2026-09-21',
    });
    expect(screen.queryByText('이번 주 정리가 왔어요')).not.toBeInTheDocument();
  });

  it('다음 등교일에 지난주 정리를 알리면 "지난주"라고 말한다', () => {
    window.localStorage.setItem(
      TALK_KEY,
      JSON.stringify(decideTalk(EMPTY_TALK_STATE, TODAY, [{ kind: 'weekly', key: '2026-09-14' }])),
    );
    useObservationDayStore.getState().refresh();
    render(<CheerPinLine />);
    expect(screen.getByRole('button', { name: '지난주 정리가 왔어요' })).toBeInTheDocument();
  });

  it('쉬는 날에는 보이지 않는다', () => {
    pendWeekly();
    render(<CheerPinLine />);
    fireEvent.click(screen.getByRole('button', { name: '오늘은 쉴게요' }));
    expect(screen.queryByText('이번 주 정리가 왔어요')).not.toBeInTheDocument();
    expect(screen.getByText('오늘은 쉬어요')).toBeInTheDocument();
  });
});

describe('오늘 챙길 학생 칩 줄', () => {
  function pickHomeroom(refs: string[]): void {
    useObservationDayStore.getState().updateTodayStudents(() => ({
      ...emptyTodayStudents(TODAY),
      homeroomPicked: true,
      homeroom: refs,
    }));
  }

  it('번호만 적고 이름은 이름표에, 누르면 그 학생으로 바로 쓰기가 열린다', () => {
    pickHomeroom(['b']);
    const open = vi.spyOn(useQuickAddStore.getState(), 'open');
    render(<TodayFocusChipRow />);
    const chip = screen.getByRole('button', { name: '2번 이나래, 오늘 챙길 학생' });
    expect(chip).toHaveTextContent(/^2이나래$/);
    fireEvent.click(chip);
    expect(open).toHaveBeenCalledWith('student-record', {
      direct: { contextKind: 'homeroom', contextId: 'homeroom', studentRef: 'b' },
    });
    open.mockRestore();
  });

  it('수업반 칩은 짧은 반 이름·번호, 이름표와 스크린리더에는 전체 반 이름', () => {
    setReminder({ targets: ['homeroom', 'subject'] });
    useTeachingClassStore.setState({
      classes: [
        {
          id: 'c1',
          name: '3학년 2반',
          subject: '통합과학',
          students: [{ number: 4, name: '최민준' }],
          createdAt: '2026-03-02T00:00:00.000Z',
          updatedAt: '2026-03-02T00:00:00.000Z',
        },
      ],
    });
    useObservationDayStore.getState().updateTodayStudents(() => ({
      ...emptyTodayStudents(TODAY),
      homeroomPicked: true,
      subject: [{ classId: 'c1', ref: '4' }],
      judgedClassIds: ['c1'],
    }));
    render(<TodayFocusChipRow />);
    const chip = screen.getByRole('button', {
      name: '3학년 2반 통합과학 4번 최민준, 오늘 챙길 학생',
    });
    expect(chip).toHaveTextContent(/^3-2반·4/);
    expect(screen.getByRole('tooltip')).toHaveTextContent('3학년 2반 통합과학 · 최민준');
  });

  it("이름 표시 '표시 안 함'이면 이름표도 없다", () => {
    setReminder({ nameExposure: 'none' });
    pickHomeroom(['b']);
    render(<TodayFocusChipRow />);
    expect(screen.getByRole('button', { name: '2번 학생, 오늘 챙길 학생' })).toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('오늘 기록이 생기면 ✓ 만 붙인다', () => {
    pickHomeroom(['b']);
    useStudentRecordsStore.setState({
      records: [
        {
          id: 'r1',
          studentId: 'b',
          category: 'life',
          subcategory: '일반',
          content: '내용',
          date: TODAY,
          createdAt: `${TODAY}T00:10:00.000Z`,
        } as StudentRecord,
      ],
    });
    render(<TodayFocusChipRow />);
    expect(
      screen.getByRole('button', { name: '2번 이나래, 오늘 챙길 학생 · 오늘 기록 완료' }),
    ).toBeInTheDocument();
  });

  it('알림 요일이 아니거나 쉬는 날·알림 꺼짐이면 줄이 없다', () => {
    pickHomeroom(['b']);
    setReminder({ weekdays: [1] }); // 월요일만
    const { unmount } = render(<TodayFocusChipRow />);
    expect(screen.queryByText('오늘 챙길 학생')).not.toBeInTheDocument();
    unmount();

    setReminder({ enabled: false });
    const second = render(<TodayFocusChipRow />);
    expect(screen.queryByText('오늘 챙길 학생')).not.toBeInTheDocument();
    second.unmount();

    setReminder();
    useObservationDayStore.getState().restToday(TODAY);
    render(<TodayFocusChipRow />);
    expect(screen.queryByText('오늘 챙길 학생')).not.toBeInTheDocument();
  });
});
