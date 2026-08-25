/**
 * 쌤핀 AI 쓰기 — **출결**만 따로 보는 테스트 (2026-08-25)
 *
 * 다른 쓰기 도구는 "스토어 함수가 불렸는가"까지만 본다. 출결은 거기서 끝내면 안 된다 —
 * 잘못 적힌 결석은 나이스를 거쳐 생활기록부까지 따라가고, 선생님이 알아채는 것은
 * 한참 뒤다. 그래서 여기서는 **무엇이 어떤 인자로 불렸는지**와,
 * **못 알아들었을 때 정말 아무것도 안 하는지**를 함께 못 박는다.
 */
import { describe, expect, it } from 'vitest';

import { isWriteProposal, type AssistWriteProposal } from '@domain/entities/AssistWrite';
import type { StudentAttendance } from '@domain/entities/Attendance';
import { buildWriteProposal } from '@usecases/assist/writes/buildWriteProposal';
import type { WriteSources } from '@usecases/assist/writes/writeSources';
import { executeAssistWrite } from '../executeAssistWrite';
import type { WriteDeps } from '../executeAssistWrite';

const SRC: WriteSources = {
  today: '2026-08-25',
  periodTimes: [],
  roster: {
    homeroomClassId: '3-2',
    regularPeriodCount: 7,
    homeroom: [
      { id: 'stu-1', name: '김지훈', studentNumber: 1 },
      { id: 'stu-15', name: '박서연', studentNumber: 15 },
    ],
    teaching: [
      {
        classId: 'c1',
        className: '2학년 5반',
        students: [
          { number: 7, name: '최민호', key: '7' },
          { number: 8, name: '이수현', key: '8' },
        ],
      },
    ],
  },
  todos: [],
  events: [],
  memos: [],
  progress: [],
  classes: [{ id: 'c1', name: '2학년 5반' }],
  bookmarks: [],
  bookmarkGroups: [],
  notebooks: [],
  noteSections: [],
  notePages: [],
  attendance: [],
  rubrics: [],
};

interface UpsertCall {
  readonly classId: string;
  readonly date: string;
  readonly studentNumbers: ReadonlySet<number>;
  readonly recordsByPeriod: ReadonlyMap<number, readonly StudentAttendance[]>;
}
interface BridgeCall {
  readonly className: string;
  readonly date: string;
  readonly recordsByPeriod: ReadonlyMap<number, readonly StudentAttendance[]>;
  readonly students: readonly { readonly id: string }[];
}

function spyDeps(options?: { blocked?: boolean; otherStudentOnPeriod?: number }): {
  deps: WriteDeps;
  upserts: UpsertCall[];
  bridges: BridgeCall[];
} {
  const upserts: UpsertCall[] = [];
  const bridges: BridgeCall[] = [];

  const deps = {
    upsertStudentAttendance: async (params: UpsertCall) => {
      upserts.push(params);
      // 저장이 막힌 상태 — 스토어는 예외가 아니라 null 로 알린다.
      if (options?.blocked) return null;

      // 진짜 스토어처럼 **저장된 전체 목록**을 돌려준다. 다른 교시가 이미 들어 있는
      // 상황을 만들어, 미러가 하루치 전부를 보는지 확인할 수 있게 한다.
      const saved = [...params.recordsByPeriod].map(([period, students]) => ({
        classId: params.classId,
        date: params.date,
        period,
        students,
      }));
      if (options?.otherStudentOnPeriod !== undefined) {
        saved.push({
          classId: params.classId,
          date: params.date,
          period: options.otherStudentOnPeriod,
          students: [{ number: 1, status: 'late' }] as readonly StudentAttendance[],
        });
      }
      return saved;
    },
    bridgeHomeroomAttendance: async (params: BridgeCall) => {
      bridges.push(params);
    },
    homeroomStudents: () => SRC.roster.homeroom,
  } as unknown as WriteDeps;

  return { deps, upserts, bridges };
}

/** 제안까지만. 거절이면 그 사유를 던져 테스트가 이유를 보여 주게 한다. */
function propose(args: object): AssistWriteProposal {
  const outcome = buildWriteProposal('set_attendance', JSON.stringify(args), SRC);
  if (!isWriteProposal(outcome)) throw new Error(`제안이 아니다: ${outcome.reason}`);
  return outcome;
}

/** 거절만. 제안이 만들어지면 그것이 결함이다. */
function reject(args: object): string {
  const outcome = buildWriteProposal('set_attendance', JSON.stringify(args), SRC);
  if (isWriteProposal(outcome)) {
    throw new Error(`거절해야 하는데 제안이 만들어졌다: ${outcome.title}`);
  }
  return outcome.reason;
}

describe('★대상 학생을 어떻게 가리키는가', () => {
  it('번호로 가리키면 그 학생을 찾는다 — "15번"·"15" 를 같게 본다', () => {
    for (const who of ['15번', '15', 15]) {
      const p = propose({ student: who, status: '결석', period: 3 });
      expect(p.values.studentNumber, String(who)).toBe(15);
      expect(p.values.studentName, String(who)).toBe('박서연');
    }
  });

  it('이름으로 가리켜도 찾는다 — 가림막이 별칭을 실제 이름으로 되돌린 뒤의 모습이다', () => {
    const p = propose({ student: '박서연', status: '지각', period: 1 });
    expect(p.values.studentNumber).toBe(15);
  });

  it('★없는 번호면 조용히 넘어가지 않고 한국어로 이유를 말한다', () => {
    const reason = reject({ student: '33번', status: '결석', period: 3 });
    expect(reason).toContain('33번');
    expect(reason).toContain('찾지 못');
    // 짐작으로 다른 학생을 고르지 않았다는 뜻이기도 하다.
    expect(reason).not.toContain('박서연');
  });

  it('★번호로 가리켰는데 없으면 이름으로 다시 찾지 않는다', () => {
    // 1번·15번만 있다. 이름 폴백이 있으면 엉뚱한 학생이 잡힌다.
    const reason = reject({ student: '2번', status: '결석', period: 3 });
    expect(reason).toContain('2번');
  });

  it('없는 이름이면 그 말 그대로 되돌려 준다', () => {
    expect(reject({ student: '홍길동', status: '결석', period: 3 })).toContain('홍길동');
  });
});

describe('★언제·몇 교시인가', () => {
  it('날짜를 안 밝히면 오늘이다', () => {
    expect(propose({ student: '15번', status: '결석', period: 3 }).values.date).toBe('2026-08-25');
  });

  it('담임 학급에서 교시를 안 밝히면 정규 교시 전체다', () => {
    const p = propose({ student: '15번', status: '결석' });
    expect(p.values.periods).toBe('1,2,3,4,5,6,7');
  });

  it('★교과 수업반은 교시를 안 밝히면 되묻는다 — 짐작해서 하루치를 적지 않는다', () => {
    const reason = reject({ student: '7번', status: '결석', className: '2학년 5반' });
    expect(reason).toContain('교시');
  });

  it('조회(0)·종례(9)도 받는다', () => {
    expect(propose({ student: '15번', status: '지각', period: 0 }).values.periods).toBe('0');
    expect(propose({ student: '15번', status: '조퇴', period: 9 }).values.periods).toBe('9');
  });
});

describe('★무엇을 적는가', () => {
  it('알아듣지 못한 처리는 저장하지 않고 되묻는다', () => {
    const reason = reject({ student: '15번', status: '땡땡이', period: 3 });
    expect(reason).toContain('결석');
  });

  it('미리보기에 실제 학생 이름과 처리 내용이 보인다', () => {
    const p = propose({
      student: '15번',
      status: '결석',
      period: 3,
      reason: '질병',
      memo: '감기',
    });
    const shown = p.fields.map((f) => `${f.label}=${f.value}`).join(' | ');
    expect(shown).toContain('박서연');
    expect(shown).toContain('결석');
    expect(shown).toContain('질병');
    expect(shown).toContain('감기');
  });

  it('사유 목록에 없는 말은 버린다 — 나이스가 모르는 사유가 저장되면 안 된다', () => {
    const p = propose({ student: '15번', status: '결석', period: 3, reason: '그냥' });
    expect(p.values.reason).toBeUndefined();
  });
});

describe('★이미 적혀 있는 것을 덮어쓸 때 — 조용히 덮지 않는다', () => {
  /** 3교시에 이미 결석(질병)이 적혀 있는 상황 */
  const WRITTEN: WriteSources = {
    ...SRC,
    attendance: [
      {
        classId: '3-2',
        date: '2026-08-25',
        period: 3,
        students: [{ number: 15, status: 'absent', reason: '질병' }],
      },
    ],
  };

  const proposeOn = (src: WriteSources, args: object) =>
    buildWriteProposal('set_attendance', JSON.stringify(args), src);

  it('★지금 무엇으로 돼 있는지 미리보기에 뜬다', () => {
    const outcome = proposeOn(WRITTEN, { student: '15번', status: '지각', period: 3 });
    if (!isWriteProposal(outcome)) throw new Error(`제안이어야 한다: ${outcome.reason}`);

    const shown = outcome.fields.map((f) => `${f.label}=${f.value}`).join(' | ');
    expect(shown).toContain('지금=결석 (질병)');
    expect(shown).toContain('처리=지각');
  });

  it('빈 칸이면 「지금」 줄이 아예 안 뜬다 — 흔한 경우에 줄이 늘지 않는다', () => {
    const outcome = proposeOn(WRITTEN, { student: '15번', status: '결석', period: 5 });
    if (!isWriteProposal(outcome)) throw new Error('제안이어야 한다');
    expect(outcome.fields.some((f) => f.label === '지금')).toBe(false);
  });

  it('★이미 똑같으면 헛되이 쓰지 않는다', () => {
    const outcome = proposeOn(WRITTEN, {
      student: '15번',
      status: '결석',
      period: 3,
      reason: '질병',
    });
    expect(isWriteProposal(outcome)).toBe(false);
    if (isWriteProposal(outcome)) return;
    expect(outcome.reason).toContain('이미');
    expect(outcome.reason).toContain('결석');
  });

  it('사유만 달라도 바꿔 준다 — 같다고 뭉뚱그리지 않는다', () => {
    const outcome = proposeOn(WRITTEN, {
      student: '15번',
      status: '결석',
      period: 3,
      reason: '미인정',
    });
    expect(isWriteProposal(outcome)).toBe(true);
  });

  it('교시마다 다르면 그 사실을 말한다 — 하나로 뭉뚱그리면 다시 거짓말이 된다', () => {
    const mixed: WriteSources = {
      ...SRC,
      roster: { ...SRC.roster, regularPeriodCount: 2 },
      attendance: [
        {
          classId: '3-2',
          date: '2026-08-25',
          period: 1,
          students: [{ number: 15, status: 'absent' }],
        },
        {
          classId: '3-2',
          date: '2026-08-25',
          period: 2,
          students: [{ number: 15, status: 'late' }],
        },
      ],
    };
    const outcome = proposeOn(mixed, { student: '15번', status: '조퇴' });
    if (!isWriteProposal(outcome)) throw new Error('제안이어야 한다');
    const now = outcome.fields.find((f) => f.label === '지금')?.value ?? '';
    expect(now).toContain('교시마다 달라요');
    expect(now).toContain('결석');
    expect(now).toContain('지각');
  });

  it('일부 교시만 적혀 있으면 "전부 그렇다"고 말하지 않는다', () => {
    // 하루 전체(1~7교시)를 적는데 3교시에만 결석이 있다.
    const outcome = proposeOn(WRITTEN, { student: '15번', status: '지각' });
    if (!isWriteProposal(outcome)) throw new Error('제안이어야 한다');
    const now = outcome.fields.find((f) => f.label === '지금')?.value ?? '';
    expect(now).toBe('일부 교시만 결석 (질병)');
  });

  it('다른 학생 것을 내 것으로 착각하지 않는다', () => {
    const other: WriteSources = {
      ...SRC,
      attendance: [
        {
          classId: '3-2',
          date: '2026-08-25',
          period: 3,
          students: [{ number: 1, status: 'absent' }],
        },
      ],
    };
    const outcome = proposeOn(other, { student: '15번', status: '지각', period: 3 });
    if (!isWriteProposal(outcome)) throw new Error('제안이어야 한다');
    expect(outcome.fields.some((f) => f.label === '지금')).toBe(false);
  });

  it('다른 날짜 것을 오늘 것으로 착각하지 않는다', () => {
    const other: WriteSources = {
      ...SRC,
      attendance: [
        {
          classId: '3-2',
          date: '2026-08-24',
          period: 3,
          students: [{ number: 15, status: 'absent' }],
        },
      ],
    };
    const outcome = proposeOn(other, { student: '15번', status: '지각', period: 3 });
    if (!isWriteProposal(outcome)) throw new Error('제안이어야 한다');
    expect(outcome.fields.some((f) => f.label === '지금')).toBe(false);
  });
});

describe('★실행 — 기존 스토어 함수를 그대로 부른다', () => {
  it('출결부에 부분 갱신으로 넘긴다(그 학생·그 교시만)', async () => {
    const { deps, upserts } = spyDeps();
    const result = await executeAssistWrite(
      propose({ student: '15번', status: '결석', period: 3, reason: '질병', memo: '감기' }),
      deps,
    );

    expect(result.ok).toBe(true);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]!.classId).toBe('3-2');
    expect(upserts[0]!.date).toBe('2026-08-25');
    expect([...upserts[0]!.studentNumbers]).toEqual([15]);
    expect([...upserts[0]!.recordsByPeriod.keys()]).toEqual([3]);
    expect(upserts[0]!.recordsByPeriod.get(3)).toEqual([
      { number: 15, status: 'absent', reason: '질병', memo: '감기' },
    ]);
  });

  it('담임 학급이면 학생 기록에도 같은 사실을 남긴다', async () => {
    const { deps, bridges } = spyDeps();
    await executeAssistWrite(propose({ student: '15번', status: '결석', period: 3 }), deps);

    expect(bridges).toHaveLength(1);
    expect(bridges[0]!.className).toBe('3-2');
    expect(bridges[0]!.date).toBe('2026-08-25');
    expect(bridges[0]!.students).toHaveLength(2);
  });

  it('★미러에는 하루치 전부가 간다 — 바꾼 교시만 넘기면 나머지가 기록에서 사라진다', async () => {
    // 저장 결과에 5교시가 이미 들어 있는 상황.
    const { deps, bridges } = spyDeps({ otherStudentOnPeriod: 5 });
    await executeAssistWrite(propose({ student: '15번', status: '결석', period: 3 }), deps);

    expect([...bridges[0]!.recordsByPeriod.keys()].sort((a, b) => a - b)).toEqual([3, 5]);
  });

  it('교과 수업반은 학생 기록 미러를 하지 않는다 — 담임 출결이 아니다', async () => {
    const { deps, upserts, bridges } = spyDeps();
    await executeAssistWrite(
      propose({ student: '7번', status: '결석', className: '2학년 5반', period: 2 }),
      deps,
    );

    expect(upserts[0]!.classId).toBe('c1');
    expect(bridges).toEqual([]);
  });

  it('★저장이 막히면 "적었어요"라고 말하지 않는다', async () => {
    const { deps, bridges } = spyDeps({ blocked: true });
    const result = await executeAssistWrite(
      propose({ student: '15번', status: '결석', period: 3 }),
      deps,
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain('저장하지 못');
    // 출결부에 안 들어간 사실을 학생 기록에만 남기면 두 곳이 어긋난다.
    expect(bridges).toEqual([]);
  });
});
