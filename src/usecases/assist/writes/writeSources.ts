/**
 * 쌤핀 AI 쓰기 — 제안을 만들 때 보는 앱 데이터 (순수 타입)
 *
 * ★읽기 쪽 요약 함수들과 **일부러 다른 모양**이다. 읽기는 식별자를 담지 않는 것이
 * 목표였지만(모델에게 나가므로), 쓰기 제안은 "어떤 항목을 고칠 것인가"를 정해야 해서
 * 식별자가 꼭 필요하다.
 *
 * ★그 식별자는 **모델에게 한 번도 나가지 않는다.** 여기서 만들어진 `targetId` 는
 * 제안 객체 안에만 살고, 화면에는 원문만 보이며, 실행할 때 스토어로 들어갈 뿐이다.
 */

import type { PeriodTime } from '@domain/valueObjects/PeriodTime';

export interface WriteSources {
  /** 오늘(YYYY-MM-DD). 기본 날짜와 미리보기 문구의 기준 */
  readonly today: string;
  /**
   * 교시 이름 표. **미리보기에 "3교시"를 직접 만들지 않기 위해** 필요하다.
   *
   * 선생님이 교시에 이름을 붙였으면("창체", "아침 자습") 그 이름으로 보여야 한다.
   * 화면마다 교시 라벨을 손으로 만들어 쓰다가 붙인 이름이 그 화면에서만 무시된 전례가
   * 있어(50곳 넘게 흩어져 있었다) 저장소에 메타 테스트까지 있다.
   * 정본은 `domain/rules/periodLabel` 의 `resolvePeriodLabel` 이다.
   */
  readonly periodTimes: readonly PeriodTime[];
  readonly todos: readonly {
    readonly id: string;
    readonly text: string;
    readonly completed: boolean;
    readonly dueDate?: string;
  }[];
  readonly events: readonly {
    readonly id: string;
    readonly title: string;
    readonly date: string;
    readonly time?: string;
    readonly location?: string;
  }[];
  readonly memos: readonly {
    readonly id: string;
    readonly content: string;
  }[];
  readonly progress: readonly {
    readonly id: string;
    readonly classId: string;
    readonly date: string;
    readonly period: number;
    readonly unit: string;
    readonly lesson: string;
    readonly status: string;
    readonly note: string;
  }[];
  readonly classes: readonly { readonly id: string; readonly name: string }[];
  readonly bookmarks: readonly {
    readonly id: string;
    readonly name: string;
    readonly url: string;
    readonly groupId: string;
  }[];
  readonly bookmarkGroups: readonly { readonly id: string; readonly name: string }[];
  readonly notebooks: readonly { readonly id: string; readonly title: string }[];
  readonly noteSections: readonly {
    readonly id: string;
    readonly notebookId: string;
    readonly title: string;
  }[];
  readonly notePages: readonly {
    readonly id: string;
    readonly sectionId: string;
    readonly title: string;
  }[];
}
