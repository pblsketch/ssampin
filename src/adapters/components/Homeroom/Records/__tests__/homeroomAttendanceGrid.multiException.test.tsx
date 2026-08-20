// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
/**
 * 하루에 여러 예외가 공존하는지 실증하는 런타임 회귀 테스트 (ADR-059).
 *
 * 회귀 원본: 팔레트 칸 클릭이 그 학생의 하루를 통째로 다시 쓰던(§3.10-5 '전-행 재작성')
 * 탓에, 3·4·5교시에 결과를 찍어도 **마지막 한 칸만 남았다**. "1교시 지각 → 3교시 결과 →
 * 6교시 조퇴" 같은 복합 입력도 원리적으로 불가능했다.
 *
 * 메타 테스트로 대체 불가 — 실제 클릭 → 자동 저장 페이로드(onSaveDay)까지 확인해
 * "화면에만 보이고 저장은 안 되는" 경우를 배제한다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useCallback, useState } from 'react';
import type { AttendanceRecord, StudentAttendance } from '@domain/entities/Attendance';
import { HomeroomAttendanceGrid } from '../HomeroomAttendanceGrid';

const CLASS_ID = '2-3';
const DATE = '2026-08-20';
const STUDENTS = [
  { number: 1, name: '홍길동' },
  { number: 2, name: '김영희' },
];
/** 조회 · 1~7교시 · 종례 (maxPeriods 7 기준) */
const PERIODS = [0, 1, 2, 3, 4, 5, 6, 7, 9];

function TestHost({
  onSave,
}: {
  onSave: (date: string, byPeriod: ReadonlyMap<number, readonly StudentAttendance[]>) => void;
}) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const loadDayRecords = useCallback((d: string) => records.filter((r) => r.date === d), [records]);
  const onSaveDay = useCallback(
    async (d: string, byPeriod: ReadonlyMap<number, readonly StudentAttendance[]>) => {
      onSave(d, byPeriod);
      const next: AttendanceRecord[] = [];
      for (const [p, sts] of byPeriod) {
        if (sts.length > 0)
          next.push({ classId: CLASS_ID, date: d, period: p, students: [...sts] });
      }
      setRecords((prev) => [...prev.filter((r) => r.date !== d), ...next]);
    },
    [onSave],
  );
  return (
    <HomeroomAttendanceGrid
      students={STUDENTS}
      classId={CLASS_ID}
      date={DATE}
      loadDayRecords={loadDayRecords}
      onSaveDay={onSaveDay}
      periods={PERIODS}
    />
  );
}

/** 팔레트 종류 고르기 */
const pickType = (label: string) =>
  fireEvent.click(screen.getByRole('button', { name: `${label} 팔레트` }));

/** 칸 클릭 — 현재 표시 상태(statusLabel)로 칸을 특정한다 */
const clickCell = (name: string, periodLabel: string, statusLabel: string) =>
  fireEvent.click(screen.getByRole('button', { name: `${name} ${periodLabel} ${statusLabel}` }));

/** 자동 저장(800ms 디바운스) 플러시 */
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(900);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

/** 마지막 저장 페이로드에서 (교시 → 그 학생 상태) 로 정리 */
function statusesOf(
  onSave: ReturnType<typeof vi.fn>,
  studentNumber: number,
): Record<number, string> {
  const calls = onSave.mock.calls;
  const byPeriod = calls[calls.length - 1]![1] as ReadonlyMap<number, readonly StudentAttendance[]>;
  const out: Record<number, string> = {};
  for (const [p, list] of byPeriod) {
    const hit = list.find((s) => s.number === studentNumber);
    if (hit) out[p] = hit.status;
  }
  return out;
}

describe('담임 출결 그리드 — 하루 안 복합 예외 (ADR-059)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    cleanup();
  });

  it('결과를 3·4·5교시에 각각 찍으면 세 칸이 모두 남는다 (회귀: 마지막 한 칸만 남던 버그)', async () => {
    const onSave = vi.fn();
    render(<TestHost onSave={onSave} />);

    pickType('결과');
    clickCell('홍길동', '3교시', '출석');
    clickCell('홍길동', '4교시', '출석');
    clickCell('홍길동', '5교시', '출석');
    await flush();

    expect(statusesOf(onSave, 1)).toEqual({
      3: 'classAbsence',
      4: 'classAbsence',
      5: 'classAbsence',
    });
  });

  it('1교시 지각 + 3교시 결과 + 6교시 조퇴가 한 날에 공존한다', async () => {
    const onSave = vi.fn();
    render(<TestHost onSave={onSave} />);

    pickType('지각');
    clickCell('홍길동', '1교시', '출석'); // → 조회·1교시 지각
    pickType('결과');
    clickCell('홍길동', '3교시', '출석'); // → 3교시 결과
    pickType('조퇴');
    clickCell('홍길동', '6교시', '출석'); // → 6·7교시·종례 조퇴
    await flush();

    expect(statusesOf(onSave, 1)).toEqual({
      0: 'late', // 조회
      1: 'late',
      3: 'classAbsence',
      6: 'earlyLeave',
      7: 'earlyLeave',
      9: 'earlyLeave', // 종례
    });
  });

  it('결석은 여전히 하루 전체를 덮는다 (덧쓰기여도 조회~종례 전 교시를 채우므로)', async () => {
    const onSave = vi.fn();
    render(<TestHost onSave={onSave} />);

    pickType('결과');
    clickCell('홍길동', '3교시', '출석');
    pickType('결석');
    clickCell('홍길동', '1교시', '출석');
    await flush();

    const s = statusesOf(onSave, 1);
    expect(
      Object.keys(s)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual(PERIODS);
    expect(Object.values(s).every((v) => v === 'absent')).toBe(true);
  });

  it('지우개로 한 칸만 지워도 나머지 예외는 남는다 (정정 동선)', async () => {
    const onSave = vi.fn();
    render(<TestHost onSave={onSave} />);

    pickType('결과');
    clickCell('홍길동', '3교시', '출석');
    clickCell('홍길동', '4교시', '출석');
    pickType('지우개');
    clickCell('홍길동', '4교시', '결과 (질병)');
    await flush();

    expect(statusesOf(onSave, 1)).toEqual({ 3: 'classAbsence' });
  });

  it('다른 학생의 기록은 서로 영향을 주지 않는다', async () => {
    const onSave = vi.fn();
    render(<TestHost onSave={onSave} />);

    pickType('결과');
    clickCell('홍길동', '2교시', '출석');
    clickCell('김영희', '5교시', '출석');
    await flush();

    expect(statusesOf(onSave, 1)).toEqual({ 2: 'classAbsence' });
    expect(statusesOf(onSave, 2)).toEqual({ 5: 'classAbsence' });
  });
});
