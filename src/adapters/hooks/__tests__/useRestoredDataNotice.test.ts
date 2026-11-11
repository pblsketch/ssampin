/**
 * ADR-148 — 시작 스냅샷으로 되돌린 자료 알림. 메인 창에서 한 번만, 여러 자료는 한 알림에.
 *
 * 실제 문구 함수(`buildRestoredDataNotice`)와 실제 알림 처리(`notifyRestoredData`)를 그대로 통과시킨다.
 * 메인 프로세스 기록만 메모리 가짜로 둔다 — `notified` 표시가 다음 호출에 그대로 보이게.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  notifyRestoredData,
  resetRestoredDataNoticeForTest,
  RESTORED_NOTICE_DURATION_MS,
  type RestoredDataNoticeDeps,
} from '../useRestoredDataNotice';
import { DATA_FILE_LABELS } from '@domain/rules/dataFileLabels';
import {
  buildRestoredDataNotice,
  formatRestoredStateTime,
  type RestoredDataRecord,
} from '@domain/rules/restoredDataNotice';

/** 로컬 시각으로 ISO 를 만든다(테스트가 시간대에 묶이지 않게). */
const at = (month: number, day: number, hour: number, minute: number): string =>
  new Date(2026, month - 1, day, hour, minute).toISOString();

function record(
  id: string,
  file: string,
  snapshotModifiedAt: string,
  over: Partial<RestoredDataRecord> = {},
): RestoredDataRecord {
  return { id, file, snapshotModifiedAt, notified: false, syncResolved: false, ...over };
}

/** 메인 프로세스 기록 흉내 — markNotified 가 다음 list 에 반영된다. */
function fakeLog(initial: RestoredDataRecord[]) {
  let records = [...initial];
  const shown: string[] = [];
  const deps: RestoredDataNoticeDeps = {
    list: vi.fn(async () => records),
    markNotified: vi.fn(async (ids: readonly string[]) => {
      records = records.map((r) => (ids.includes(r.id) ? { ...r, notified: true } : r));
    }),
    show: (message) => shown.push(message),
  };
  return {
    deps,
    shown,
    add: (r: RestoredDataRecord) => {
      records = [...records, r];
    },
  };
}

beforeEach(() => {
  resetRestoredDataNoticeForTest();
});

describe('시작 스냅샷 복원 알림', () => {
  it('아직 알리지 않은 복원만 한 번 알린다', async () => {
    const log = fakeLog([
      record('old', 'memos', at(11, 1, 9, 0), { notified: true }),
      record('new', 'todos', at(11, 10, 13, 41)),
    ]);

    // 두 신호가 같은 순간 와도(StrictMode·창 보임 + 준비 신호) 한 번만 띄운다
    await Promise.all([notifyRestoredData(log.deps), notifyRestoredData(log.deps)]);
    // 그 뒤 신호가 또 와도(창을 다시 보임) 다시 띄우지 않는다
    await notifyRestoredData(log.deps);

    expect(log.shown).toEqual([
      '할 일 자료를 읽을 수 없어 11월 10일 오후 1시 41분 상태로 되돌렸어요. 그 뒤에 바꾼 내용은 빠졌을 수 있으니 확인해 주세요.',
    ]);
    expect(log.deps.markNotified).toHaveBeenCalledTimes(1);
    expect(log.deps.markNotified).toHaveBeenCalledWith(['new']);
  });

  it('창을 다시 만들어도(디스크의 알렸음 표시) 다시 알리지 않고, 새로 되돌린 것만 알린다', async () => {
    const log = fakeLog([record('a', 'todos', at(11, 10, 13, 41))]);
    await notifyRestoredData(log.deps);
    resetRestoredDataNoticeForTest(); // 메인 창을 새로 만든 것과 같다(모듈 상태가 비워짐)

    await notifyRestoredData(log.deps);
    log.add(record('b', 'events', at(11, 11, 8, 0)));
    await notifyRestoredData(log.deps);

    expect(log.shown).toHaveLength(2);
    expect(log.shown[1]).toBe(
      '일정 자료를 읽을 수 없어 11월 11일 오전 8시 상태로 되돌렸어요. 그 뒤에 바꾼 내용은 빠졌을 수 있으니 확인해 주세요.',
    );
  });

  it('여러 자료를 한 알림에 묶는다', async () => {
    const log = fakeLog([
      record('t', 'todos', at(11, 10, 13, 41)),
      record('e', 'events', at(11, 10, 13, 41)),
      record('s', 'student-records', at(11, 10, 13, 41)),
    ]);

    await notifyRestoredData(log.deps);

    expect(log.shown).toEqual([
      '할 일·일정·담임 메모장 자료를 읽을 수 없어 11월 10일 오후 1시 41분 상태로 되돌렸어요. 그 뒤에 바꾼 내용은 빠졌을 수 있으니 확인해 주세요.',
    ]);
    expect(log.deps.markNotified).toHaveBeenCalledWith(['t', 'e', 's']);
  });

  it('되돌린 시각이 다르면 자료마다 시각을 붙여 한 알림에 묶는다', () => {
    expect(
      buildRestoredDataNotice([
        { file: 'todos', snapshotModifiedAt: at(11, 10, 13, 41) },
        { file: 'attendance', snapshotModifiedAt: at(11, 9, 8, 2) },
      ]),
    ).toBe(
      '할 일(11월 10일 오후 1시 41분)·출결(11월 9일 오전 8시 2분) 자료를 읽을 수 없어 그때 상태로 되돌렸어요. 그 뒤에 바꾼 내용은 빠졌을 수 있으니 확인해 주세요.',
    );
  });

  it('구글 드라이브 동기화가 켜져 있으면 충돌 창 안내를 덧붙인다', async () => {
    const log = fakeLog([record('t', 'todos', at(11, 10, 13, 41))]);

    await notifyRestoredData({ ...log.deps, isDriveSyncOn: async () => true });

    expect(log.shown).toEqual([
      `할 일 자료를 읽을 수 없어 11월 10일 오후 1시 41분 상태로 되돌렸어요. ${'그 뒤에 바꾼 내용은 빠졌을 수 있으니 확인해 주세요.'} ` +
        "다른 기기에 더 새 자료가 있으면 '동기화 충돌' 창에서 [클라우드로 대체]를 골라 주세요.",
    ]);
  });

  it('세 자료 이상이고 시각이 다르면 이름만 나열하고 가장 이른 시각만 적는다', () => {
    expect(
      buildRestoredDataNotice([
        { file: 'todos', snapshotModifiedAt: at(11, 10, 13, 41) },
        { file: 'attendance', snapshotModifiedAt: at(11, 9, 8, 2) },
        { file: 'events', snapshotModifiedAt: at(11, 10, 13, 42) },
      ]),
    ).toBe(
      '할 일·출결·일정 자료를 읽을 수 없어 이전에 저장해 둔 상태로 되돌렸어요(가장 이른 것 11월 9일 오전 8시 2분). 그 뒤에 바꾼 내용은 빠졌을 수 있으니 확인해 주세요.',
    );
  });

  it('표에 없는 자료는 「일부」로 부른다', () => {
    expect(
      buildRestoredDataNotice([{ file: 'mystery', snapshotModifiedAt: at(11, 10, 9, 0) }]),
    ).toBe(
      '일부 자료를 읽을 수 없어 11월 10일 오전 9시 상태로 되돌렸어요. 그 뒤에 바꾼 내용은 빠졌을 수 있으니 확인해 주세요.',
    );
  });

  it('충돌 창과 같은 이름표를 쓴다(앱 화면의 말)', () => {
    expect(DATA_FILE_LABELS['student-records']).toBe('담임 메모장');
    expect(DATA_FILE_LABELS['attendance']).toBe('출결');
    expect(DATA_FILE_LABELS['seating']).toBe('자리배치');
    expect(DATA_FILE_LABELS['observations']).toBe('관찰 기록');
    expect(RESTORED_NOTICE_DURATION_MS).toBe(20_000);
  });

  it('기록을 읽지 못하면 알리지 않는다', async () => {
    const shown: string[] = [];
    await notifyRestoredData({
      list: async () => {
        throw new Error('IPC 실패');
      },
      markNotified: async () => undefined,
      show: (m) => shown.push(m),
    });
    expect(shown).toEqual([]);
  });

  it('시각 표기: 자정·정오·정각', () => {
    expect(formatRestoredStateTime(new Date(2026, 10, 10, 0, 5).toISOString())).toBe(
      '11월 10일 오전 12시 5분',
    );
    expect(formatRestoredStateTime(new Date(2026, 10, 10, 12, 0).toISOString())).toBe(
      '11월 10일 오후 12시',
    );
    expect(formatRestoredStateTime('알 수 없음')).toBeNull();
  });
});
