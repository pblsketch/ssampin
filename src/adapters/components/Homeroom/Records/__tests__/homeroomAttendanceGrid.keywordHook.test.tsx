// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
/**
 * HomeroomAttendanceGrid 예외 편집 알림(onExceptionEdited, M2) 훅 지점 검증.
 *
 * 계획서 M2 확정: 훅은 편집 원본 3곳(handleCellClick 비-지우개·applyText·handleMemoEdit)에만
 * 걸고, 공유 commitEdit(undo/redo/clearToday/clearStudentDay 경유)에는 걸지 않는다 —
 * 되돌리기·지우기에 키워드 경고가 뜨는 오작동 차단이 이 테스트의 존재 이유다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { AttendanceRecord } from '@domain/entities/Attendance';
import { HomeroomAttendanceGrid } from '../HomeroomAttendanceGrid';

const CLASS_ID = '2-3';
const DATE0 = '2026-07-13';
const STUDENTS = [
  { number: 1, name: '홍길동' },
  { number: 2, name: '김영희' },
];
const PERIODS = [0, 1, 2, 3, 4, 5, 6, 7, 9];

function renderGrid(onExceptionEdited: (n: number, t: string) => void) {
  const records: AttendanceRecord[] = [];
  return render(
    <HomeroomAttendanceGrid
      students={STUDENTS}
      classId={CLASS_ID}
      date={DATE0}
      loadDayRecords={() => records}
      onSaveDay={async () => {}}
      periods={PERIODS}
      onExceptionEdited={onExceptionEdited}
    />,
  );
}

function clickCell(name: string, period: string) {
  fireEvent.click(screen.getByRole('button', { name: `${name} ${period} 출석` }));
}

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('HomeroomAttendanceGrid onExceptionEdited 훅 지점 (M2)', () => {
  it('팔레트 칸 클릭(비-지우개)은 (번호, 사유 텍스트)로 1회 발화한다', () => {
    const spy = vi.fn();
    renderGrid(spy);
    clickCell('홍길동', '1교시');
    expect(spy).toHaveBeenCalledTimes(1);
    // 기본 팔레트 = 결석·질병, 비고 없음 → 텍스트는 사유만
    expect(spy).toHaveBeenCalledWith(1, '질병');
  });

  it('undo(Ctrl+Z)·redo(Ctrl+Shift+Z)는 발화하지 않는다', () => {
    const spy = vi.fn();
    renderGrid(spy);
    clickCell('홍길동', '1교시');
    expect(spy).toHaveBeenCalledTimes(1);

    act(() => {
      fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    });
    expect(spy).toHaveBeenCalledTimes(1); // undo 무발화

    act(() => {
      fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
    });
    expect(spy).toHaveBeenCalledTimes(1); // redo 무발화
  });

  it('지우개 모드 칸 클릭·이름 클릭(하루 지우기)은 발화하지 않는다', () => {
    const spy = vi.fn();
    renderGrid(spy);
    clickCell('홍길동', '1교시');
    expect(spy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /지우개/ }));
    // 지우개 분기 — 무발화 (미사용 셀: 편집된 셀은 라벨이 '출석'이 아니게 됨)
    clickCell('김영희', '2교시');
    expect(spy).toHaveBeenCalledTimes(1);

    // 지우개 모드 이름 클릭 = clearStudentDay — 무발화 (요소 부재 시 조용히 통과하지 않게 단언)
    const nameEl = screen.getAllByTitle(/지우개: 클릭하면/)[0];
    expect(nameEl).toBeDefined();
    fireEvent.click(nameEl!);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('prop 미전달이어도 편집이 정상 동작한다 (옵셔널 훅)', () => {
    const records: AttendanceRecord[] = [];
    render(
      <HomeroomAttendanceGrid
        students={STUDENTS}
        classId={CLASS_ID}
        date={DATE0}
        loadDayRecords={() => records}
        onSaveDay={async () => {}}
        periods={PERIODS}
      />,
    );
    expect(() => clickCell('김영희', '2교시')).not.toThrow();
  });
});
