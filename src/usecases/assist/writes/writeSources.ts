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

import type { AttendanceReason, AttendanceStatus } from '@domain/entities/Attendance';
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
  /**
   * 출결·관찰·채점이 **누구인지**를 정하는 자리.
   *
   * ★`classes` 와 따로 두는 이유 — 담임 학급은 `classes`(교과 수업반)에 없다.
   * 명렬표(`students.json`)는 담임 학급 한 반의 것이고, 출결이 반 자리에 넣는 값도
   * 수업반 id 가 아니라 설정의 반 이름(`settings.className`)이다. 둘을 한 배열에
   * 욱여넣으면 "이 id 는 어느 쪽 것인가"를 부르는 곳마다 다시 판별하게 된다.
   *
   * ★**모델에게는 이 명단이 나가지 않는다.** 학생 목록 조회 도구는 등록돼 있지 않고,
   * 모델은 선생님이 말한 번호나 가려진 별칭(［이름1］)으로만 대상을 가리킨다.
   * 그 말을 실제 학생에 잇는 일이 여기 명단을 보는 유일한 용도다.
   */
  readonly roster: {
    /** 담임 반 키. 출결 저장이 `classId` 자리에 그대로 넣는 값이다(`settings.className`) */
    readonly homeroomClassId: string;
    /**
     * 정규 교시 수(`settings.maxPeriods`). 선생님이 교시를 안 밝혔을 때
     * "하루 전체"가 몇 교시까지인지 정한다 — 여기 없으면 하루 결석을 적을 수 없다.
     */
    readonly regularPeriodCount: number;
    readonly homeroom: readonly {
      readonly id: string;
      readonly name: string;
      readonly studentNumber?: number;
    }[];
    readonly teaching: readonly {
      readonly classId: string;
      /**
       * 같은 교실의 여러 과목이 출결을 공유하는 묶음. 이게 있으면 출결 조회가
       * 물리 반 id 가 아니라 이 값을 먼저 본다 — 안 보면 다른 과목 명의로 저장된
       * 공유 기록을 놓친다(2026-07 QA2 B2).
       */
      readonly groupId?: string;
      readonly className: string;
      readonly students: readonly {
        readonly number: number;
        readonly name: string;
        /**
         * 관찰 기록이 학생을 가리키는 키(`studentKey`). 번호만일 수도, `학년-반-번호`
         * 일 수도 있다(다른 반 학생이 섞인 수업반).
         *
         * ★규칙을 여기서 다시 만들지 않고 **이미 만들어진 값**을 받는다 — 화면이 쓰는
         * 키와 한 글자라도 달라지면, AI 가 남긴 관찰만 그 학생 화면에서 안 보인다.
         */
        readonly key: string;
      }[];
    }[];
  };
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
  /**
   * 루브릭(평가 기준표)과 그 안의 요소·수준.
   *
   * ★모델에게 나가는 것은 선생님이 말한 이름뿐이다 — 여기 든 id 는 한 번도 나가지
   * 않는다. 모델이 "주장의 명확성 을 잘함으로" 라고 말하면, 그 말을 id 로 바꾸는 일이
   * 이 목록을 보는 유일한 용도다.
   */
  /**
   * **이미 적혀 있는** 출결. 미리보기가 "지금 무엇으로 돼 있는지"를 보여주는 데만 쓴다.
   *
   * ★없으면 앱이 조용히 덮어쓴다. 선생님은 [실행]을 누르면서 "빈 칸에 적는다"고 믿는데
   * 실제로는 이미 있던 결석이 지각으로 바뀔 수 있다 — 미리보기가 값을 감추면 [실행]
   * 버튼은 확인이 아니라 요식이 된다(AssistWrite.ts 의 `fields` 주석과 같은 이유).
   */
  readonly attendance: readonly {
    readonly classId: string;
    readonly groupId?: string;
    readonly date: string;
    readonly period: number;
    readonly students: readonly {
      readonly number: number;
      readonly status: AttendanceStatus;
      readonly reason?: AttendanceReason;
      readonly memo?: string;
    }[];
  }[];
  readonly rubrics: readonly {
    readonly id: string;
    readonly classId: string;
    readonly title: string;
    readonly criteria: readonly {
      readonly id: string;
      readonly name: string;
      /** 표시 순서. "만점으로" 처럼 요소 전부를 찍을 때 미리보기가 화면과 같은 차례로 뜬다 */
      readonly order: number;
      readonly levels: readonly {
        readonly id: string;
        readonly name: string;
        /** 배점. **"제일 높은 칸"을 이 값으로 정한다** — 목록 순서로 짐작하지 않는다 */
        readonly score: number;
      }[];
    }[];
  }[];
}
