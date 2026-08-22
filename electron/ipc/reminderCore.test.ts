/**
 * 알림 판정 로직 고정 — M4-(a).
 *
 * 이 커밋의 목적은 **기존 동작을 그대로 붙잡아 두는 것**이다. 다음 커밋에서 출처별 병합·
 * 만료·정본 조회를 넣을 때, 무엇이 원래 동작이었는지 이 테스트가 기준이 된다.
 *
 * 알림은 조용히 실패하는 기능이다 — 안 울린 알림은 아무도 신고하지 않는다.
 * 그래서 "울려야 할 때 울리는가"만큼 **"울리지 말아야 할 때 안 울리는가"** 를 함께 잠근다.
 */
import { describe, it, expect } from 'vitest';
import {
  EMPTY_BUCKETS,
  applySchedule,
  applyClear,
  normalizePayload,
  selectDue,
  diagnostics,
  isValidItem,
  type ReminderScheduleItem,
} from './reminderCore';

const NOW = 1_700_000_000_000;

const item = (over: Partial<ReminderScheduleItem> = {}): ReminderScheduleItem => ({
  reminderId: 'r1',
  fireAt: NOW - 1000,
  title: '수업 관찰 기록 알림',
  body: '기록이 뜸한 학생이 2명 있어요',
  studentDedupKey: 's1:2026-08-22',
  ...over,
});

describe('isValidItem', () => {
  it('필수 항목이 다 있으면 통과', () => {
    expect(isValidItem(item())).toBe(true);
  });

  it.each([
    ['reminderId', { reminderId: 1 }],
    ['fireAt', { fireAt: '언제' }],
    ['title', { title: null }],
    ['body', { body: undefined }],
    ['studentDedupKey', { studentDedupKey: 42 }],
  ])('%s 가 이상하면 거른다', (_name, bad) => {
    expect(isValidItem({ ...item(), ...bad })).toBe(false);
  });

  it('객체가 아니면 거른다', () => {
    expect(isValidItem(null)).toBe(false);
    expect(isValidItem('r1')).toBe(false);
  });
});

describe('normalizePayload — 구버전 렌더러 호환', () => {
  it('배열이 오면 record 로 본다 (예전 형식)', () => {
    const r = normalizePayload([item()]);
    expect(r.source).toBe('record');
    expect(r.items).toHaveLength(1);
  });

  it('배열 안의 잘못된 항목은 걸러낸다', () => {
    expect(normalizePayload([item(), { nope: true }]).items).toHaveLength(1);
  });

  it('출처를 담은 객체를 알아본다 (새 형식)', () => {
    const r = normalizePayload({ source: 'todo', items: [item()] });
    expect(r.source).toBe('todo');
    expect(r.items).toHaveLength(1);
  });

  it('모르는 출처는 record 로 떨어뜨린다', () => {
    expect(normalizePayload({ source: '???', items: [] }).source).toBe('record');
  });

  it('배열도 객체도 아니면 빈 목록', () => {
    expect(normalizePayload(undefined).items).toEqual([]);
    expect(normalizePayload('x').items).toEqual([]);
  });
});

describe('applySchedule / applyClear — 칸이 서로를 지우지 않는다', () => {
  it('한 칸을 갈아도 다른 칸은 그대로다', () => {
    let b = applySchedule(EMPTY_BUCKETS, 'record', [item({ reminderId: 'rec' })]);
    b = applySchedule(b, 'todo', [item({ reminderId: 'todo1' })]);

    expect(b.record.map((i) => i.reminderId)).toEqual(['rec']);
    expect(b.todo.map((i) => i.reminderId)).toEqual(['todo1']);

    b = applySchedule(b, 'todo', []);
    expect(b.record).toHaveLength(1); // ★ 할일 칸을 비워도 기록 알림은 살아 있다
    expect(b.todo).toHaveLength(0);
  });

  it('출처를 주고 비우면 그 칸만 비운다', () => {
    let b = applySchedule(EMPTY_BUCKETS, 'record', [item()]);
    b = applySchedule(b, 'todo', [item({ reminderId: 't' })]);

    const cleared = applyClear(b, 'todo');
    expect(cleared.record).toHaveLength(1);
    expect(cleared.todo).toHaveLength(0);
  });

  it('출처 없이 비우면 전부 지운다 — 구버전 호환 동작', () => {
    let b = applySchedule(EMPTY_BUCKETS, 'record', [item()]);
    b = applySchedule(b, 'todo', [item({ reminderId: 't' })]);

    expect(applyClear(b)).toEqual(EMPTY_BUCKETS);
  });
});

describe('selectDue — 기존 동작 고정', () => {
  it('예정 시각이 지났으면 발화 대상', () => {
    const b = applySchedule(EMPTY_BUCKETS, 'record', [item({ fireAt: NOW - 1 })]);
    expect(selectDue(b, NOW, new Set()).toFire).toHaveLength(1);
  });

  it('아직 이르면 남겨 둔다', () => {
    const b = applySchedule(EMPTY_BUCKETS, 'record', [item({ fireAt: NOW + 60_000 })]);
    const r = selectDue(b, NOW, new Set());

    expect(r.toFire).toHaveLength(0);
    expect(r.nextBuckets.record).toHaveLength(1);
  });

  it('이미 울린 것은 다시 울리지 않고 목록에서도 빠진다', () => {
    const b = applySchedule(EMPTY_BUCKETS, 'record', [item({ reminderId: 'done' })]);
    const r = selectDue(b, NOW, new Set(['done']));

    expect(r.toFire).toHaveLength(0);
    expect(r.nextBuckets.record).toHaveLength(0);
  });

  it('발화한 것은 남은 목록에서 빠진다', () => {
    const b = applySchedule(EMPTY_BUCKETS, 'record', [item()]);
    expect(selectDue(b, NOW, new Set()).nextBuckets.record).toHaveLength(0);
  });

  it('두 칸에서 함께 고른다', () => {
    let b = applySchedule(EMPTY_BUCKETS, 'record', [item({ reminderId: 'a' })]);
    b = applySchedule(b, 'todo', [item({ reminderId: 'b' })]);

    const r = selectDue(b, NOW, new Set());
    expect(r.toFire.map((d) => d.source).sort()).toEqual(['record', 'todo']);
  });
});

describe('selectDue — 새 안전장치', () => {
  it('만료 시각이 지났으면 발화하지 않는다 (절전 복귀 후 무더기 알림 방지)', () => {
    const b = applySchedule(EMPTY_BUCKETS, 'todo', [
      item({ fireAt: NOW - 10_000, expiresAt: NOW - 1 }),
    ]);
    const r = selectDue(b, NOW, new Set());

    expect(r.toFire).toHaveLength(0);
    expect(r.expired).toHaveLength(1);
    expect(r.nextBuckets.todo).toHaveLength(0);
  });

  it('만료 시각이 없으면 예전처럼 발화한다', () => {
    const b = applySchedule(EMPTY_BUCKETS, 'record', [item({ expiresAt: undefined })]);
    expect(selectDue(b, NOW, new Set()).toFire).toHaveLength(1);
  });

  it('정본에 없으면 발화하지 않는다', () => {
    const b = applySchedule(EMPTY_BUCKETS, 'todo', [item()]);
    const r = selectDue(b, NOW, new Set(), () => false);

    expect(r.toFire).toHaveLength(0);
    expect(r.dropped).toHaveLength(1);
  });

  it('정본 확인이 실패(throw)하면 발화하지 않는다 — 안전 쪽으로 넘어진다', () => {
    const b = applySchedule(EMPTY_BUCKETS, 'todo', [item()]);
    const r = selectDue(b, NOW, new Set(), () => {
      throw new Error('파일을 읽지 못함');
    });

    expect(r.toFire).toHaveLength(0);
    expect(r.dropped).toHaveLength(1);
  });

  it('기본 술어는 통과시킨다 — 기존 동작이 바뀌지 않는다', () => {
    const b = applySchedule(EMPTY_BUCKETS, 'record', [item()]);
    expect(selectDue(b, NOW, new Set()).toFire).toHaveLength(1);
  });
});

describe('diagnostics', () => {
  it('칸별 건수와 가장 이른 예정 시각을 알려준다', () => {
    let b = applySchedule(EMPTY_BUCKETS, 'record', [item({ fireAt: NOW + 5000 })]);
    b = applySchedule(b, 'todo', [
      item({ reminderId: 't1', fireAt: NOW + 1000 }),
      item({ reminderId: 't2', fireAt: NOW + 9000 }),
    ]);

    const d = diagnostics(b);
    expect(d.counts).toEqual({ record: 1, todo: 2 });
    expect(d.nextFireAt).toBe(NOW + 1000);
  });

  it('아무것도 없으면 예정 시각은 null', () => {
    expect(diagnostics(EMPTY_BUCKETS).nextFireAt).toBeNull();
  });
});
