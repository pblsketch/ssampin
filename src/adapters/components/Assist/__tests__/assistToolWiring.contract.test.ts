/**
 * 쌤핀 AI — 레지스트리 ↔ 실행기 **배선** 계약 테스트 (2026-08-24 UltraQA P2)
 *
 * 레지스트리 계약 테스트(`domain/services/__tests__/assistToolRegistry.contract.test.ts`)는
 * "등록된 도구가 규칙을 지키는가"만 본다. 이 파일은 그 다음 층을 본다 —
 * **등록은 했는데 실행기에 분기를 잊은** 사고 유형을 자동으로 잡는다.
 * 도구를 레지스트리에 더하면 모델에게는 보이는데, 실행기가 모르면 조용히 무시되거나
 * "아직 실행할 수 없어요"가 뜬다. 그 어긋남은 사람이 기억해서 지킬 수 없다.
 *
 * ★domain 테스트에 두지 않은 이유: 실행기(executeAssistTool·executeAssistWrite)는
 * adapters 에 있고, domain 은 바깥 레이어를 import 할 수 없다(아키텍처 규칙).
 * 배선은 두 층 사이의 사실이므로 바깥쪽(adapters)에서 대조한다.
 */
import { describe, expect, it } from 'vitest';

import { ASSIST_READ_TOOLS, ASSIST_WRITE_TOOLS } from '@domain/services/assistToolRegistry';
import { isWriteTool } from '@usecases/assist/writes/buildWriteProposal';
import { executeAssistTool, type ExecutorSources } from '../AssistDockContainer';
import { NOT_WIRED_MESSAGE, executeAssistWrite } from '../executeAssistWrite';
import type { WriteDeps } from '../executeAssistWrite';

/**
 * 읽기 실행기에 먹일 최소 자료. 도구가 배선돼 있으면 데이터가 적어도 카드는 나온다 —
 * 여기서 보는 것은 결과의 내용이 아니라 **분기의 존재**다.
 */
const SRC: ExecutorSources = {
  students: [{ name: '김지훈', studentNumber: 1 }],
  classes: [{ id: 'c1', name: '3학년 2반', grade: 3, students: [{}, {}] }],
  todos: [{ text: '결재 올리기', dueDate: '2026-08-25', completed: false }],
  records: [{ studentId: 's1', category: 'observation', subcategory: '학습', date: '2026-08-10' }],
  meals: [
    { date: '20260824', mealType: '중식', dishes: [{ name: '차조밥' }], calorie: '690 Kcal' },
  ],
  events: [],
  ddays: [{ title: '수능', targetDate: '2026-11-19', pinned: true }],
  getDaySchedule: () => [],
  progress: [],
  memos: [],
  notes: { notebooks: [], sections: [], pages: [] },
  bookmarks: [],
  bookmarkGroups: [],
  classAttendance: [],
  gradePlans: [],
  gradeScores: [],
  seating: { rows: 1, cols: 2, seats: [['stu-1', null]], layout: 'grid' },
  rubrics: [],
  rubricGradings: [],
};

/**
 * 쓰기 실행기의 분기 존재만 확인할 때 쓰는 의존 뭉치.
 * 값이 빈 제안은 모든 분기에서 스토어를 부르기 전에 돌아가야 하므로,
 * 무엇이든 불리면 그 자체가 결함이다 — 불리는 즉시 테스트를 터뜨린다.
 */
const UNTOUCHABLE_DEPS = new Proxy(
  {},
  {
    get: (_target, prop) => () => {
      throw new Error(`빈 제안이 스토어를 불렀다: ${String(prop)}`);
    },
  },
) as WriteDeps;

/** 값이 빈 최소 제안 — 분기가 있으면 "대상을 찾지 못해…"로, 없으면 NOT_WIRED 로 답한다 */
function emptyProposal(tool: string) {
  return { tool, action: 'create' as const, title: '', fields: [], values: {} };
}

describe('★배선 ① — 모든 읽기 도구가 실행기에서 카드를 만든다', () => {
  it.each(ASSIST_READ_TOOLS.map((tool) => [tool.id] as const))('%s', (id) => {
    // null 은 "실행기가 이 도구를 모른다"는 뜻이다 — 등록만 하고 배선을 잊은 상태.
    expect(executeAssistTool(id, '{}', SRC)).not.toBeNull();
  });

  it('쓰기 도구는 읽기 실행기가 다루지 않는다 — 스토어(ask)가 위에서 이미 갈랐다', () => {
    for (const tool of ASSIST_WRITE_TOOLS) {
      expect(executeAssistTool(tool.id, '{}', SRC), tool.id).toBeNull();
    }
  });
});

describe('★배선 ② — 쓰기 도구 id 집합 = 쓰기 실행기 case 집합', () => {
  it.each(ASSIST_WRITE_TOOLS.map((tool) => [tool.id] as const))(
    '%s — 실행기에 분기가 있다',
    async (id) => {
      const result = await executeAssistWrite(emptyProposal(id), UNTOUCHABLE_DEPS);
      // NOT_WIRED 는 default 분기의 답이다 — 등록만 하고 실행기를 잊었다는 뜻.
      expect(result.message).not.toBe(NOT_WIRED_MESSAGE);
    },
  );

  it('읽기 도구에는 쓰기 분기가 없다 — 읽기가 몰래 저장 경로를 얻으면 안 된다', async () => {
    for (const tool of ASSIST_READ_TOOLS) {
      const result = await executeAssistWrite(emptyProposal(tool.id), UNTOUCHABLE_DEPS);
      expect(result.message, tool.id).toBe(NOT_WIRED_MESSAGE);
    }
  });

  it('레지스트리에 없는 이름은 default 분기로 떨어져 사실대로 알린다', async () => {
    const result = await executeAssistWrite(emptyProposal('made_up_tool'), UNTOUCHABLE_DEPS);
    expect(result.ok).toBe(false);
    expect(result.message).toBe(NOT_WIRED_MESSAGE);
  });
});

describe('★배선 ③ — 제안 조립기의 쓰기 판정이 레지스트리와 같은 금을 긋는다', () => {
  // isWriteTool 이 레지스트리와 어긋나면 두 방향으로 사고가 난다:
  // 쓰기를 놓치면 실행기(읽기)로 새고, 읽기를 쓰기로 오판하면 제안 카드가 헛돈다.
  it('모든 쓰기 도구를 쓰기로 판정한다', () => {
    for (const tool of ASSIST_WRITE_TOOLS) {
      expect(isWriteTool(tool.id), tool.id).toBe(true);
    }
  });

  it('읽기 도구를 쓰기로 판정하지 않는다', () => {
    for (const tool of ASSIST_READ_TOOLS) {
      expect(isWriteTool(tool.id), tool.id).toBe(false);
    }
  });
});
