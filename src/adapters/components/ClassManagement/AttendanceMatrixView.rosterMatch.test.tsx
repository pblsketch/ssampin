// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
/**
 * 수업 관리 출결표(전체 교시 매트릭스) — 번호만 저장된 옛 항목을 누구 것으로 보는가.
 *
 * 출결표는 재적 학생만 행으로 그린다. 그런데 "이 번호가 명단에 한 명뿐인가"까지 그 걸러 낸
 * 목록으로 가르면, 전출 학생과 번호가 같은 재적 학생에게 옛 항목이 붙는다. 이 화면은 저장할 때
 * 하루를 통째로 다시 쓰므로 그 짐작이 그 학생의 학년·반 키로 굳는다(독립 검토 지적, 2026-11).
 * 번호가 유일한지는 **명단 전체**로 가른다 — 실제 화면 → 실제 저장 페이로드로 확인한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { AttendanceRecord, StudentAttendance } from '@domain/entities/Attendance';
import type { TeachingClass } from '@domain/entities/TeachingClass';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { AttendanceMatrixView } from './AttendanceMatrixView';

const CLASS_ID = 'tc-1';
const DATE = '2026-11-02';

/** 여러 학급에서 모인 수업반 — 7번은 재적 한 명 + 전출 한 명, 11번은 한 명뿐이다. */
const CLASS: TeachingClass = {
  id: CLASS_ID,
  name: '수학 A반',
  subject: '수학',
  students: [
    { number: 7, name: '한지후', grade: 2, classNum: 3 },
    { number: 7, name: '전학 간 학생', grade: 2, classNum: 5, status: 'transferred' },
    { number: 11, name: '오다인', grade: 2, classNum: 4 },
  ],
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

/** AI 연결이 학년·반 없이 번호만 적어 둔 옛 기록(3교시) */
const LEGACY: AttendanceRecord = {
  classId: CLASS_ID,
  date: DATE,
  period: 3,
  students: [
    { number: 7, status: 'absent' },
    { number: 11, status: 'late' },
  ],
};

type SaveDay = (
  classId: string,
  date: string,
  byPeriod: ReadonlyMap<number, readonly StudentAttendance[]>,
) => Promise<void>;

let saveDay = vi.fn<SaveDay>();

beforeEach(() => {
  saveDay = vi.fn<SaveDay>().mockResolvedValue(undefined);
  useScheduleStore.setState({ loaded: true });
  useTeachingClassStore.setState({
    classes: [CLASS],
    attendanceRecords: [LEGACY],
    saveDayAttendance: saveDay,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const renderView = () =>
  render(<AttendanceMatrixView classId={CLASS_ID} date={DATE} onDateChange={() => {}} />);

describe('출결표 — 번호만 있는 옛 항목과 전출 학생', () => {
  it('전출 학생과 번호가 같은 재적 학생에게 번호만 있는 옛 항목을 붙이지 않는다(출결표)', () => {
    renderView();

    // 7번은 명단 전체에 둘(재적 한지후 + 전출)이라 누구 것인지 정하지 않는다 → 한지후는 출석
    expect(screen.getByRole('button', { name: '한지후 3교시 출석' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /한지후 3교시 결석/ })).not.toBeInTheDocument();
    // 11번은 명단 전체에 한 명뿐이라 예전처럼 그 학생 칸에 뜬다
    expect(screen.getByRole('button', { name: '오다인 3교시 지각' })).toBeInTheDocument();
    // 전출 학생은 행으로 그리지 않는다
    expect(screen.queryByText('전학 간 학생')).not.toBeInTheDocument();
  });

  it('그 상태로 출결표를 저장해도 옛 항목이 그 학생 기록으로 바뀌지 않는다', async () => {
    renderView();

    // 다른 칸을 하나 고친 뒤 저장한다(하루를 통째로 다시 쓴다)
    fireEvent.click(screen.getByRole('button', { name: '오다인 1교시 출석' }));
    fireEvent.click(screen.getByRole('button', { name: /저장/ }));
    await waitFor(() => expect(saveDay).toHaveBeenCalledTimes(1));

    const [classId, date, byPeriod] = saveDay.mock.calls[0]!;
    expect(classId).toBe(CLASS_ID);
    expect(date).toBe(DATE);
    const all = [...byPeriod.values()].flat();
    // 한지후(2-3-7)의 결석으로 굳지 않았다 — 7번 항목은 어느 교시에도 실리지 않는다
    expect(all.filter((s) => s.number === 7)).toEqual([]);
    // 번호가 유일한 11번의 옛 항목은 명단의 학년·반을 실어 다시 적힌다
    expect(byPeriod.get(3)).toEqual([{ number: 11, status: 'late', grade: 2, classNum: 4 }]);
    expect(byPeriod.get(1)).toEqual([{ number: 11, status: 'absent', grade: 2, classNum: 4 }]);
  });
});
