// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
/**
 * 모바일 담임 출결 — 학교급별 교시 선택 노출 + 다른 교시 기록 안내.
 *
 * 왜 이 테스트가 있나 — 담임이 출결을 보는 방식이 학교급마다 다르다.
 * 초등 담임은 거의 전 교시를 관리하지만 중·고 담임은 조회·종례만 보면 된다.
 * 한 화면으로 둘 다 맞출 수 없어 학교급으로 갈랐고, 그 분기가 조용히 뒤집히면
 * 초등에서는 기록할 방법이 사라지고 중·고에서는 쓰지도 않을 드롭다운이 붙는다.
 *
 * 그리고 하루뷰(중·고)는 조회 한 교시만 띄우므로, PC에서 다른 교시에 넣어 둔 기록이
 * 화면에서 통째로 사라진다 — 있다는 사실만이라도 알려야 그 날을 잘못 판단하지 않는다.
 *
 * 분석: docs/03-analysis/attendance-document-mobile-need.analysis.md §3-6, §3-7
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { AttendanceRecord } from '@domain/entities/Attendance';
import type { Student } from '@domain/entities/Student';
import type { SchoolLevel } from '@domain/entities/Settings';

vi.mock('@mobile/stores/useMobileAttendanceStore', async () => {
  const { create } = await import('zustand');
  return {
    useMobileAttendanceStore: create(() => ({
      records: [] as readonly AttendanceRecord[],
      loaded: true,
      load: async () => {},
      reload: async () => {},
      getTodayRecord: () => null,
      saveRecord: async () => {},
    })),
  };
});

vi.mock('@mobile/stores/useMobileTeachingClassStore', async () => {
  const { create } = await import('zustand');
  return {
    useMobileTeachingClassStore: create(() => ({
      classes: [],
      loaded: true,
      load: async () => {},
      reload: async () => {},
      getClass: () => undefined,
    })),
  };
});

vi.mock('@mobile/stores/useMobileStudentStore', async () => {
  const { create } = await import('zustand');
  return {
    useMobileStudentStore: create(() => ({
      students: [] as readonly Student[],
      loaded: true,
      load: async () => {},
      reload: async () => {},
    })),
  };
});

vi.mock('@mobile/stores/useMobileStudentRecordsStore', async () => {
  const { create } = await import('zustand');
  return {
    useMobileStudentRecordsStore: create(() => ({
      bridgeAttendanceRecord: async () => {},
    })),
  };
});

vi.mock('@mobile/stores/useMobileSettingsStore', async () => {
  const { create } = await import('zustand');
  return {
    useMobileSettingsStore: create(() => ({
      settings: { className: '3-5', periodTimes: [], schoolLevel: 'middle' as SchoolLevel },
      load: async () => {},
    })),
  };
});

import { AttendanceCheckPage } from './AttendanceCheckPage';
import { useMobileAttendanceStore } from '@mobile/stores/useMobileAttendanceStore';
import { useMobileStudentStore } from '@mobile/stores/useMobileStudentStore';
import { useMobileSettingsStore } from '@mobile/stores/useMobileSettingsStore';

const HOMEROOM_CLASS_ID = '3-5';
const ROSTER: readonly Student[] = [
  { id: 'stu-1', name: '김정민', studentNumber: 1 },
  { id: 'stu-2', name: '이서연', studentNumber: 2 },
] as readonly Student[];

function todayString(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function setSchoolLevel(level: SchoolLevel): void {
  // 스토어는 vi.mock 으로 갈아끼운 최소 목이라 실제 MobileSettings 전 필드를 채우지 않는다.
  // 이 테스트가 보는 것은 schoolLevel 분기뿐이므로 필요한 필드만 넣고 캐스팅한다.
  useMobileSettingsStore.setState({
    settings: { className: HOMEROOM_CLASS_ID, periodTimes: [], schoolLevel: level },
  } as unknown as Parameters<typeof useMobileSettingsStore.setState>[0]);
}

function setLedger(records: readonly AttendanceRecord[]): void {
  useMobileAttendanceStore.setState({ records });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function renderHomeroom() {
  const result = render(
    <AttendanceCheckPage
      classId={HOMEROOM_CLASS_ID}
      className={HOMEROOM_CLASS_ID}
      period={0}
      type="homeroom"
      onBack={vi.fn()}
    />,
  );
  await flush();
  return result;
}

/** 교시 선택 버튼 — 목록을 여는 버튼만 aria-haspopup=listbox 를 갖는다. */
const periodButton = () =>
  screen.queryAllByRole('button').find((b) => b.getAttribute('aria-haspopup') === 'listbox');

beforeEach(() => {
  setSchoolLevel('middle');
  setLedger([]);
  useMobileStudentStore.setState({ students: ROSTER });
});

afterEach(cleanup);

describe('학교급별 교시 선택 노출', () => {
  it('초등 담임 출결에는 교시 선택이 뜬다 — 담임이 전 교시를 관리하므로', async () => {
    setSchoolLevel('elementary');
    await renderHomeroom();
    expect(periodButton()).toBeDefined();
  });

  it("'직접 설정' 학교급도 함께 노출한다 — 담임 운영 방식을 알 수 없다", async () => {
    setSchoolLevel('custom');
    await renderHomeroom();
    expect(periodButton()).toBeDefined();
  });

  it('중학교 담임 출결에는 뜨지 않는다 — 조회 하나로 충분하다 (기존 동작 유지)', async () => {
    setSchoolLevel('middle');
    await renderHomeroom();
    expect(periodButton()).toBeUndefined();
  });

  it('고등학교 담임 출결에도 뜨지 않는다', async () => {
    setSchoolLevel('high');
    await renderHomeroom();
    expect(periodButton()).toBeUndefined();
  });

  it('수업 출결은 학교급과 무관하게 뜬다 (기존 동작 유지)', async () => {
    setSchoolLevel('middle');
    render(
      <AttendanceCheckPage
        classId="e3b0c442-98fc-1c14-9afb-f4c8996fb924"
        className="2학년 3반 과학"
        period={3}
        type="class"
        onBack={vi.fn()}
      />,
    );
    await flush();
    expect(periodButton()).toBeDefined();
  });

  it('초등 담임은 조회로 들어오고 화면이 그 이름을 보여준다 (진입 교시 유지)', async () => {
    setSchoolLevel('elementary');
    await renderHomeroom();
    expect(periodButton()?.textContent).toContain('조회');
  });

  it('목록에 조회·종례가 모두 있고 도메인 라벨로 표시된다', async () => {
    // 종례(9교시)를 손수 라벨링하면 "9교시"로 찍힌다 — 도메인 formatPeriodLabel 을 써야 한다.
    // 담임이 전 교시를 보는 학교급에서는 종례 출결도 관리 대상이라 목록에서 빠지면 안 된다.
    setSchoolLevel('elementary');
    await renderHomeroom();
    await act(async () => {
      periodButton()?.click();
    });
    const labels = screen.getAllByRole('option').map((o) => o.textContent ?? '');
    expect(labels.some((t) => t.includes('조회'))).toBe(true);
    expect(labels.some((t) => t.includes('종례'))).toBe(true);
    expect(labels.some((t) => t.includes('9교시'))).toBe(false);
  });
});

describe('다른 교시 기록 안내 (하루뷰 전용)', () => {
  const NOTICE = /이 날 다른 교시에 출결이 잡힌 학생이/;

  function ledgerRecord(period: number, status: 'present' | 'absent'): AttendanceRecord {
    return {
      classId: HOMEROOM_CLASS_ID,
      date: todayString(),
      period,
      students: [{ number: 1, status }],
    };
  }

  it('중·고 하루뷰에서 다른 교시에 기록이 있으면 알려준다', async () => {
    setSchoolLevel('middle');
    setLedger([ledgerRecord(0, 'present'), ledgerRecord(3, 'absent')]);
    await renderHomeroom();
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
  });

  it('다른 교시가 전부 출석이면 알리지 않는다', async () => {
    setSchoolLevel('middle');
    setLedger([ledgerRecord(0, 'present'), ledgerRecord(3, 'present')]);
    await renderHomeroom();
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it('그날 다른 교시 기록이 아예 없으면 알리지 않는다', async () => {
    setSchoolLevel('middle');
    setLedger([ledgerRecord(0, 'absent')]);
    await renderHomeroom();
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it('초등은 교시를 직접 옮겨 볼 수 있으므로 안내하지 않는다', async () => {
    setSchoolLevel('elementary');
    setLedger([ledgerRecord(0, 'present'), ledgerRecord(3, 'absent')]);
    await renderHomeroom();
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it('전일 결석이어도 학생 수로 센다 — 교시 엔트리를 세면 한 명이 여러 건으로 부풀어 오보가 된다', async () => {
    setSchoolLevel('middle');
    // 한 학생(1번)이 1~6교시 내내 결석. 엔트리는 6건이지만 학생은 1명이다.
    setLedger([
      ledgerRecord(0, 'present'),
      ...[1, 2, 3, 4, 5, 6].map((p) => ledgerRecord(p, 'absent')),
    ]);
    await renderHomeroom();
    expect(screen.getByText(/학생이 1명 있어요/)).toBeInTheDocument();
  });
});
