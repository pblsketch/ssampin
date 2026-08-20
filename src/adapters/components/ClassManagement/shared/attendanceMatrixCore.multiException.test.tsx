// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
/**
 * 수업 관리 출결(전체 교시 매트릭스) — 하루 안 복합 예외 회귀 그물 (ADR-059).
 *
 * 담임 그리드는 '전-행 재작성' 탓에 한 종류만 남았지만(→ 수정), 이쪽은 원래 칸 단위
 * 순환이라 여러 교시가 공존한다. 같은 회귀가 이 화면에 옮겨붙지 않도록 실제 클릭 →
 * 저장 페이로드(saveDay)까지 확인해 못을 박는다.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { AttendanceRecord, StudentAttendance } from '@domain/entities/Attendance';
import { AttendanceMatrixCore } from './AttendanceMatrixCore';

const CLASS_ID = 'cls-1';
const DATE = '2026-08-20';
const STUDENTS = [
  { number: 1, name: '홍길동' },
  { number: 2, name: '김영희' },
];
const PERIODS = [1, 2, 3, 4, 5, 6, 7];

/** present → absent → late → earlyLeave → classAbsence (4회 클릭 = 결과) */
function cycleTo(name: string, periodLabel: string, times: number) {
  const labels = ['출석', '결석', '지각', '조퇴', '결과'];
  for (let i = 0; i < times; i++) {
    fireEvent.click(screen.getByRole('button', { name: `${name} ${periodLabel} ${labels[i]}` }));
  }
}

type SaveDay = (
  date: string,
  byPeriod: ReadonlyMap<number, readonly StudentAttendance[]>,
) => Promise<void>;

const makeSaveDay = () => vi.fn<SaveDay>().mockResolvedValue(undefined);

function statusesOf(
  saveDay: ReturnType<typeof makeSaveDay>,
  studentNumber: number,
): Record<number, string> {
  const calls = saveDay.mock.calls;
  const byPeriod = calls[calls.length - 1]![1];
  const out: Record<number, string> = {};
  for (const [p, list] of byPeriod) {
    const hit = list.find((s) => s.number === studentNumber);
    if (hit) out[p] = hit.status;
  }
  return out;
}

function renderCore(saveDay: ReturnType<typeof makeSaveDay>) {
  const records: AttendanceRecord[] = [];
  render(
    <AttendanceMatrixCore
      students={STUDENTS}
      classId={CLASS_ID}
      date={DATE}
      onDateChange={() => {}}
      loadDayRecords={() => records}
      saveDay={saveDay}
      periods={PERIODS}
    />,
  );
}

const save = () => fireEvent.click(screen.getByRole('button', { name: /저장/ }));

describe('수업 관리 전체 교시 매트릭스 — 하루 안 복합 예외 (ADR-059)', () => {
  afterEach(cleanup);

  it('3·4·5교시 결과가 모두 저장된다', async () => {
    const saveDay = makeSaveDay();
    renderCore(saveDay);

    cycleTo('홍길동', '3교시', 4);
    cycleTo('홍길동', '4교시', 4);
    cycleTo('홍길동', '5교시', 4);
    save();

    expect(statusesOf(saveDay, 1)).toEqual({
      3: 'classAbsence',
      4: 'classAbsence',
      5: 'classAbsence',
    });
  });

  it('1교시 지각 + 3교시 결과 + 6교시 조퇴가 한 날에 공존한다', async () => {
    const saveDay = makeSaveDay();
    renderCore(saveDay);

    cycleTo('홍길동', '1교시', 2); // 결석 → 지각
    cycleTo('홍길동', '3교시', 4); // → 결과
    cycleTo('홍길동', '6교시', 3); // → 조퇴
    save();

    expect(statusesOf(saveDay, 1)).toEqual({
      1: 'late',
      3: 'classAbsence',
      6: 'earlyLeave',
    });
  });
});
