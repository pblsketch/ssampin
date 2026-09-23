// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
/**
 * ADR-137 — 통계 화면의 반 흐름: 학생 × 이번 학기 주, 있음/없음만(건수 없음), 이름은 읽는 이름에만.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useObservationStore } from '@adapters/stores/useObservationStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { DEFAULT_REMINDER_SETTINGS } from '@domain/entities/RecordReminder';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { TeachingClass } from '@domain/entities/TeachingClass';
import { TermFlowSection } from './TermFlowSection';

const noop = async (): Promise<void> => {};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 9, 10, 0)); // 2026-09-09(수)
  useSettingsStore.setState({
    loaded: true,
    settings: {
      ...useSettingsStore.getState().settings,
      termStartDates: { '2026-2': '2026-08-31', '2027-1': '2026-09-21' },
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
  useStudentRecordsStore.setState({
    records: [
      {
        id: 'r1',
        studentId: 'a',
        category: 'life',
        subcategory: '일반',
        content: '내용',
        date: '2026-09-01',
        createdAt: '2026-09-01T01:00:00.000Z',
      } as StudentRecord,
      {
        id: 'r2',
        studentId: 'b',
        category: 'attendance',
        subcategory: '결석',
        content: '',
        date: '2026-09-02',
        createdAt: '2026-09-02T01:00:00.000Z',
      } as StudentRecord,
    ],
    loaded: true,
    load: noop,
  });
  useObservationStore.setState({ records: [], loaded: true, load: noop });
  useEventsStore.setState({ events: [], loaded: true, load: noop });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('반 흐름', () => {
  it('담임반 — 학생마다 주 칸, 출결은 세지 않고 아직 오지 않은 주는 따로', () => {
    render(<TermFlowSection kind="homeroom" />);
    expect(screen.getByRole('region', { name: '반 흐름' })).toBeInTheDocument();
    expect(screen.getByText('이번 학기 기준')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: '1번 김가람 · 8월 31일~9월 6일 · 기록 있음' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: '2번 이나래 · 8월 31일~9월 6일 · 기록 없음' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: '1번 김가람 · 9월 14일~9월 20일 · 아직' }),
    ).toBeInTheDocument();
    // 줄 머리(번호)에 키보드 초점이 가고, 초점·마우스에서 이름표가 뜬다
    const rowHead = screen.getByLabelText('1번 김가람');
    expect(rowHead).toHaveAttribute('tabindex', '0');
    expect(rowHead.querySelector('[role="tooltip"]')).toHaveTextContent('김가람');
  });

  it("이름 표시 '표시 안 함'이면 번호만", () => {
    useSettingsStore.setState({
      settings: {
        ...useSettingsStore.getState().settings,
        recordReminder: { ...DEFAULT_REMINDER_SETTINGS, nameExposure: 'none' },
      },
    });
    render(<TermFlowSection kind="homeroom" />);
    expect(
      screen.getByRole('img', { name: '1번 학생 · 8월 31일~9월 6일 · 기록 있음' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/김가람/)).not.toBeInTheDocument();
  });

  it('수업반은 그 반 명렬과 기록으로', () => {
    useTeachingClassStore.setState({
      classes: [
        {
          id: 'c1',
          name: '2-3',
          subject: '국어',
          students: [{ number: 7, name: '박다온' }],
          createdAt: '2026-03-02T00:00:00.000Z',
          updatedAt: '2026-03-02T00:00:00.000Z',
        } as TeachingClass,
      ],
    });
    render(<TermFlowSection kind="teaching" classId="c1" />);
    expect(
      screen.getByRole('img', { name: '7번 박다온 · 8월 31일~9월 6일 · 기록 없음' }),
    ).toBeInTheDocument();
  });

  it('응원·잔디를 끄면 없다', () => {
    useSettingsStore.setState({
      settings: {
        ...useSettingsStore.getState().settings,
        recordReminder: { ...DEFAULT_REMINDER_SETTINGS, cheerEnabled: false },
      },
    });
    render(<TermFlowSection kind="homeroom" />);
    expect(screen.queryByRole('region', { name: '반 흐름' })).not.toBeInTheDocument();
  });
});
