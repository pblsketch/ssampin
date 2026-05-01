/** 프로 모드 진행 상태 */
export type TodoStatus = 'todo' | 'inProgress' | 'done';

/** 우선순위 레벨 */
export type TodoPriority = 'high' | 'medium' | 'low' | 'none';

/** 반복 주기 */
export type RecurrenceType = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'weekdays';

export interface TodoRecurrence {
  readonly type: RecurrenceType;
  readonly interval: number;          // 1 = 매번, 2 = 격주/격월 등
  readonly endDate?: string;          // 반복 종료일 (없으면 무한)
  readonly daysOfWeek?: number[];     // weekly일 때: 0(일)~6(토)
}

export interface TodoCategory {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly icon: string;
}

export const DEFAULT_TODO_CATEGORIES: readonly TodoCategory[] = [
  { id: 'class',   name: '수업',   color: 'blue',   icon: '📚' },
  { id: 'admin',   name: '업무',   color: 'green',  icon: '📋' },
  { id: 'student', name: '학생',   color: 'yellow', icon: '👨‍🎓' },
  { id: 'meeting', name: '회의',   color: 'purple', icon: '🤝' },
  { id: 'etc',     name: '기타',   color: 'gray',   icon: '📌' },
];

export interface SubTask {
  readonly id: string;
  readonly text: string;
  readonly completed: boolean;
}

export interface Todo {
  readonly id: string;
  readonly text: string;
  readonly completed: boolean;
  readonly dueDate?: string;          // "YYYY-MM-DD"
  readonly startDate?: string;        // "YYYY-MM-DD" (시작일, 없으면 dueDate 하루만)
  readonly time?: string;             // "HH:mm" (선택, 없으면 시간 미지정)
  readonly createdAt: string;         // ISO 8601
  readonly priority?: TodoPriority;
  readonly category?: string;
  readonly recurrence?: TodoRecurrence;
  readonly archivedAt?: string;       // ISO 8601 — 아카이브 시각
  readonly subTasks?: readonly SubTask[];
  readonly sortOrder?: number;        // 수동 정렬 순서

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
