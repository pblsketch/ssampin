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
import type { StudentRecord } from '@domain/entities/StudentRecord';
import { DashboardStudentRecords } from './DashboardStudentRecords';

const noop = async (): Promise<void> => {};

function setCheer(enabled: boolean) {
  useSettingsStore.setState({
    settings: {
      ...useSettingsStore.getState().settings,
      className: '2학년 3반',
      termStartDates: { '2026-2': '2026-08-18' },
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

describe('작은 카드 — 주 줄 잔디(ADR-137 결정 16)', () => {
  const STRIP = /이번 학기 주마다 기록한 날/;

  function record(id: string, date: string): StudentRecord {
    return {
      id,
      studentId: 'a',
      category: 'life',
      subcategory: '일반',
      content: '내용',
      date,
      createdAt: `${date}T00:10:00.000Z`,
    } as StudentRecord;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 23, 9, 0)); // 수요일
  });
  afterEach(() => vi.useRealTimers());

  it('핀 줄 아래 학기 시작 주부터 이번 주까지 한 줄 — 칸마다 그 주 기록한 날', () => {
    setCheer(true);
    useStudentRecordsStore.setState({
      records: [record('r1', '2026-09-01'), record('r2', '2026-09-02'), record('r3', '2026-09-21')],
    });
    render(<DashboardStudentRecords />);
    const strip = screen.getByRole('img', { name: STRIP });
    expect(strip).toHaveAccessibleName('이번 학기 주마다 기록한 날 — 6주 가운데 2주 기록');
    const titles = [...strip.querySelectorAll('span')].map((c) => c.getAttribute('title'));
    expect(titles).toEqual([
      '8월 17일 주 · 기록 없음',
      '8월 24일 주 · 기록 없음',
      '8월 31일 주 · 2일 기록',
      '9월 7일 주 · 기록 없음',
      '9월 14일 주 · 기록 없음',
      '이번 주 · 1일 기록',
    ]);
    // 단추가 아니다 — 누르면 카드 빈 곳처럼 확장 창이 열린다(WidgetCard 가 거르는 요소 안에 있으면 안 된다)
    expect(
      strip.closest(
        'button, a, input, select, textarea, [role="button"], [data-widget-interactive="true"]',
      ),
    ).toBeNull();
    // 핀 줄 바로 아래
    expect(strip.previousElementSibling).toContainElement(
      screen.getByRole('button', { name: '오늘은 쉴게요' }),
    );
  });

  it('이번 학기 기록이 하나도 없으면 줄이 없다', () => {
    setCheer(true);
    render(<DashboardStudentRecords />);
    expect(screen.queryByRole('img', { name: STRIP })).not.toBeInTheDocument();
  });

  it('응원·잔디를 끄면 줄이 없다', () => {
    setCheer(false);
    useStudentRecordsStore.setState({ records: [record('r1', '2026-09-21')] });
    render(<DashboardStudentRecords />);
    expect(screen.queryByRole('img', { name: STRIP })).not.toBeInTheDocument();
  });
});
