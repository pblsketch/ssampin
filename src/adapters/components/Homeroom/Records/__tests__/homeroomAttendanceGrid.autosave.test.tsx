// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
/**
 * HomeroomAttendanceGrid 자동 저장 런타임 회귀 테스트 (attendance-grid-v2 §3.10-2).
 *
 * 메타 테스트로 대체 불가 — 실제 fake timer + 컴포넌트 렌더로 4종을 실증한다:
 *  ① 저장 플러시 직후 연속 편집 무손실 (dirty-gate + 자기 저장 서명)
 *  ② 플러시 3종 발화 (날짜 이동 · 언마운트 · window blur)
 *  ③ undo → 자동 저장 → 재시드 억제 일관성
 *  ④ 외부(비-dirty) 변경은 정상 재시드 / dirty 중 외부 변경은 무시(dirty-gate)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useCallback, useRef, useState } from 'react';
import type {
  AttendanceRecord,
  StudentAttendance,
  AttendanceStatus,
} from '@domain/entities/Attendance';
import { HomeroomAttendanceGrid } from '../HomeroomAttendanceGrid';

const CLASS_ID = '2-3';
const DATE0 = '2026-07-10';
const STUDENTS = [
  { number: 1, name: '홍길동' },
  { number: 2, name: '김영희' },
  { number: 3, name: '이철수' },
];
const PERIODS = [0, 1, 2, 3, 4, 5, 6, 7, 9];

function rec(date: string, period: number, students: StudentAttendance[]): AttendanceRecord {
  return { classId: CLASS_ID, date, period, students };
}

interface Controller {
  setDate: (d: string) => void;
  injectExternal: (records: AttendanceRecord[]) => void;
}

/**
 * 실제 AttendanceMode 배선을 모사: onSaveDay 가 store(records)를 갱신하고,
 * loadDayRecords 는 records 에 의존하는 useCallback 이라 저장마다 identity 가 바뀐다
 * (attendanceRecordsAll 스냅샷 의존과 동형) → 외부 변경 재시드 effect 를 트리거.
 */
function TestHost({
  ctl,
  onSave,
  initialRecords = [],
}: {
  ctl: { current: Controller | null };
  onSave: (date: string, byPeriod: ReadonlyMap<number, readonly StudentAttendance[]>) => void;
  initialRecords?: AttendanceRecord[];
}) {
  const [records, setRecords] = useState<AttendanceRecord[]>(initialRecords);
  const [date, setDate] = useState(DATE0);

  const loadDayRecords = useCallback((d: string) => records.filter((r) => r.date === d), [records]);

  const onSaveDay = useCallback(
    async (d: string, byPeriod: ReadonlyMap<number, readonly StudentAttendance[]>) => {
      onSave(d, byPeriod);
      const next: AttendanceRecord[] = [];
      for (const [p, sts] of byPeriod) {
        if (sts.length > 0) next.push(rec(d, p, [...sts]));
      }
      setRecords((prev) => [...prev.filter((r) => r.date !== d), ...next]);
    },
    [onSave],
  );

  const ctlRef = useRef<Controller>({
    setDate,
    injectExternal: setRecords,
  });
  ctlRef.current.setDate = setDate;
  ctlRef.current.injectExternal = setRecords;
  ctl.current = ctlRef.current;

  return (
    <HomeroomAttendanceGrid
      students={STUDENTS}
      classId={CLASS_ID}
      date={date}
      loadDayRecords={loadDayRecords}
      onSaveDay={onSaveDay}
      periods={PERIODS}
    />
  );
}

/** 셀 클릭 = 기본 팔레트(결석·질병) 적용 → 그 학생 전 교시 결석 */
function clickCell(name: string, period: string) {
  fireEvent.click(screen.getByRole('button', { name: `${name} ${period} 출석` }));
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  // 비동기 저장(onSaveDay await→setState)이 병렬 부하에서도 완전히 정착하도록 마이크로태스크 한 번 더 플러시.
  await act(async () => {
    await Promise.resolve();
  });
}

describe('HomeroomAttendanceGrid 자동 저장 런타임 회귀 (§3.10-2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    cleanup();
  });

  it('① 저장 플러시 직후 연속 편집 무손실 (dirty-gate + 서명)', async () => {
    const onSave = vi.fn();
    const ctl: { current: Controller | null } = { current: null };
    render(<TestHost ctl={ctl} onSave={onSave} />);

    // 편집 A: 홍길동 결석
    clickCell('홍길동', '조회');
    expect(screen.getByRole('button', { name: /홍길동 조회 결석/ })).toBeInTheDocument();

    // 800ms → 자동 저장(save1). 저장의 store 반영이 외부 신호가 되지만 서명 일치로 재시드 억제.
    await advance(800);
    expect(onSave).toHaveBeenCalledTimes(1);
    // 저장 후에도 홍길동 결석이 유지되어야 한다(자기 저장 재시드가 되돌리지 않음)
    expect(screen.getByRole('button', { name: /홍길동 조회 결석/ })).toBeInTheDocument();

    // 편집 B: 김영희 결석 (저장 직후 연속 편집)
    clickCell('김영희', '조회');
    // 두 편집 모두 살아있어야 한다
    expect(screen.getByRole('button', { name: /홍길동 조회 결석/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /김영희 조회 결석/ })).toBeInTheDocument();

    // 800ms → save2 는 홍길동+김영희 둘 다 포함
    await advance(800);
    expect(onSave).toHaveBeenCalledTimes(2);
    const [, byPeriod] = onSave.mock.calls[1] as [
      string,
      ReadonlyMap<number, readonly StudentAttendance[]>,
    ];
    const p0 = byPeriod.get(0) ?? [];
    expect(p0.some((s) => s.number === 1 && s.status === 'absent')).toBe(true);
    expect(p0.some((s) => s.number === 2 && s.status === 'absent')).toBe(true);
  });

  it('② 플러시 3종 — 날짜 이동 시 떠나는 날짜로 저장', async () => {
    const onSave = vi.fn();
    const ctl: { current: Controller | null } = { current: null };
    render(<TestHost ctl={ctl} onSave={onSave} />);

    clickCell('홍길동', '조회'); // dirty (아직 디바운스 전)
    expect(onSave).not.toHaveBeenCalled();

    // 날짜 이동 → 대기 저장 플러시
    await act(async () => {
      ctl.current!.setDate('2026-07-11');
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![0]).toBe(DATE0); // 떠나는(옛) 날짜로 저장
  });

  it('② 플러시 3종 — 언마운트 시 저장', async () => {
    const onSave = vi.fn();
    const ctl: { current: Controller | null } = { current: null };
    const { unmount } = render(<TestHost ctl={ctl} onSave={onSave} />);

    clickCell('홍길동', '조회');
    await act(async () => {
      unmount();
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![0]).toBe(DATE0);
  });

  it('② 플러시 3종 — window blur 시 저장', async () => {
    const onSave = vi.fn();
    const ctl: { current: Controller | null } = { current: null };
    render(<TestHost ctl={ctl} onSave={onSave} />);

    clickCell('홍길동', '조회');
    await act(async () => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('③ undo → 자동 저장 → 재시드 억제 일관성', async () => {
    const onSave = vi.fn();
    const ctl: { current: Controller | null } = { current: null };
    render(<TestHost ctl={ctl} onSave={onSave} />);

    // 홍길동 결석 → 저장
    clickCell('홍길동', '조회');
    await advance(800);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /홍길동 조회 결석/ })).toBeInTheDocument();

    // undo → 홍길동 출석으로 복구
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
    expect(screen.getByRole('button', { name: '홍길동 조회 출석' })).toBeInTheDocument();

    // undo 도 자동 저장 트리거 → save2(빈 하루). 저장 재시드가 undo 를 되돌리지 않아야 한다.
    await advance(800);
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: '홍길동 조회 출석' })).toBeInTheDocument();
    const [, byPeriod2] = onSave.mock.calls[1] as [
      string,
      ReadonlyMap<number, readonly StudentAttendance[]>,
    ];
    // 빈 하루: 모든 교시 빈 배열
    expect([...byPeriod2.values()].every((arr) => arr.length === 0)).toBe(true);
  });

  it('④ 외부(비-dirty) 변경은 정상 재시드', async () => {
    const onSave = vi.fn();
    const ctl: { current: Controller | null } = { current: null };
    render(<TestHost ctl={ctl} onSave={onSave} />);

    // 편집 없음(비-dirty) 상태에서 외부 기록 주입 → 재시드
    const absentAll: StudentAttendance[] = [
      { number: 1, status: 'absent' as AttendanceStatus, reason: '질병' },
    ];
    await act(async () => {
      ctl.current!.injectExternal(PERIODS.map((p) => rec(DATE0, p, absentAll)));
    });
    // 재시드되어 홍길동 결석이 표에 반영
    expect(screen.getByRole('button', { name: /홍길동 조회 결석/ })).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled(); // 외부 변경은 저장을 유발하지 않음
  });

  it('④ dirty 중 외부 변경은 무시 (dirty-gate: 포커스된 그리드가 이긴다)', async () => {
    const onSave = vi.fn();
    const ctl: { current: Controller | null } = { current: null };
    render(<TestHost ctl={ctl} onSave={onSave} />);

    // 홍길동 편집(dirty, 저장 전)
    clickCell('홍길동', '조회');
    expect(screen.getByRole('button', { name: /홍길동 조회 결석/ })).toBeInTheDocument();

    // 편집 중 외부에서 김영희 지각 주입 → dirty-gate 로 재시드 억제
    const lateKim: StudentAttendance[] = [
      { number: 2, status: 'late' as AttendanceStatus, reason: '질병' },
    ];
    await act(async () => {
      ctl.current!.injectExternal([rec(DATE0, 0, lateKim)]);
    });
    // 홍길동 결석은 유지, 외부 김영희 지각은 무시(그리드가 이긴다)
    expect(screen.getByRole('button', { name: /홍길동 조회 결석/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '김영희 조회 출석' })).toBeInTheDocument();
  });

  it('⑤ 저장 시 화면 밖(비활성·전학) 학생의 기존 기록을 보존 (통째 교체 데이터 유실 방지)', async () => {
    const onSave = vi.fn();
    const ctl: { current: Controller | null } = { current: null };
    // 번호 9 = 명렬(1·2·3)에 없는 전학 학생의 기존 결석 기록
    const initial = PERIODS.map((p) =>
      rec(DATE0, p, [{ number: 9, status: 'absent' as AttendanceStatus, reason: '질병' }]),
    );
    render(<TestHost ctl={ctl} onSave={onSave} initialRecords={initial} />);

    // 활성 학생(홍길동=1)만 편집·저장
    clickCell('홍길동', '조회');
    await advance(800);
    expect(onSave).toHaveBeenCalled();

    // 저장 payload 에 화면 밖 번호 9가 보존되고, 편집한 번호 1도 함께 있어야 한다
    const [, byPeriod] = onSave.mock.calls.at(-1) as [
      string,
      ReadonlyMap<number, readonly StudentAttendance[]>,
    ];
    const p0 = byPeriod.get(0) ?? [];
    expect(p0.some((s) => s.number === 9 && s.status === 'absent')).toBe(true);
    expect(p0.some((s) => s.number === 1 && s.status === 'absent')).toBe(true);
  });
});
