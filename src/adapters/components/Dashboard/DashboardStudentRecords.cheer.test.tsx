// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
/**
 * ADR-135 — 학생 빠른 기록 카드를 크게 열면 [잔디](기본)·[담임 기록] 두 탭.
 * 응원·잔디를 끄면 예전처럼 담임 기록 화면만 보인다.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('../Homeroom/Records/StudentRecordsEditor', () => ({
  StudentRecordsEditor: () => <div>담임 기록 편집기</div>,
}));

import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useObservationStore } from '@adapters/stores/useObservationStore';
import { useLapMarkStore } from '@adapters/stores/useLapMarkStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { DEFAULT_REMINDER_SETTINGS } from '@domain/entities/RecordReminder';
import { DashboardStudentRecords } from './DashboardStudentRecords';

const noop = async (): Promise<void> => {};

function setCheer(enabled: boolean) {
  useSettingsStore.setState({
    settings: {
      ...useSettingsStore.getState().settings,
      className: '2학년 3반',
      recordReminder: { ...DEFAULT_REMINDER_SETTINGS, cheerEnabled: enabled },
    },
  });
}

beforeEach(() => {
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
  useLapMarkStore.setState({ marks: [], loaded: true, load: noop });
  useEventsStore.setState({ events: [], loaded: true, load: noop });
});

afterEach(cleanup);

describe('크게 연 학생 빠른 기록', () => {
  it('잔디 탭이 먼저 열리고 내 기록·반 카드가 보인다', () => {
    setCheer(true);
    render(<DashboardStudentRecords isCompactMode={false} />);
    expect(screen.getByRole('tab', { name: '잔디' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: '내 기록' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '담임 · 2학년 3반' })).toBeInTheDocument();
    expect(screen.getByText('첫 기록을 남겨 볼까요?')).toBeInTheDocument();
  });

  it('[담임 기록] 탭은 예전 담임 기록 화면 그대로', () => {
    setCheer(true);
    render(<DashboardStudentRecords isCompactMode={false} />);
    fireEvent.click(screen.getByRole('tab', { name: '담임 기록' }));
    expect(screen.getByText('담임 기록 편집기')).toBeInTheDocument();
  });

  it('응원·잔디를 끄면 탭 없이 담임 기록 화면만', () => {
    setCheer(false);
    render(<DashboardStudentRecords isCompactMode={false} />);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByText('담임 기록 편집기')).toBeInTheDocument();
  });

  it('명렬이 하나도 없으면 탭이 없다', () => {
    setCheer(true);
    useStudentStore.setState({ students: [] });
    render(<DashboardStudentRecords isCompactMode={false} />);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });
});
