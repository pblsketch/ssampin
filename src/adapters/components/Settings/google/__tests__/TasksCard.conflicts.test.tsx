/**
 * @vitest-environment jsdom
 *
 * Google Tasks 카드의 "최근 충돌 기록" 영역.
 *
 * - 기록이 없으면 영역 자체를 그리지 않는다.
 * - 기록이 있으면 제목·종류 문구가 보이고, 펼치면 구글에 있던 내용이 보인다.
 * - "기록 지우기"는 스토어의 clearConflicts 를 부른다.
 */
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { TasksCard } from '../TasksCard';
import { useTasksSyncStore } from '@adapters/stores/useTasksSyncStore';
import type { TasksSyncConflict } from '@domain/entities/TasksSyncConflict';

const editEdit: TasksSyncConflict = {
  id: 'c1',
  kind: 'edit-edit',
  todoId: 't1',
  googleTaskId: 'g1',
  detectedAt: '2026-10-14T01:00:00.000Z',
  local: { text: '학급 문집 원고 걷기', completed: false },
  remote: {
    text: '학급 문집 원고 걷기 (금요일까지)',
    notes: '반장에게 부탁',
    dueDate: '2026-10-16',
    completed: true,
  },
};

const remoteGone: TasksSyncConflict = {
  id: 'c2',
  kind: 'remote-deleted',
  todoId: 't2',
  googleTaskId: 'g2',
  detectedAt: '2026-10-13T01:00:00.000Z',
  local: { text: '체험학습 신청서', completed: false },
};

const localDeleted: TasksSyncConflict = {
  id: 'c3',
  kind: 'local-deleted',
  todoId: 't3',
  googleTaskId: 'g3',
  detectedAt: '2026-10-12T01:00:00.000Z',
  local: { text: '상담 일정 정리', completed: false },
  remote: { text: '상담 일정 정리', completed: false },
};

let clearConflicts: Mock<() => Promise<void>>;

beforeEach(() => {
  clearConflicts = vi.fn<() => Promise<void>>(async () => {});
  useTasksSyncStore.setState({
    isEnabled: true,
    taskListName: '내 할 일',
    conflicts: [],
    clearConflicts,
  });
});

afterEach(() => {
  cleanup();
});

describe('TasksCard — 최근 충돌 기록', () => {
  it('기록이 없으면 영역 전체를 그리지 않는다', () => {
    render(<TasksCard onJumpToBackup={() => {}} />);
    expect(screen.queryByText('최근 충돌 기록')).toBeNull();
    expect(screen.queryByText('기록 지우기')).toBeNull();
    // 기존 카드 동작은 그대로다
    expect(screen.getByText('지금 연동 실행')).toBeTruthy();
  });

  it('기록이 있으면 제목과 종류별 한국어 문구가 보인다', () => {
    useTasksSyncStore.setState({ conflicts: [editEdit, remoteGone, localDeleted] });
    render(<TasksCard onJumpToBackup={() => {}} />);

    expect(screen.getByText('최근 충돌 기록')).toBeTruthy();
    expect(screen.getByText('학급 문집 원고 걷기')).toBeTruthy();
    expect(screen.getByText('구글과 쌤핀에서 둘 다 고쳤어요 · 쌤핀 내용을 남겼어요')).toBeTruthy();
    expect(
      screen.getByText('구글에서 지웠지만 쌤핀에서 고쳐서 구글에 다시 만들었어요'),
    ).toBeTruthy();
    expect(
      screen.getByText(
        '쌤핀에서 지우거나 보관해서 구글에서도 지웠어요 · 구글에서 고친 내용은 아래에 남겨요',
      ),
    ).toBeTruthy();
  });

  it('펼치면 구글에 있던 내용이 보이고, 접으면 사라진다', () => {
    useTasksSyncStore.setState({ conflicts: [editEdit] });
    render(<TasksCard onJumpToBackup={() => {}} />);

    const toggle = screen.getByRole('button', { name: /학급 문집 원고 걷기/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('구글에 있던 내용')).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('구글에 있던 내용')).toBeTruthy();
    expect(screen.getByText('학급 문집 원고 걷기 (금요일까지)')).toBeTruthy();
    expect(screen.getByText('반장에게 부탁')).toBeTruthy();
    expect(screen.getByText('2026년 10월 16일')).toBeTruthy();
    expect(screen.getByText('완료')).toBeTruthy();

    fireEvent.click(toggle);
    expect(screen.queryByText('구글에 있던 내용')).toBeNull();
  });

  it('구글에 항목 자체가 없었으면 그렇게만 알려 준다', () => {
    useTasksSyncStore.setState({ conflicts: [remoteGone] });
    render(<TasksCard onJumpToBackup={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /체험학습 신청서/ }));
    expect(screen.getByText('구글에서 이미 지워진 항목이에요')).toBeTruthy();
  });

  it('"기록 지우기"를 누르면 clearConflicts 를 부른다', () => {
    useTasksSyncStore.setState({ conflicts: [editEdit] });
    render(<TasksCard onJumpToBackup={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: '기록 지우기' }));
    expect(clearConflicts).toHaveBeenCalledTimes(1);
  });
});
