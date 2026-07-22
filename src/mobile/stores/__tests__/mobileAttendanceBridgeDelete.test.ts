/**
 * 모바일 출결 브리지 — 사본 스토어 미로드 상태에서도 삭제가 확실히 수행되는지 회귀 가드.
 *
 * 핸드오프: `docs/01-plan/features/attendance-dual-ledger-delete.handoff.md` §2.2 / §5-1-6
 *
 * `bridgeAttendanceRecord`는 `get().records`에서 기존 사본(`att-<studentId>-<date>`)을 찾아
 * present(정상 출석)로 되돌릴 때 삭제한다. 그런데 `AttendanceCheckPage`는 사본 스토어를
 * 로드하지 않아, 앱 실행 직후 동기화 완료 전에 출결로 들어가면 `records`가 `[]`라
 *   ① present 되돌리기가 삭제를 **조용히 건너뛰고**(PC에 사본이 그대로 남는다)
 *   ② 비-present는 같은 id를 **중복 추가**한다(add는 무조건 append).
 * → "모바일에서 지웠는데 PC에 여전히 살아 있다"(피드백 #147 B-4).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StudentRecord } from '@domain/entities/StudentRecord';

const { recordsFake } = vi.hoisted(() => {
  const records: StudentRecord[] = [];
  return {
    recordsFake: {
      records,
      async getRecords() {
        return { records: records.map((r) => ({ ...r })), categories: [] };
      },
      async saveRecords(data: { records: StudentRecord[] }) {
        records.splice(0, records.length, ...data.records.map((r) => ({ ...r })));
      },
      async getCategories() {
        return [];
      },
      async saveCategories() {},
      async getAll() {
        return records.map((r) => ({ ...r }));
      },
    },
  };
});

vi.mock('@mobile/di/container', () => ({
  studentRecordsRepository: recordsFake,
  teachingClassRepository: {
    async getAttendance() {
      return { records: [] };
    },
    async saveAttendance() {},
    async getClasses() {
      return { classes: [] };
    },
    async saveClasses() {},
  },
  studentRepository: {
    async getStudents() {
      return [];
    },
    async saveStudents() {},
  },
}));

vi.mock('@mobile/stores/useMobileDriveSyncStore', () => ({
  useMobileDriveSyncStore: {
    getState: () => ({ triggerSaveSync: vi.fn() }),
  },
}));

import { useMobileStudentRecordsStore } from '../useMobileStudentRecordsStore';

const DATE = '2026-07-22';
const BRIDGE_ID = `att-stu-B-${DATE}`;

function bridgeRecord(): StudentRecord {
  return {
    id: BRIDGE_ID,
    studentId: 'stu-B',
    category: 'attendance',
    subcategory: '결석 (질병)',
    content: '',
    date: DATE,
    createdAt: '2026-07-22T00:00:00.000Z',
  };
}

beforeEach(() => {
  recordsFake.records.splice(0);
  // 앱을 막 켠 상태 재현 — 디스크에는 사본이 있지만 스토어는 아직 로드 전
  useMobileStudentRecordsStore.setState({ records: [], categories: [], loaded: false });
});

describe('모바일 출결 브리지 — 미로드 상태 방어', () => {
  it('사본 스토어 미로드 상태에서 present로 되돌려도 사본이 확실히 삭제된다', async () => {
    recordsFake.records.push(bridgeRecord());

    await useMobileStudentRecordsStore.getState().bridgeAttendanceRecord({
      studentId: 'stu-B',
      date: DATE,
      status: 'present',
    });

    // 디스크·화면 양쪽에서 사라져야 한다 (동기화되면 PC 기록에서도 사라진다)
    expect(recordsFake.records.map((r) => r.id)).toEqual([]);
    expect(useMobileStudentRecordsStore.getState().records).toEqual([]);
  });

  it('미로드 상태에서 결석을 기록해도 같은 id가 중복 생성되지 않는다', async () => {
    recordsFake.records.push(bridgeRecord());

    await useMobileStudentRecordsStore.getState().bridgeAttendanceRecord({
      studentId: 'stu-B',
      date: DATE,
      status: 'late',
      reason: '기타',
    });

    const ids = recordsFake.records.map((r) => r.id);
    expect(ids).toEqual([BRIDGE_ID]); // 1건 — 중복 append 되지 않음
    expect(recordsFake.records[0]!.subcategory).toBe('지각 (기타)');
    // 기존 createdAt 승계 (신규 생성이 아니라 갱신)
    expect(recordsFake.records[0]!.createdAt).toBe('2026-07-22T00:00:00.000Z');
  });

  it('이미 로드된 상태의 기존 동작은 그대로다 (회귀 0)', async () => {
    const rec = bridgeRecord();
    recordsFake.records.push(rec);
    useMobileStudentRecordsStore.setState({ records: [rec], loaded: true });

    await useMobileStudentRecordsStore.getState().bridgeAttendanceRecord({
      studentId: 'stu-B',
      date: DATE,
      status: 'present',
    });

    expect(recordsFake.records.map((r) => r.id)).toEqual([]);
  });
});
