/** 프로 모드 진행 상태 */
export type TodoStatus = 'todo' | 'inProgress' | 'done';

/** 우선순위 레벨 */
export type TodoPriority = 'high' | 'medium' | 'low' | 'none';

/** 반복 주기 */
export type RecurrenceType = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'weekdays';

export interface TodoRecurrence {
  readonly type: RecurrenceType;
  readonly interval: number; // 1 = 매번, 2 = 격주/격월 등
  readonly endDate?: string; // 반복 종료일 (없으면 무한)
  readonly daysOfWeek?: number[]; // weekly일 때: 0(일)~6(토)
}

export interface TodoCategory {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly icon: string;
}

export const DEFAULT_TODO_CATEGORIES: readonly TodoCategory[] = [
  { id: 'class', name: '수업', color: 'blue', icon: '📚' },
  { id: 'admin', name: '업무', color: 'green', icon: '📋' },
  { id: 'student', name: '학생', color: 'yellow', icon: '👨‍🎓' },
  { id: 'meeting', name: '회의', color: 'purple', icon: '🤝' },
  { id: 'etc', name: '기타', color: 'gray', icon: '📌' },
];

export interface SubTask {
  readonly id: string;
  readonly text: string;
  readonly completed: boolean;
}

/**
 * 할 일에 붙이는 관련인 — "이건 누구한테 물어봐야 하는 일"을 적어 둔다.
 *
 * `staffId`가 정본이고 `nameSnapshot`은 **폴백일 뿐이다.** 연락처에서 이름이 바뀌면
 * 화면은 언제나 연락처 쪽을 따른다. 스냅샷은 연락처가 지워졌을 때 "누구였는지"를
 * 잃지 않기 위한 최소 보험이며, **만든 뒤에는 다시 쓰지 않는다**(갱신하면 두 곳이
 * 서로 다른 정본이 되어 ADR-046·063·064가 겪은 문제가 반복된다).
 */
export interface TodoRelatedPerson {
  readonly staffId: string;
  readonly nameSnapshot: string;
}

/**
 * 구글 Tasks로 내보내지 않는 **쌤핀 전용 항목**.
 *
 * 이 항목만 바뀐 수정은 구글 쓰기를 예약하지 않는다. 구글 Tasks에는 대응하는 자리가
 * 아예 없어서 올려 봤자 사라지는데, 매번 쓰기를 걸면 동기화가 쉬지 않고 도는
 * 핑퐁(ADR-039/040)이 된다.
 */
export const TODO_LOCAL_ONLY_FIELDS = ['checkAt', 'relatedStaff'] as const;

export type TodoLocalOnlyField = (typeof TODO_LOCAL_ONLY_FIELDS)[number];

export interface Todo {
  readonly id: string;
  readonly text: string;
  readonly completed: boolean;
  readonly dueDate?: string; // "YYYY-MM-DD"
  readonly startDate?: string; // "YYYY-MM-DD" (시작일, 없으면 dueDate 하루만)
  readonly time?: string; // "HH:mm" (선택, 없으면 시간 미지정)
  /**
   * 점검 날짜 — "다시 확인할 날". "YYYY-MM-DD" (기존 dueDate·startDate와 같은 형식).
   *
   * 마감일과 다르다. 공문 회신 대기, 학생 제출물 확인처럼 **내가 끝내는 날**과
   * **내가 다시 봐야 하는 날**이 다른 일이 교사 업무에 흔하다.
   */
  readonly checkAt?: string;
  /** 관련인 — 이 할 일과 엮인 교직원. 정본은 연락처다. */
  readonly relatedStaff?: readonly TodoRelatedPerson[];
  readonly createdAt: string; // ISO 8601
  readonly priority?: TodoPriority;
  readonly category?: string;
  readonly recurrence?: TodoRecurrence;
  readonly archivedAt?: string; // ISO 8601 — 아카이브 시각
  readonly subTasks?: readonly SubTask[];
  readonly sortOrder?: number; // 수동 정렬 순서

  // === 프로 모드용 신규 필드 ===
  /** 프로 모드 진행 상태. optional이므로 기존 데이터와 100% 호환. */
  readonly status?: TodoStatus;

  // === Google Tasks 연동 필드 ===
  /** Google Tasks API에서 부여한 Task ID */
  readonly googleTaskId?: string;
  /** 이 할일이 속한 Google Task List ID */
  readonly googleTaskListId?: string;
  /** Google Tasks의 notes (상세 메모) */
  readonly notes?: string;

  // === Google Tasks 동기화 메타데이터 (v2.0.2~) ===
  /**
   * 다음 sync 사이클에서 Google Tasks에 적용할 작업.
   * - 'create': 원격에 신규 생성 필요 (= googleTaskId 없는 신규 항목)
   * - 'update': 원격 업데이트 필요 (로컬에서 수정된 항목)
   * - 'delete': 원격에서 삭제 필요 (아카이브/영구삭제된 항목)
   * - undefined: 원격과 동기화된 상태
   */
  readonly pendingRemoteOp?: 'create' | 'update' | 'delete';
  /** 로컬에서 마지막으로 사용자가 수정한 시각 (ISO 8601) */
  readonly updatedAt?: string;
  /** Google Tasks와 마지막으로 동기화 성공한 시각 (ISO 8601) */
  readonly lastSyncedAt?: string;
  /**
   * Google Tasks 쪽에서 의도적으로 삭제됐음을 마킹하는 tombstone.
   * 다음 sync에서 이 todo를 다시 push하지 않기 위함 (좀비 부활 방지).
   */
  readonly remoteDeletedAt?: string;
}

export interface TodosData {
  readonly todos: readonly Todo[];
  readonly categories?: readonly TodoCategory[];
}
