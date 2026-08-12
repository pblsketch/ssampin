// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
/**
 * 모바일 담임 출결 — 학생 원천(명렬표) + 빈 명단 저장 차단 런타임 회귀 테스트.
 *
 * 핸드오프: `docs/01-plan/features/mobile-homeroom-roster-source.handoff.md` §6-2
 * (같은 폴더의 multiDate/quickText 테스트는 소스 문자열 grep 계약이라 아래 4종을 잡을 수 없다)
 *
 *  ① 담임(type='homeroom')은 담임 명렬표에서 학생을 찾는다 — 수업 학급 명부(getClass) 아님
 *  ② studentKey = String(studentNumber) — 저장된 기존 기록이 화면에 그대로 붙는다
 *  ③ 명단이 비면 saveRecord 를 호출하지 않는다 (그날 출결이 0명짜리로 덮어써지는 유실 차단)
 *  ④ 수업(type='class')은 기존 getClass 경로 그대로 동작한다 (회귀 0)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { AttendanceRecord } from '@domain/entities/Attendance';
import type { Student } from '@domain/entities/Student';
import type { TeachingClass } from '@domain/entities/TeachingClass';

/** saveRecord 호출 감시용 — 팩토리는 호출 시점이 아니라 실행 시점에만 역참조한다(TDZ 회피). */
const saveRecordMock = vi.fn<(record: AttendanceRecord) => Promise<void>>();
const bridgeMock = vi.fn<() => Promise<void>>();

vi.mock('@mobile/stores/useMobileAttendanceStore', async () => {
  const { create } = await import('zustand');
  return {
    useMobileAttendanceStore: create(() => ({
      records: [],
      loaded: true,
      load: async () => {},
      reload: async () => {},
      getTodayRecord: () => null,
      saveRecord: (record: AttendanceRecord) => saveRecordMock(record),
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
      students: [],
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
      bridgeAttendanceRecord: () => bridgeMock(),
    })),
  };
});

vi.mock('@mobile/stores/useMobileSettingsStore', async () => {
  const { create } = await import('zustand');
  return {
    useMobileSettingsStore: create(() => ({
      settings: { className: '3-5', periodTimes: [] },
      load: async () => {},
    })),
  };
});

import { AttendanceCheckPage } from './AttendanceCheckPage';
import { useMobileAttendanceStore } from '@mobile/stores/useMobileAttendanceStore';
import { useMobileTeachingClassStore } from '@mobile/stores/useMobileTeachingClassStore';
import { useMobileStudentStore } from '@mobile/stores/useMobileStudentStore';

// ── 픽스처 ──────────────────────────────────────────────────────────────
/** 담임 화면이 넘겨받는 classId 는 UUID 가 아니라 학급 이름 문자열이다 (TodayHub → settings.className) */
const HOMEROOM_CLASS_ID = '3-5';
/** 수업 학급 id 는 generateUUID() 산출물 — 학급 이름과 절대 같을 수 없다 */
const TEACHING_CLASS_ID = 'e3b0c442-98fc-1c14-9afb-f4c8996fb924';

const ROSTER: readonly Student[] = [
  { id: 'stu-1', name: '김정민', studentNumber: 1 },
  { id: 'stu-2', name: '이서연', studentNumber: 2 },
  { id: 'stu-3', name: '박지훈', studentNumber: 3 },
];

const TEACHING_CLASS: TeachingClass = {
  id: TEACHING_CLASS_ID,
  name: '2학년 3반 과학',
  subject: '과학',
  students: [
    { number: 5, name: '최유나', grade: 2, classNum: 3 },
    { number: 6, name: '정하람', grade: 2, classNum: 3 },
  ],
  createdAt: '2026-03-02T00:00:00.000Z',
  updatedAt: '2026-03-02T00:00:00.000Z',
};

function renderHomeroom() {
  return render(
    <AttendanceCheckPage
      classId={HOMEROOM_CLASS_ID}
      className={HOMEROOM_CLASS_ID}
      period={0}
      type="homeroom"
      onBack={vi.fn()}
    />,
  );
}

/** 렌더/타이머 후 이펙트·마이크로태스크를 모두 정착시킨다 */
async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

/**
 * 학생 행(li) 안에서 상태 버튼을 찾는다.
 *
 * 출결 화면은 "기본은 출석, 다른 학생만 펼침" 방식이라 출석인 학생의 행은 한 줄로
 * 접혀 있고 상태 버튼이 없다. 이름을 눌러 펼친 뒤에 찾는다.
 * (검사하려는 내용 — 저장 페이로드·빈 명단 차단·기록 복원 — 은 그대로다.
 *  버튼에 닿는 방법만 화면 구조에 맞춰 바뀐 것)
 */
function statusButton(studentName: string, label: string): HTMLElement {
  const row = screen.getByText(studentName).closest('li');
  expect(row).not.toBeNull();

  const alreadyExpanded = within(row!).queryByRole('button', { name: label });
  if (alreadyExpanded) return alreadyExpanded;

  // 접혀 있으면 행 전체가 펼치기 버튼이다.
  fireEvent.click(within(row!).getByRole('button', { expanded: false }));

  const expandedRow = screen.getByText(studentName).closest('li');
  return within(expandedRow!).getByRole('button', { name: label });
}

beforeEach(() => {
  vi.useFakeTimers();
  saveRecordMock.mockClear();
  saveRecordMock.mockResolvedValue(undefined);
  bridgeMock.mockClear();
  bridgeMock.mockResolvedValue(undefined);
  useMobileStudentStore.setState({ students: [], loaded: true });
  useMobileTeachingClassStore.setState({ classes: [], loaded: true, getClass: () => undefined });
  useMobileAttendanceStore.setState({ loaded: true, getTodayRecord: () => null });
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  cleanup();
});

describe('① 담임 출결 학생 원천 = 담임 명렬표', () => {
  it('명렬표에 학생이 있으면 명단이 렌더된다 (수업 학급 명부가 비어 있어도)', async () => {
    useMobileStudentStore.setState({ students: ROSTER });
    renderHomeroom();
    await flush();

    expect(screen.getByText('김정민')).toBeInTheDocument();
    expect(screen.getByText('이서연')).toBeInTheDocument();
    expect(screen.getByText('박지훈')).toBeInTheDocument();
    // 렌더된 학생 행 수 = 명렬표 학생 수. (예전엔 '출석' 버튼 개수로 셌는데, 출결 화면이
    //  "기본은 출석, 다른 학생만 펼침"으로 바뀌어 접힌 행에는 버튼이 없다. 행을 직접 세는
    //  편이 원래 의도 — 명단이 올바른 출처에서 N명 온다 — 에 더 가깝다)
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByText('담임 명렬표에 학생이 없어요')).not.toBeInTheDocument();
  });

  it('비활성(전출 등) 학생과 번호 없는 학생은 제외하고 안내한다', async () => {
    useMobileStudentStore.setState({
      students: [
        ...ROSTER,
        { id: 'stu-4', name: '전출학생', studentNumber: 4, status: 'transferred' },
        { id: 'stu-5', name: '번호없음' },
      ],
    });
    renderHomeroom();
    await flush();

    expect(screen.queryByText('전출학생')).not.toBeInTheDocument();
    expect(screen.queryByText('번호없음')).not.toBeInTheDocument();
    expect(screen.getByText(/번호가 없는 학생 1명/)).toBeInTheDocument();
  });

  it('명렬표가 비어 있으면 원인별 빈 화면 안내를 보여준다', async () => {
    renderHomeroom();
    await flush();

    expect(screen.getByText('담임 명렬표에 학생이 없어요')).toBeInTheDocument();
  });
});

describe('② studentKey = String(studentNumber) — 저장된 기록이 화면에 붙는다', () => {
  it('기존 담임 출결 레코드(grade/classNum 없음)가 상태·사유·메모로 복원된다', async () => {
    const existing: AttendanceRecord = {
      classId: HOMEROOM_CLASS_ID,
      date: '2026-07-22',
      period: 0,
      students: [{ number: 2, status: 'absent', reason: '질병', memo: '감기' }],
    };
    useMobileStudentStore.setState({ students: ROSTER });
    useMobileAttendanceStore.setState({ getTodayRecord: () => existing });
    renderHomeroom();
    await flush();

    // 2번 이서연 = 결석 (키가 "3-5-2" 였다면 아무 학생에게도 붙지 않는다)
    expect(statusButton('이서연', '결석')).toHaveAttribute('aria-pressed', 'true');
    expect(statusButton('김정민', '결석')).toHaveAttribute('aria-pressed', 'false');

    const row = screen.getByText('이서연').closest('li');
    expect(within(row!).getByRole('button', { name: /질병/ })).toBeInTheDocument();
    expect(within(row!).getByPlaceholderText('메모 (선택)')).toHaveValue('감기');
  });

  it('저장 페이로드의 number 는 studentNumber 이고 grade/classNum 이 없다', async () => {
    useMobileStudentStore.setState({ students: ROSTER });
    renderHomeroom();
    await flush();

    fireEvent.click(statusButton('박지훈', '지각'));
    await flush(2000); // 2초 디바운스 자동 저장

    expect(saveRecordMock).toHaveBeenCalledTimes(1);
    const saved = saveRecordMock.mock.calls[0]![0];
    expect(saved.classId).toBe(HOMEROOM_CLASS_ID);
    expect(saved.period).toBe(0);
    expect(saved.students).toHaveLength(3);
    const late = saved.students.find((s) => s.status === 'late');
    expect(late?.number).toBe(3);
    expect(saved.students.every((s) => s.grade === undefined && s.classNum === undefined)).toBe(
      true,
    );
  });
});

describe('③ 빈 명단 저장 차단 (그날 출결 유실 방지)', () => {
  it('명단이 비면 완료·여러 날·텍스트 버튼이 모두 비활성이다', async () => {
    renderHomeroom();
    await flush();

    expect(screen.getByRole('button', { name: '완료' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /여러 날에 동일 출결 적용/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /텍스트로 출결 입력/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '완료' }));
    await flush();
    expect(saveRecordMock).not.toHaveBeenCalled();
  });

  it('저장 예약 후 명단이 비면 디바운스가 발사돼도 saveRecord 를 호출하지 않는다', async () => {
    useMobileStudentStore.setState({ students: ROSTER });
    renderHomeroom();
    await flush();

    fireEvent.click(statusButton('김정민', '결석'));

    // 저장 예약(2초) 상태에서 명렬표가 비는 경우 — 빈 students 로 그날 기록을 덮으면 안 된다
    act(() => {
      useMobileStudentStore.setState({ students: [] });
    });
    await flush(2000);

    expect(saveRecordMock).not.toHaveBeenCalled();
  });

  it('언마운트 flush 도 빈 명단이면 저장하지 않는다', async () => {
    useMobileStudentStore.setState({ students: ROSTER });
    const { unmount } = renderHomeroom();
    await flush();

    fireEvent.click(statusButton('이서연', '조퇴'));
    act(() => {
      useMobileStudentStore.setState({ students: [] });
    });
    await flush();

    unmount();
    await flush();

    expect(saveRecordMock).not.toHaveBeenCalled();
  });
});

describe('④ 수업 출결(type=class) 회귀 0', () => {
  beforeEach(() => {
    useMobileTeachingClassStore.setState({
      classes: [TEACHING_CLASS],
      loaded: true,
      getClass: (id: string) => (id === TEACHING_CLASS_ID ? TEACHING_CLASS : undefined),
    });
  });

  function renderClassPage() {
    return render(
      <AttendanceCheckPage
        classId={TEACHING_CLASS_ID}
        className="2학년 3반 과학"
        period={3}
        type="class"
        onBack={vi.fn()}
      />,
    );
  }

  it('학생은 여전히 수업 학급 명부(getClass)에서 온다 — 담임 명렬표와 무관', async () => {
    // 담임 명렬표가 비어 있어도 수업 출결은 정상이어야 한다
    renderClassPage();
    await flush();

    expect(screen.getByText('최유나')).toBeInTheDocument();
    expect(screen.getByText('정하람')).toBeInTheDocument();
    // 행 개수로 센다(위 ① 테스트와 같은 이유 — 접힌 행에는 상태 버튼이 없다)
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('복합 키(grade-classNum-number)로 저장된 기존 기록이 그대로 붙는다', async () => {
    const existing: AttendanceRecord = {
      classId: TEACHING_CLASS_ID,
      date: '2026-07-22',
      period: 3,
      students: [{ number: 6, grade: 2, classNum: 3, status: 'classAbsence', reason: '미인정' }],
    };
    useMobileAttendanceStore.setState({ getTodayRecord: () => existing });
    renderClassPage();
    await flush();

    expect(statusButton('정하람', '결과')).toHaveAttribute('aria-pressed', 'true');
    expect(statusButton('최유나', '결과')).toHaveAttribute('aria-pressed', 'false');
  });

  it('저장 페이로드에 grade/classNum 이 유지된다', async () => {
    renderClassPage();
    await flush();

    fireEvent.click(statusButton('최유나', '결석'));
    await flush(2000);

    expect(saveRecordMock).toHaveBeenCalledTimes(1);
    const saved = saveRecordMock.mock.calls[0]![0];
    expect(saved.period).toBe(3);
    const absent = saved.students.find((s) => s.status === 'absent');
    expect(absent).toMatchObject({ number: 5, grade: 2, classNum: 3 });
  });
});
