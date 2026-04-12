/** Google Task (API 응답 형태) */
export interface GoogleTask {
  readonly id: string;
  readonly title: string;
  readonly notes?: string;
  readonly status: 'needsAction' | 'completed';
  readonly due?: string;        // RFC3339 date string
  readonly updated: string;     // RFC3339
  readonly etag: string;
  readonly selfLink?: string;
  readonly completed?: string;  // RFC3339 (완료 시각)
  readonly deleted?: boolean;
  readonly parent?: string;
}

/** Google Task List */
export interface GoogleTaskList {
  readonly id: string;
  readonly title: string;
  readonly updated: string;
}

/** 구글 Tasks API 포트 */
export interface IGoogleTasksPort {
  /** 사용자의 Task List 목록 조회 */
  listTaskLists(accessToken: string): Promise<readonly GoogleTaskList[]>;
  /** 특정 Task List의 모든 Task 조회 */
  listTasks(accessToken: string, taskListId: string, updatedMin?: string): Promise<readonly GoogleTask[]>;
  /** Task 생성 */
  createTask(accessToken: string, taskListId: string, task: Partial<GoogleTask>): Promise<GoogleTask>;
  /** Task 수정 (PATCH) */
  updateTask(accessToken: string, taskListId: string, taskId: string, task: Partial<GoogleTask>): Promise<GoogleTask>;
  /** Task 삭제 */
  deleteTask(accessToken: string, taskListId: string, taskId: string): Promise<void>;
}
