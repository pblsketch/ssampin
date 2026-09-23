// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
/**
 * ADR-137 — 한 주 정리·학기 돌아보기 창: 조각 목록, 빈 주 한 줄, 학기 고르기(지난 학기엔 초안 준비
 * 없음), [초안 쓰러 가기] 이동, [그림으로 저장].
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useObservationStore } from '@adapters/stores/useObservationStore';
import { useLapMarkStore } from '@adapters/stores/useLapMarkStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useObservationPanelStore } from '@adapters/stores/useObservationPanelStore';
import { DEFAULT_REMINDER_SETTINGS } from '@domain/entities/RecordReminder';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import { consumePendingHomeroomTab } from '../../Homeroom/homeroomTabIntent';
import { ObservationRecapModals } from './ObservationRecapModals';

const noop = async (): Promise<void> => {};

function hr(studentId: string, date: string, slots?: string[]): StudentRecord {
  return {
    id: `${studentId}-${date}`,
    studentId,
    category: 'life',
    subcategory: '일반',
    content: '내용',
    date,
    createdAt: `${date}T01:00:00.000Z`,
    ...(slots ? { slots } : {}),
  } as StudentRecord;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 25, 10, 0)); // 2026-09-25(금)
  useSettingsStore.setState({
    loaded: true,
    settings: {
      ...useSettingsStore.getState().settings,
      className: '2학년 3반',
      termStartDates: { '2026-2': '2026-08-18' },
      recordReminder: { ...DEFAULT_REMINDER_SETTINGS },
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
  useStudentRecordsStore.setState({ records: [], loaded: true, load: noop });
  useObservationStore.setState({ records: [], loaded: true, load: noop });
  useLapMarkStore.setState({ marks: [], loaded: true, load: noop });
  useEventsStore.setState({ events: [], loaded: true, load: noop });
});

afterEach(() => {
  useObservationPanelStore.setState({ panel: null });
  cleanup();
  vi.useRealTimers();
});

describe('한 주 정리', () => {
  it('기록한 요일과 만난 학생 수 — 학생 이름·건수는 없다', () => {
    useStudentRecordsStore.setState({ records: [hr('a', '2026-09-22'), hr('b', '2026-09-22')] });
    useObservationPanelStore.setState({ panel: { kind: 'weekly', week: '2026-09-21' } });
    render(<ObservationRecapModals />);
    expect(screen.getByRole('dialog', { name: '한 주 정리' })).toBeInTheDocument();
    expect(screen.getByText('이번 주 만난 학생 2명')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '9월 22일 · 기록 있음' })).toBeInTheDocument();
    expect(screen.queryByText(/김가람|이나래/)).not.toBeInTheDocument();
  });

  it('보여 줄 조각이 없으면 한 줄만', () => {
    useObservationPanelStore.setState({ panel: { kind: 'weekly', week: '2026-09-21' } });
    render(<ObservationRecapModals />);
    expect(screen.getByText('이번 주는 조용했어요')).toBeInTheDocument();
  });

  it('닫기', () => {
    useObservationPanelStore.setState({ panel: { kind: 'weekly', week: '2026-09-21' } });
    render(<ObservationRecapModals />);
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(useObservationPanelStore.getState().panel).toBeNull();
  });
});

describe('학기 돌아보기', () => {
  function open(includeWeek: string | null = null): void {
    useObservationPanelStore.setState({
      panel: { kind: 'retrospect', term: '2026-2', includeWeek },
    });
    render(<ObservationRecapModals />);
  }

  it('학기 잔디·장면·초안 준비 조각과 [그림으로 저장]', () => {
    useStudentRecordsStore.setState({ records: [hr('a', '2026-09-01', ['진로'])] });
    open();
    expect(screen.getByRole('region', { name: '학기 잔디' })).toBeInTheDocument();
    expect(screen.getByText('기록한 주 1주')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '장면' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '초안 준비' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '그림으로 저장' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '이번 주' })).not.toBeInTheDocument();
    // 끝낸 바퀴가 없으면 "0번" 대신 1차 카드와 같은 "한 바퀴까지 N명"
    expect(screen.getByText('한 바퀴까지 1명')).toBeInTheDocument();
    expect(screen.queryByText(/한 바퀴 0번/)).not.toBeInTheDocument();
  });

  it('지난 학기를 고르면 초안 준비 조각이 없다 — 기록이 없던 학기는 한 줄, 그림 저장 없음', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: '지난 학기' }));
    expect(screen.getByRole('button', { name: '지난 학기' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByRole('region', { name: '초안 준비' })).not.toBeInTheDocument();
    expect(screen.getByText('지난 학기는 기록이 없었어요')).toBeInTheDocument();
    expect(screen.queryByText(/기록한 주 0주/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '그림으로 저장' })).not.toBeInTheDocument();
  });

  it('장면을 거의 안 쓰는 반 — 안내 한 줄은 장면 조각에만, 초안 준비엔 숫자·명단 없이 단추만', () => {
    useStudentRecordsStore.setState({ records: [hr('a', '2026-09-01')] });
    open();
    expect(
      screen.getAllByText('장면을 골라 두면 여기서 고르게 쌓였는지 볼 수 있어요'),
    ).toHaveLength(1);
    const draft = screen.getByRole('region', { name: '초안 준비' });
    expect(draft).not.toHaveTextContent(/명 준비/);
    expect(draft).toHaveTextContent('초안 쓰러 가기');
  });

  it('한 주 정리와 겹친 날에는 이번 주 조각이 들어간다', () => {
    useStudentRecordsStore.setState({ records: [hr('a', '2026-09-22')] });
    open('2026-09-21');
    expect(screen.getByRole('region', { name: '이번 주' })).toBeInTheDocument();
  });

  it('[초안 쓰러 가기]는 창을 닫고 담임 기록의 초안으로 간다', () => {
    const navigate = vi.fn();
    window.addEventListener('ssampin:navigate', navigate);
    open();
    fireEvent.click(screen.getByRole('button', { name: '초안 쓰러 가기' }));
    expect(useObservationPanelStore.getState().panel).toBeNull();
    expect(consumePendingHomeroomTab()).toBe('recordDraft');
    expect((navigate.mock.calls[0]?.[0] as CustomEvent<string>).detail).toBe('homeroom');
    window.removeEventListener('ssampin:navigate', navigate);
  });

  it('응원·잔디를 끄면 창을 그리지 않는다', () => {
    useSettingsStore.setState({
      settings: {
        ...useSettingsStore.getState().settings,
        recordReminder: { ...DEFAULT_REMINDER_SETTINGS, cheerEnabled: false },
      },
    });
    open();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
