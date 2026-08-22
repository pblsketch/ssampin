/**
 * 알림 판정 로직.
 *
 * 알림은 조용히 실패하는 기능이다 — 안 울린 알림은 아무도 신고하지 않는다.
 * 그래서 "울려야 할 때 울리는가"만큼 **"울리지 말아야 할 때 안 울리는가"** 를 함께 잠근다.
 *
 * ★ 특히 **할 일 알람을 붙이면서 학생 관찰 기록 알림이 조용히 죽지 않는가**를 반복해서
 *   확인한다. 그게 이 변경에서 가장 비싼 실패다 — 아무 에러도 안 나고 몇 달 동안
 *   아무도 눈치채지 못한 채 알림만 안 온다.
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
  isFiredEntry,
  pruneFiredLedger,
  FIRED_LEDGER_MAX_AGE_MS,
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

describe('기록 알림 회귀 — 할일 알람을 붙여도 예전 그대로여야 한다', () => {
  it('구형 배열 payload 5건이 record 칸에 그대로 예약된다', () => {
    const raw = Array.from({ length: 5 }, (_, i) => item({ reminderId: `r${i}` }));
    const { source, items } = normalizePayload(raw);
    const b = applySchedule(EMPTY_BUCKETS, source, items);

    expect(b.record).toHaveLength(5);
    expect(b.todo).toHaveLength(0);
  });

  it('record 5건 + todo 3건 → 8건. record 를 다시 보내도 todo 3건이 살아 있다', () => {
    let b = applySchedule(
      EMPTY_BUCKETS,
      'record',
      Array.from({ length: 5 }, (_, i) => item({ reminderId: `r${i}` })),
    );
    b = applySchedule(
      b,
      'todo',
      Array.from({ length: 3 }, (_, i) => item({ reminderId: `t${i}` })),
    );
    expect(b.record.length + b.todo.length).toBe(8);

    b = applySchedule(
      b,
      'record',
      Array.from({ length: 3 }, (_, i) => item({ reminderId: `r${i}` })),
    );
    expect(b.record).toHaveLength(3);
    expect(b.todo).toHaveLength(3); // ★ 남의 칸은 건드리지 않았다
  });

  it("clearReminderSchedule('record') 를 해도 todo 3건은 살아 있다", () => {
    let b = applySchedule(EMPTY_BUCKETS, 'record', [item()]);
    b = applySchedule(
      b,
      'todo',
      Array.from({ length: 3 }, (_, i) => item({ reminderId: `t${i}` })),
    );

    const cleared = applyClear(b, 'record');
    expect(cleared.record).toHaveLength(0);
    expect(cleared.todo).toHaveLength(3);
  });

  it('알람을 끄면(todo 칸 비움) record 칸은 그대로다', () => {
    let b = applySchedule(EMPTY_BUCKETS, 'record', [item(), item({ reminderId: 'r2' })]);
    b = applySchedule(b, 'todo', [item({ reminderId: 't1' })]);

    const off = applyClear(b, 'todo');
    expect(off.todo).toHaveLength(0);
    expect(off.record).toHaveLength(2);
  });
});

describe('발화 장부 — 재시작해도 같은 알림이 또 울리지 않는다', () => {
  it('형태 검사', () => {
    expect(isFiredEntry({ reminderId: 'a', firedAt: NOW, source: 'todo' })).toBe(true);
    expect(isFiredEntry({ reminderId: 'a', firedAt: NOW })).toBe(false);
    expect(isFiredEntry({ reminderId: 'a' })).toBe(false);
    expect(isFiredEntry(null)).toBe(false);
  });

  it('"14:00 발화 → 14:03 재시작" — 장부에 있으면 다시 울리지 않는다', () => {
    const fired = pruneFiredLedger(
      [{ reminderId: 'todo:t1:1', firedAt: NOW - 180_000, source: 'todo' }],
      NOW,
    );
    const b = applySchedule(EMPTY_BUCKETS, 'todo', [item({ reminderId: 'todo:t1:1' })]);

    const r = selectDue(b, NOW, new Set(fired.map((e) => e.reminderId)));
    expect(r.toFire).toHaveLength(0);
  });

  it('보관 기간이 지난 줄은 버린다 — 파일이 영원히 자라지 않게', () => {
    const kept = pruneFiredLedger(
      [
        { reminderId: 'old', firedAt: NOW - FIRED_LEDGER_MAX_AGE_MS - 1, source: 'todo' },
        { reminderId: 'new', firedAt: NOW - 1000, source: 'todo' },
      ],
      NOW,
    );
    expect(kept.map((e) => e.reminderId)).toEqual(['new']);
  });

  it('상한을 넘으면 최근 것부터 남긴다', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      reminderId: `r${i}`,
      firedAt: NOW - (10 - i) * 1000,
      source: 'todo' as const,
    }));
    const kept = pruneFiredLedger(many, NOW, FIRED_LEDGER_MAX_AGE_MS, 3);

    expect(kept.map((e) => e.reminderId)).toEqual(['r7', 'r8', 'r9']);
  });

  it('같은 id 가 여러 줄이면 마지막 발화만 남는다', () => {
    const kept = pruneFiredLedger(
      [
        { reminderId: 'r', firedAt: NOW - 5000, source: 'todo' },
        { reminderId: 'r', firedAt: NOW - 1000, source: 'todo' },
      ],
      NOW,
    );
    expect(kept).toEqual([{ reminderId: 'r', firedAt: NOW - 1000, source: 'todo' }]);
  });
});

describe('diagnostics', () => {
  it('칸별 건수와 가장 이른 예정 시각을 알려준다', () => {
    let b = applySchedule(EMPTY_BUCKETS, 'record', [item({ fireAt: NOW + 5000 })]);
    b = applySchedule(b, 'todo', [
      item({ reminderId: 't1', fireAt: NOW + 1000 }),
      item({ reminderId: 't2', fireAt: NOW + 9000 }),
    ]);

    const d = diagnostics(b, NOW);
    expect(d.counts).toEqual({ record: 1, todo: 2 });
    expect(d.nextFireAt).toBe(NOW + 1000);
    expect(d.nextFireInMs).toBe(1000);
  });

  it('아무것도 없으면 예정 시각은 null', () => {
    const d = diagnostics(EMPTY_BUCKETS, NOW);
    expect(d.nextFireAt).toBeNull();
    expect(d.nextFireInMs).toBeNull();
  });

  it('★ 부팅 때 복원한 건수는 렌더러가 예약을 덮어써도 남는다', () => {
    // 콜드 부팅 판정에 쓰는 값이다. 설정 화면을 여는 순간 메인 렌더러가 살아나 todo 칸을
    // 자기 계산으로 덮어쓰는데, 그때 이 값까지 사라지면 확인 행위가 증거를 지우게 된다.
    const observations = {
      lastPushedAt: { todo: NOW },
      restoredFromSnapshotAt: NOW - 60_000,
      snapshotItemCount: 3,
    };
    const b = applySchedule(EMPTY_BUCKETS, 'todo', []); // 렌더러가 0건으로 덮어썼다

    const d = diagnostics(b, NOW, observations, 7);
    expect(d.counts.todo).toBe(0);
    expect(d.snapshotItemCount).toBe(3); // ★ 그래도 "부팅 때 3건 되살렸다"는 남는다
    expect(d.restoredFromSnapshotAt).toBe(NOW - 60_000);
    expect(d.firedCount).toBe(7);
  });
});
