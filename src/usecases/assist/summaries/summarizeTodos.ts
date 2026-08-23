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
  /**
   * 오늘 날짜(YYYY-MM-DD). 주면 각 항목에 `overdue`(기한 지남)를 계산해 붙인다.
   *
   * 모델은 오늘이 며칠인지 모른다 — 실제로 8/19 가 지난 기한인데 "기한이 남아
   * 있습니다"라고 답했다(2026-08-23 오너 신고). 날짜 판단을 모델 추측에 맡기지
   * 않고 여기서 계산해 사실로 보낸다. YYYY-MM-DD 는 문자열 비교가 곧 날짜 비교다.
   */
  readonly today?: string;
}

export interface TodosSummary {
  readonly items: readonly {
    readonly title: string;
    readonly due: string | null;
    readonly done: boolean;
    /** 기한이 오늘보다 앞인가. `today` 옵션을 줄 때만 채워진다 */
    readonly overdue: boolean;
  }[];
  /** 미완료 건수 — 카드와 모델이 같은 숫자를 본다 */
  readonly undone: number;
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

  const items = filtered.map((t) => ({
    title: t.text,
    due: t.dueDate ?? null,
    done: t.completed,
    overdue:
      opts.today !== undefined && t.dueDate !== undefined && !t.completed && t.dueDate < opts.today,
  }));

  return { items, undone: items.filter((t) => !t.done).length };
}
