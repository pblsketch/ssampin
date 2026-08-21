import { describe, it, expect } from 'vitest';
import type { Todo } from '@domain/entities/Todo';
import {
  bucketOf,
  groupByBucket,
  changesForBucketMove,
  describeBucketMove,
  AUTO_BOARD_BUCKETS,
  type AutoBoardBucket,
} from './todoAutoBoard';

const TODAY = '2026-08-21';
const YESTERDAY = '2026-08-20';
const TOMORROW = '2026-08-22';

const todo = (over: Partial<Todo> = {}): Todo => ({
  id: 't1',
  text: '공문 회신',
  completed: false,
  createdAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

describe('bucketOf — 완료 항목은 보드에 오르지 않는다 (완료 판정 2·3)', () => {
  // 날짜 조합 전수 — 어떤 조합이어도 완료면 null 이어야 한다.
  const dateCombos: { dueDate?: string; checkAt?: string }[] = [
    {},
    { dueDate: YESTERDAY },
    { dueDate: TODAY },
    { dueDate: TOMORROW },
    { checkAt: YESTERDAY },
    { checkAt: TODAY },
    { checkAt: TOMORROW },
    { dueDate: TODAY, checkAt: TOMORROW },
    { dueDate: TOMORROW, checkAt: TODAY },
    { dueDate: YESTERDAY, checkAt: YESTERDAY },
  ];

  it.each(dateCombos)('completed:true + %o → null', (dates) => {
    expect(bucketOf(todo({ ...dates, completed: true }), TODAY)).toBeNull();
  });

  it.each(dateCombos)("status:'done' + %o → null", (dates) => {
    expect(bucketOf(todo({ ...dates, status: 'done' }), TODAY)).toBeNull();
  });

  it('반환값에 done 칸이 없다 — 타입에도 없고 값으로도 안 나온다', () => {
    const all = dateCombos.map((d) => bucketOf(todo(d), TODAY));
    for (const bucket of all) {
      expect(bucket === null || AUTO_BOARD_BUCKETS.includes(bucket)).toBe(true);
    }
  });
});

describe('bucketOf — 칸 배정', () => {
  it('날짜가 하나도 없으면 분류 대기', () => {
    expect(bucketOf(todo(), TODAY)).toBe('triage');
  });

  it('마감일이 오늘이면 오늘 처리', () => {
    expect(bucketOf(todo({ dueDate: TODAY }), TODAY)).toBe('today');
  });

  it('마감일이 지났으면 오늘 처리 — 예정에 남으면 안 된다', () => {
    expect(bucketOf(todo({ dueDate: YESTERDAY }), TODAY)).toBe('today');
  });

  it('점검 날짜만 오늘이어도 오늘 처리 — 마감일이 없어도 뜬다', () => {
    expect(bucketOf(todo({ checkAt: TODAY }), TODAY)).toBe('today');
  });

  it('둘 중 이른 쪽을 본다', () => {
    expect(bucketOf(todo({ dueDate: TOMORROW, checkAt: TODAY }), TODAY)).toBe('today');
    expect(bucketOf(todo({ dueDate: TODAY, checkAt: TOMORROW }), TODAY)).toBe('today');
  });

  it('둘 다 앞으로면 예정·대기', () => {
    expect(bucketOf(todo({ dueDate: TOMORROW, checkAt: TOMORROW }), TODAY)).toBe('upcoming');
  });

  it("진행 중은 날짜보다 먼저 본다 — 마감이 오늘이어도 '진행 중' 칸 (완료 판정 4)", () => {
    expect(bucketOf(todo({ status: 'inProgress', dueDate: TODAY }), TODAY)).toBe('inProgress');
    expect(bucketOf(todo({ status: 'inProgress' }), TODAY)).toBe('inProgress');
  });

  it('깨진 날짜는 없는 것으로 본다', () => {
    expect(bucketOf(todo({ dueDate: '내일' }), TODAY)).toBe('triage');
  });
});

describe('groupByBucket', () => {
  it('완료 항목은 어느 칸에도 들어가지 않는다', () => {
    const grouped = groupByBucket(
      [todo({ id: 'a', dueDate: TODAY }), todo({ id: 'b', dueDate: TODAY, completed: true })],
      TODAY,
    );
    expect(grouped.today.map((t) => t.id)).toEqual(['a']);
    const total = AUTO_BOARD_BUCKETS.reduce((n, b) => n + grouped[b].length, 0);
    expect(total).toBe(1);
  });

  it('네 칸이 항상 존재한다 (비어 있어도)', () => {
    const grouped = groupByBucket([], TODAY);
    expect(Object.keys(grouped).sort()).toEqual(
      ['inProgress', 'today', 'triage', 'upcoming'].sort(),
    );
  });
});

describe('changesForBucketMove — status 는 두 경우에만 (완료 판정 5)', () => {
  const targets: AutoBoardBucket[] = ['triage', 'today', 'inProgress', 'upcoming'];
  const sources: { label: string; base: Partial<Todo> }[] = [
    { label: '할 일', base: { status: 'todo' } },
    { label: '진행 중', base: { status: 'inProgress' } },
    { label: '상태 없음', base: {} },
  ];

  it('status 키가 붙는 경우는 진행 중으로 들어감 / 진행 중에서 나감 뿐이다', () => {
    const withStatus: string[] = [];
    for (const s of sources) {
      for (const t of targets) {
        const changes = changesForBucketMove(todo(s.base), t, TODAY);
        if ('status' in changes) withStatus.push(`${s.label}→${t}`);
      }
    }
    expect(withStatus.sort()).toEqual(
      [
        '할 일→inProgress',
        '진행 중→inProgress',
        '상태 없음→inProgress',
        '진행 중→triage',
        '진행 중→today',
        '진행 중→upcoming',
      ].sort(),
    );
  });

  it('어떤 이동도 완료로 만들지 않는다', () => {
    for (const s of sources) {
      for (const t of targets) {
        const changes = changesForBucketMove(todo(s.base), t, TODAY);
        expect(changes.completed).not.toBe(true);
        expect(changes.status).not.toBe('done');
      }
    }
  });

  it('오늘 처리로 옮기면 마감일이 오늘이 된다', () => {
    expect(changesForBucketMove(todo(), 'today', TODAY).dueDate).toBe(TODAY);
  });

  it('분류 대기·예정으로 옮기면 날짜를 비운다 — 임의의 날짜를 지어내지 않는다', () => {
    for (const t of ['triage', 'upcoming'] as const) {
      const changes = changesForBucketMove(todo({ dueDate: TODAY, checkAt: TODAY }), t, TODAY);
      expect(changes.dueDate).toBeUndefined();
      expect(changes.checkAt).toBeUndefined();
    }
  });

  it('진행 중으로 옮길 때 날짜는 건드리지 않는다', () => {
    const changes = changesForBucketMove(todo({ dueDate: TOMORROW }), 'inProgress', TODAY);
    expect('dueDate' in changes).toBe(false);
  });

  it('서브태스크가 함께 처리된다 — applyStatusChange 재사용 (완료 판정 9)', () => {
    const changes = changesForBucketMove(
      todo({ subTasks: [{ id: 's1', text: '가', completed: true }] }),
      'inProgress',
      TODAY,
    );
    expect(changes.subTasks?.[0]?.completed).toBe(false);
    expect(changes.completed).toBe(false);
  });
});

describe('왕복 — 원복을 주장하지 않는다 (완료 판정 6)', () => {
  it("'진행 중'에 넣었다 빼면 상태는 'todo' 가 된다 — 원래 값 복원이 아니다", () => {
    const start = todo({ status: 'todo', dueDate: TOMORROW });

    const toInProgress = changesForBucketMove(start, 'inProgress', TODAY);
    const middle: Todo = { ...start, ...toInProgress };
    expect(middle.status).toBe('inProgress');

    const back = changesForBucketMove(middle, 'upcoming', TODAY);
    const end: Todo = { ...middle, ...back };

    // ★ 기대값을 명시한다: 'todo' 이지 "원래 값"이 아니다.
    expect(end.status).toBe('todo');
    // 날짜는 '예정' 칸 규칙대로 비워졌다 — 이것도 되돌아오지 않는다.
    expect(end.dueDate).toBeUndefined();
  });

  it('왕복해도 완료로 바뀌지 않는다', () => {
    const start = todo({ subTasks: [{ id: 's1', text: '가', completed: false }] });
    const mid: Todo = { ...start, ...changesForBucketMove(start, 'inProgress', TODAY) };
    const end: Todo = { ...mid, ...changesForBucketMove(mid, 'triage', TODAY) };

    expect(end.completed).toBe(false);
    expect(end.subTasks?.every((s) => !s.completed)).toBe(true);
  });
});

describe('describeBucketMove — 바뀌는 것만 한국어로', () => {
  it('오늘 처리로 옮길 때 마감일 변경을 알린다', () => {
    expect(describeBucketMove(todo(), 'today', TODAY)).toContain('마감일을 오늘(8/21)로');
  });

  it("진행 중으로 옮길 때 '진행 중' 표시를 알린다", () => {
    expect(describeBucketMove(todo(), 'inProgress', TODAY)).toContain("'진행 중'으로 표시");
  });

  it('진행 중에서 나올 때 표시가 지워짐을 알린다', () => {
    const text = describeBucketMove(
      todo({ status: 'inProgress', dueDate: TODAY }),
      'triage',
      TODAY,
    );
    expect(text).toContain("'진행 중' 표시를 지웁니다");
    expect(text).toContain('마감일을 지웁니다');
  });

  it('점검 날짜가 지워질 때도 알린다', () => {
    const text = describeBucketMove(todo({ checkAt: TODAY }), 'upcoming', TODAY);
    expect(text).toContain('다시 확인할 날을 지웁니다');
  });

  it('바뀌는 게 없으면 그렇다고 말한다', () => {
    expect(describeBucketMove(todo(), 'triage', TODAY)).toBe('바뀌는 내용이 없습니다.');
  });
});
