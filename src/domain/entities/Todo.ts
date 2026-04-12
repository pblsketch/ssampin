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
}

export interface TodosData {
  readonly todos: readonly Todo[];
  readonly categories?: readonly TodoCategory[];
}
