/**
 * 쌤핀 AI 쓰기 — **루브릭 채점**만 따로 보는 테스트 (2026-08-25)
 *
 * ★이 도구의 위험은 하나로 압축된다: 스토어 함수가 **토글**이라는 것.
 * 제안을 만든 뒤 선생님이 화면에서 같은 칸을 직접 눌렀으면, 그대로 토글할 때
 * 체크가 **풀린다** — 그러고도 앱은 "채점했어요"라고 말한다.
 * 그래서 실행 직전에 지금 상태를 다시 보는지를 여기서 못 박는다(`complete_todo` 선례).
 */
import { describe, expect, it } from 'vitest';

import { isWriteProposal, type AssistWriteProposal } from '@domain/entities/AssistWrite';
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
    homeroom: [],
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
  rubrics: [
    {
      id: 'rb1',
      classId: 'c1',
      title: '토론 평가',
      criteria: [
        {
          id: 'cr1',
          name: '주장의 명확성',
          order: 0,
          levels: [
            { id: 'lv-good', name: '잘함', score: 3 },
            { id: 'lv-mid', name: '보통', score: 2 },
          ],
        },
        {
          id: 'cr2',
          name: '근거의 타당성',
          order: 1,
          levels: [
            { id: 'lv2-top', name: '탁월함', score: 5 },
            { id: 'lv2-good', name: '잘함', score: 3 },
          ],
        },
      ],
    },
  ],
};

interface ToggleCall {
  readonly rubricId: string;
  readonly classId: string;
  readonly studentId: string;
  readonly criterionId: string;
  readonly levelId: string;
}

function spyDeps(now?: { levelId?: string; absent: boolean } | undefined): {
  deps: WriteDeps;
  toggles: ToggleCall[];
} {
  const toggles: ToggleCall[] = [];
  const deps = {
    toggleRubricMark: async (
      rubricId: string,
      classId: string,
      studentId: string,
      criterionId: string,
      levelId: string,
    ) => {
      toggles.push({ rubricId, classId, studentId, criterionId, levelId });
    },
    getRubricMark: () => now,
  } as unknown as WriteDeps;
  return { deps, toggles };
}

function propose(args: object): AssistWriteProposal {
  const outcome = buildWriteProposal('set_rubric_mark', JSON.stringify(args), SRC);
  if (!isWriteProposal(outcome)) throw new Error(`제안이 아니다: ${outcome.reason}`);
  return outcome;
}

function reject(args: object): string {
  const outcome = buildWriteProposal('set_rubric_mark', JSON.stringify(args), SRC);
  if (isWriteProposal(outcome)) {
    throw new Error(`거절해야 하는데 제안이 만들어졌다: ${outcome.title}`);
  }
  return outcome.reason;
}

const OK = { student: '7번', rubric: '토론 평가', criterion: '주장의 명확성', level: '잘함' };

describe('★어느 칸인가', () => {
  it('선생님이 말한 이름으로 표·요소·수준을 찾는다', () => {
    const p = propose(OK);
    expect(p.values.rubricId).toBe('rb1');
    expect(p.values.criterionId).toBe('cr1');
    expect(p.values.levelId).toBe('lv-good');
    // 반은 표가 이미 알고 있다 — 선생님이 따로 말하지 않아도 된다.
    expect(p.values.classId).toBe('c1');
    expect(p.values.studentKey).toBe('7');
  });

  it('★같은 이름의 수준이 다른 요소에 있어도 그 요소 안에서만 찾는다', () => {
    // "잘함"은 두 요소에 다 있다. 요소를 먼저 좁히지 않으면 엉뚱한 칸이 체크된다.
    const p = propose({ ...OK, criterion: '근거의 타당성' });
    expect(p.values.criterionId).toBe('cr2');
    expect(p.values.levelId).toBe('lv2-good');
  });

  it('없는 평가 기준표는 한국어로 이유를 말한다', () => {
    expect(reject({ ...OK, rubric: '없는 표' })).toContain('없는 표');
  });

  it('없는 평가 요소는 한국어로 이유를 말한다', () => {
    expect(reject({ ...OK, criterion: '없는 요소' })).toContain('없는 요소');
  });

  it('없는 수준은 한국어로 이유를 말한다', () => {
    expect(reject({ ...OK, level: '최고' })).toContain('최고');
  });

  it('없는 학생은 한국어로 이유를 말한다', () => {
    expect(reject({ ...OK, student: '99번' })).toContain('99번');
  });

  it('미리보기에 학생 이름·평가 항목·수준이 보인다', () => {
    const shown = propose(OK)
      .fields.map((f) => `${f.label}=${f.value}`)
      .join(' | ');
    expect(shown).toContain('최민호');
    expect(shown).toContain('주장의 명확성');
    expect(shown).toContain('잘함');
  });
});

describe('★"만점으로 표시해줘" — 평가 요소를 하나씩 집지 않아도 된다 (2026-08-25 실사용)', () => {
  /**
   * 신고: "사회 의제 다룬 매체 비평에서 7번 학생 만점으로 표시해줘" 가 막혔다.
   * criterion 이 필수였고 "만점"은 수준 이름도 아니라, **두 이유로** 거절됐다.
   * 만점은 애초에 "요소를 하나 고르는 말"이 아니다.
   */
  it('요소를 안 밝히고 "만점"이라고 하면 요소 전부가 최고 수준으로 잡힌다', () => {
    const p = propose({ student: '7번', rubric: '토론 평가', level: '만점' });

    // cr1 은 잘함(3)이 최고, cr2 는 탁월함(5)이 최고 — **배점으로** 정한다
    expect(p.marks).toEqual([
      {
        criterionId: 'cr1',
        criterionName: '주장의 명확성',
        levelId: 'lv-good',
        levelName: '잘함',
      },
      {
        criterionId: 'cr2',
        criterionName: '근거의 타당성',
        levelId: 'lv2-top',
        levelName: '탁월함',
      },
    ]);
  });

  it('미리보기에 어느 요소가 어느 수준인지 전부 보인다 — 개수만 적으면 [실행]이 요식이 된다', () => {
    const shown = propose({ student: '7번', rubric: '토론 평가', level: '만점' })
      .fields.map((f) => `${f.label}=${f.value}`)
      .join(' | ');
    expect(shown).toContain('주장의 명확성=잘함');
    expect(shown).toContain('근거의 타당성=탁월함');
  });

  it('요소를 안 밝히고 실제 수준 이름을 대면 요소마다 같은 이름의 수준을 찾는다', () => {
    const p = propose({ student: '7번', rubric: '토론 평가', level: '잘함' });
    expect(p.marks?.map((m) => m.levelId)).toEqual(['lv-good', 'lv2-good']);
  });

  it('★한 요소에만 없는 수준이면 일부만 찍지 않고 통째로 거절한다', () => {
    // '보통'은 cr1 에만 있다. 절반만 채워진 채점표는 무엇이 빠졌는지 알 수 없다.
    const reason = reject({ student: '7번', rubric: '토론 평가', level: '보통' });
    expect(reason).toContain('근거의 타당성');
    expect(reason).toContain('아무것도 바꾸지 않았어요');
  });

  it('요소를 밝히면 예전처럼 그 한 칸만 잡는다', () => {
    const p = propose({
      student: '7번',
      rubric: '토론 평가',
      criterion: '주장의 명확성',
      level: '만점',
    });
    expect(p.marks).toHaveLength(1);
    expect(p.values.levelId).toBe('lv-good');
  });

  it('★선생님이 붙인 수준 이름이 "만점"이면 그 수준이 이긴다 — 짐작보다 이름이 먼저다', () => {
    const withReal = {
      ...SRC,
      rubrics: [
        {
          id: 'rb1',
          classId: 'c1',
          title: '토론 평가',
          criteria: [
            {
              id: 'cr1',
              name: '주장의 명확성',
              order: 0,
              levels: [
                { id: 'lv-top', name: '탁월함', score: 5 },
                { id: 'lv-manjeom', name: '만점', score: 1 },
              ],
            },
          ],
        },
      ],
    };
    const outcome = buildWriteProposal(
      'set_rubric_mark',
      JSON.stringify({ student: '7번', rubric: '토론 평가', level: '만점' }),
      withReal,
    );
    if (!isWriteProposal(outcome)) throw new Error(outcome.reason);
    // 배점은 1점이라 '최고'가 아니지만, 이름이 맞으므로 이쪽이다
    expect(outcome.values.levelId).toBe('lv-manjeom');
  });
});

describe('★만점 실행 — 여러 칸을 한 번에', () => {
  it('요소마다 토글을 부르고, 몇 개를 바꿨는지 말한다', async () => {
    const { deps, toggles } = spyDeps({ absent: false });
    const result = await executeAssistWrite(
      propose({ student: '7번', rubric: '토론 평가', level: '만점' }),
      deps,
    );

    expect(result.ok).toBe(true);
    expect(toggles.map((t) => t.criterionId)).toEqual(['cr1', 'cr2']);
    expect(result.message).toContain('2개 요소');
  });

  it('★이미 그렇게 돼 있는 칸은 다시 누르지 않는다 — 토글이라 체크가 풀린다', async () => {
    // 모든 칸이 이미 'lv-good' 이라고 답하는 가짜: cr1 은 그대로 두고 cr2 만 바뀐다
    const { deps, toggles } = spyDeps({ absent: false, levelId: 'lv-good' });
    const result = await executeAssistWrite(
      propose({ student: '7번', rubric: '토론 평가', level: '만점' }),
      deps,
    );

    expect(toggles.map((t) => t.criterionId)).toEqual(['cr2']);
    expect(result.message).toContain('이미');
  });

  it('결시 학생은 한 번만 말하고 아무것도 찍지 않는다', async () => {
    const { deps, toggles } = spyDeps({ absent: true });
    const result = await executeAssistWrite(
      propose({ student: '7번', rubric: '토론 평가', level: '만점' }),
      deps,
    );

    expect(result.ok).toBe(false);
    expect(toggles).toHaveLength(0);
    expect(result.message).toContain('결시');
  });
});

describe('★토글이라는 사실을 실행기가 안다', () => {
  it('아직 아무것도 없으면 그대로 체크한다', async () => {
    const { deps, toggles } = spyDeps({ absent: false });
    const result = await executeAssistWrite(propose(OK), deps);

    expect(result.ok).toBe(true);
    expect(toggles).toEqual([
      {
        rubricId: 'rb1',
        classId: 'c1',
        studentId: '7',
        criterionId: 'cr1',
        levelId: 'lv-good',
      },
    ]);
  });

  it('다른 수준이 체크돼 있으면 바꿔 준다', async () => {
    const { deps, toggles } = spyDeps({ levelId: 'lv-mid', absent: false });
    const result = await executeAssistWrite(propose(OK), deps);

    expect(result.ok).toBe(true);
    expect(toggles).toHaveLength(1);
  });

  it('★이미 그 수준이면 부르지 않는다 — 그대로 누르면 체크가 풀린다', async () => {
    const { deps, toggles } = spyDeps({ levelId: 'lv-good', absent: false });
    const result = await executeAssistWrite(propose(OK), deps);

    expect(toggles).toEqual([]);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('이미');
    expect(result.message).toContain('잘함');
  });

  it('★결시 학생은 스토어가 조용히 무시한다 — 그 침묵을 성공으로 말하지 않는다', async () => {
    const { deps, toggles } = spyDeps({ absent: true });
    const result = await executeAssistWrite(propose(OK), deps);

    expect(toggles).toEqual([]);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('결시');
  });
});
