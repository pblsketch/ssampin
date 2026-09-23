// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
/**
 * ADR-137 — 설정의 '관심 학생' 목록: 지금 저장된 값을 읽고, [풀기]는 누르는 즉시 저장한다.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { DEFAULT_REMINDER_SETTINGS } from '@domain/entities/RecordReminder';
import { FocusStudentListSection } from './FocusStudentListSection';

const noop = async (): Promise<void> => {};
const setReminderFocus = vi.fn(async () => {});

beforeEach(() => {
  setReminderFocus.mockClear();
  useStudentStore.setState({
    students: [{ id: 'a', name: '김가람', studentNumber: 1 }],
    loaded: true,
    load: noop,
  });
  useTeachingClassStore.setState({ classes: [], loaded: true, load: noop });
  useSettingsStore.setState({
    setReminderFocus,
    settings: {
      ...useSettingsStore.getState().settings,
      className: '2학년 1반',
      recordReminder: { ...DEFAULT_REMINDER_SETTINGS, focusedStudentIds: ['a', 'gone'] },
    },
  });
});

afterEach(cleanup);

describe('관심 학생 목록', () => {
  it('지정한 학생과 명렬에서 찾지 못한 학생을 보여 주고, [풀기]는 바로 저장한다', async () => {
    render(<FocusStudentListSection />);
    expect(screen.getByText('김가람')).toBeInTheDocument();
    expect(screen.getByText('명렬에서 찾지 못한 학생')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '1번 관심 학생 풀기' }));
    });
    expect(setReminderFocus).toHaveBeenCalledWith('a', false);
  });

  it('보관한 반의 관심 학생도 명렬에서 찾지 못한 학생으로 보이고 풀 수 있다', async () => {
    useTeachingClassStore.setState({
      classes: [
        {
          id: 'old',
          name: '1-2',
          subject: '국어',
          students: [{ number: 3, name: '박다온' }],
          archived: true,
          createdAt: '2026-03-02T00:00:00.000Z',
          updatedAt: '2026-03-02T00:00:00.000Z',
        },
      ],
    });
    useSettingsStore.setState({
      settings: {
        ...useSettingsStore.getState().settings,
        recordReminder: { ...DEFAULT_REMINDER_SETTINGS, focusedStudentIds: ['subject:old:3'] },
      },
    });
    render(<FocusStudentListSection />);
    expect(screen.getByText('명렬에서 찾지 못한 학생')).toBeInTheDocument();
    expect(screen.queryByText('박다온')).not.toBeInTheDocument();
  });

  it('없으면 안내 문구', () => {
    useSettingsStore.setState({
      settings: {
        ...useSettingsStore.getState().settings,
        recordReminder: { ...DEFAULT_REMINDER_SETTINGS, focusedStudentIds: [] },
      },
    });
    render(<FocusStudentListSection />);
    expect(screen.getByText(/아직 지정한 학생이 없어요/)).toBeInTheDocument();
  });
});
