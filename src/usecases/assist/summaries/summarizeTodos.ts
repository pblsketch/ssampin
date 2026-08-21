/**
 * summarizeTodos가 필요로 하는 최소 필드만 갖는 로컬 입력 타입.
 * (adapters 레이어의 Todo 전체 — subTasks, googleTaskId 등 —는 받지 않고
 * 모델에 보낼 최소 필드만 받는다.)
 *
 * ⚠️ title 은 자유 입력이라 학생 실명이 들어갈 수 있다. 모델로 보내기 전 assertNoPii(그물 ③) 를 반드시 통과시켜야 한다.
 */
export interface TodoLike {
  readonly text: string;
  readonly dueDate?: string;
  readonly completed: boolean;
}

export interface SummarizeTodosOptions {
  /** 완료된 할 일도 포함할지 (기본 false — 미완료만) */
  readonly includeCompleted?: boolean;
}

export interface TodosSummary {
  readonly items: readonly {
    readonly title: string;
    readonly due: string | null;
    readonly done: boolean;
  }[];
}

/**
 * 할 일 목록을 모델에 보낼 최소 표시 정보로 변환한다(순수 함수).
 *
 * ⚠️ title 은 자유 입력이라 학생 실명이 들어갈 수 있다. 모델로 보내기 전 assertNoPii(그물 ③) 를 반드시 통과시켜야 한다.
 * 이 함수는 title을 가공하지 않고 그대로 보존한다 — 가공(마스킹 등)은 그물 ③의 책임이다.
 */
export function summarizeTodos(
  todos: readonly TodoLike[],
  opts: SummarizeTodosOptions = {},
): TodosSummary {
  const includeCompleted = opts.includeCompleted ?? false;
  const filtered = includeCompleted ? todos : todos.filter((t) => !t.completed);

  return {
    items: filtered.map((t) => ({
      title: t.text,
      due: t.dueDate ?? null,
      done: t.completed,
    })),
  };
}
