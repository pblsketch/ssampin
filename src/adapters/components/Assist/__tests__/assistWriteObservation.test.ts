/**
 * 쌤핀 AI 쓰기 — **관찰 기록**만 따로 보는 테스트 (2026-08-25)
 *
 * ★여기서 지켜야 할 것 두 가지.
 *   ① 내용은 **선생님이 말한 문장**이 그대로 저장된다. 모델이 다듬거나 늘리지 않는다.
 *   ② 학생을 가리키는 키가 화면이 쓰는 키와 **같아야 한다**. 한 글자라도 다르면
 *      저장은 되는데 그 학생 화면에서만 안 보인다 — 가장 알아채기 어려운 실패다.
 */
import { describe, expect, it } from 'vitest';

import { isWriteProposal, type AssistWriteProposal } from '@domain/entities/AssistWrite';
import { studentKey } from '@domain/entities/TeachingClass';
import { buildWriteProposal } from '@usecases/assist/writes/buildWriteProposal';
import type { WriteSources } from '@usecases/assist/writes/writeSources';
import { executeAssistWrite } from '../executeAssistWrite';
import type { WriteDeps } from '../executeAssistWrite';

/** 다른 반 학생이 섞인 수업반 — 키가 번호만이 아니라 `학년-반-번호` 가 되는 경우 */
const MIXED = { number: 12, name: '정하늘', grade: 2, classNum: 4 };

const SRC: WriteSources = {
  today: '2026-08-25',
  periodTimes: [],
  roster: {
    homeroomClassId: '3-2',
    regularPeriodCount: 7,
    homeroom: [{ id: 'stu-1', name: '김지훈', studentNumber: 1 }],
    teaching: [
      {
        classId: 'c1',
        className: '2학년 5반',
        students: [
          { number: 7, name: '최민호', key: '7' },
          { number: 12, name: MIXED.name, key: studentKey(MIXED) },
        ],
      },
      {
        classId: 'c2',
        className: '3학년 1반',
        students: [{ number: 3, name: '한지우', key: '3' }],
      },
    ],
  },
  todos: [],
  events: [],
  memos: [],
  progress: [],
  classes: [
    { id: 'c1', name: '2학년 5반' },
    { id: 'c2', name: '3학년 1반' },
  ],
  bookmarks: [],
  bookmarkGroups: [],
  notebooks: [],
  noteSections: [],
  notePages: [],
  attendance: [],
  rubrics: [],
};

interface ObservationCall {
  readonly studentId: string;
  readonly classId: string;
  readonly date: string;
  readonly content: string;
  readonly tags: string[];
  readonly category?: string;
}

function spyDeps(): { deps: WriteDeps; saved: ObservationCall[] } {
  const saved: ObservationCall[] = [];
  const deps = {
    addObservation: async (params: ObservationCall) => {
      saved.push(params);
      return 'obs-new';
    },
  } as unknown as WriteDeps;
  return { deps, saved };
}

function propose(args: object): AssistWriteProposal {
  const outcome = buildWriteProposal('add_observation', JSON.stringify(args), SRC);
  if (!isWriteProposal(outcome)) throw new Error(`제안이 아니다: ${outcome.reason}`);
  return outcome;
}

function reject(args: object): string {
  const outcome = buildWriteProposal('add_observation', JSON.stringify(args), SRC);
  if (isWriteProposal(outcome)) {
    throw new Error(`거절해야 하는데 제안이 만들어졌다: ${outcome.title}`);
  }
  return outcome.reason;
}

const CONTENT = '모둠 토의에서 다른 의견을 먼저 듣고 정리했다';

describe('★어느 반, 누구인가', () => {
  it('반이 여러 개인데 안 밝히면 고르지 않고 되묻는다', () => {
    const reason = reject({ student: '7번', content: CONTENT });
    expect(reason).toContain('수업반');
    expect(reason).toContain('2학년 5반');
  });

  it('반 이름을 밝히면 그 반에서 찾는다', () => {
    const p = propose({ student: '3번', content: CONTENT, className: '3학년 1반' });
    expect(p.values.classId).toBe('c2');
    expect(p.values.studentName).toBe('한지우');
  });

  it('★없는 번호면 조용히 넘어가지 않고 한국어로 이유를 말한다', () => {
    const reason = reject({ student: '99번', content: CONTENT, className: '2학년 5반' });
    expect(reason).toContain('99번');
    expect(reason).toContain('찾지 못');
  });

  it('담임 학급 학생 이름으로는 찾히지 않는다 — 관찰은 수업반 기능이다', () => {
    // 김지훈은 담임 학급에만 있다. 여기서 잡히면 저장 자리가 어긋난다.
    expect(reject({ student: '김지훈', content: CONTENT, className: '2학년 5반' })).toContain(
      '김지훈',
    );
  });
});

describe('★무엇이 저장되는가', () => {
  it('내용이 없으면 만들지 않는다 — 모델이 관찰문을 지어내지 않는다', () => {
    expect(reject({ student: '7번', className: '2학년 5반' })).toContain('관찰 내용');
  });

  it('미리보기에 실제 학생 이름과 기록 내용이 보인다', () => {
    const p = propose({
      student: '7번',
      content: CONTENT,
      className: '2학년 5반',
      category: '수업 관찰',
      tag: '학습태도',
    });
    const shown = p.fields.map((f) => `${f.label}=${f.value}`).join(' | ');
    expect(shown).toContain('최민호');
    expect(shown).toContain(CONTENT);
    expect(shown).toContain('수업 관찰');
    expect(shown).toContain('학습태도');
  });

  it('목록에 없는 분류·태그는 버린다', () => {
    const p = propose({
      student: '7번',
      content: CONTENT,
      className: '2학년 5반',
      category: '아무거나',
      tag: '아무거나',
    });
    expect(p.values.category).toBeUndefined();
    expect(p.values.tag).toBeUndefined();
  });
});

describe('★실행 — 기존 스토어 함수를 그대로 부른다', () => {
  it('선생님이 말한 문장이 한 글자도 안 바뀌고 저장된다', async () => {
    const { deps, saved } = spyDeps();
    const result = await executeAssistWrite(
      propose({ student: '7번', content: CONTENT, className: '2학년 5반', tag: '학습태도' }),
      deps,
    );

    expect(result.ok).toBe(true);
    expect(saved).toHaveLength(1);
    expect(saved[0]!.content).toBe(CONTENT);
    expect(saved[0]!.classId).toBe('c1');
    expect(saved[0]!.date).toBe('2026-08-25');
    expect(saved[0]!.tags).toEqual(['학습태도']);
  });

  it('★학생 키는 화면이 쓰는 것과 같다 — 다른 반 학생이 섞인 수업반에서도', async () => {
    const { deps, saved } = spyDeps();
    await executeAssistWrite(
      propose({ student: '12번', content: CONTENT, className: '2학년 5반' }),
      deps,
    );

    // 번호만("12")이 아니라 학년-반-번호 형태여야 한다.
    expect(saved[0]!.studentId).toBe(studentKey(MIXED));
    expect(saved[0]!.studentId).not.toBe('12');
  });

  it('태그를 안 골랐으면 빈 배열로 넘긴다 — 화면과 같은 모양', async () => {
    const { deps, saved } = spyDeps();
    await executeAssistWrite(
      propose({ student: '7번', content: CONTENT, className: '2학년 5반' }),
      deps,
    );

    expect(saved[0]!.tags).toEqual([]);
    expect(saved[0]!.category).toBeUndefined();
  });
});
