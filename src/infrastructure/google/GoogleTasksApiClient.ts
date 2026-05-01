/**
 * Google Tasks REST API 클라이언트
 *
 * IGoogleTasksPort 구현체. 네이티브 fetch 사용.
 */
import type {
  IGoogleTasksPort,
  GoogleTask,
  GoogleTaskList,
} from '@domain/ports/IGoogleTasksPort';
import { GOOGLE_AUTH_BLOCKED_MESSAGE } from '@domain/rules/calendarSyncRules';

const BASE_URL = 'https://www.googleapis.com/tasks/v1';

interface TaskListsResponse {
  items?: GoogleTaskList[];
}

interface TasksResponse {
  items?: GoogleTask[];
  nextPageToken?: string;
}

interface ApiError extends Error {
  code: number;
}

export class GoogleTasksApiClient implements IGoogleTasksPort {
  private onTokenRefresh: (() => Promise<string>) | null = null;

  setTokenRefreshCallback(callback: () => Promise<string>): void {
    this.onTokenRefresh = callback;
  }

  private async request<T>(
    accessToken: string,
    path: string,
    options?: RequestInit,
    isRetry = false,
  ): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(options?.headers ?? {}),
      },
    });

    if (!res.ok) {
      if (res.status === 401 && !isRetry && this.onTokenRefresh) {
        try {
          const newToken = await this.onTokenRefresh();
          return this.request<T>(newToken, path, options, true);
        } catch {
          // 갱신 실패 시 원래 에러 throw
        }
      }

      const err = await res.text();
      const message =
        res.status === 401
          ? GOOGLE_AUTH_BLOCKED_MESSAGE
          : `Google Tasks API error: ${res.status} ${err}`;
      const error = new Error(message) as ApiError;
      error.code = res.status;
      throw error;
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  async listTaskLists(accessToken: string): Promise<readonly GoogleTaskList[]> {
    const data = await this.request<TaskListsResponse>(
      accessToken,
      '/users/@me/lists',
    );
    return (data.items ?? []).map((list) => ({
      id: list.id,
      title: list.title,
      updated: list.updated,
    }));
  }

  async listTasks(
    accessToken: string,
    taskListId: string,
    updatedMin?: string,
  ): Promise<readonly GoogleTask[]> {
    const allTasks: GoogleTask[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({
        maxResults: '100',
        showCompleted: 'true',
        showHidden: 'true',
        // 외부 삭제 감지를 위해 tombstone(deleted:true) 응답 수신.
        // showDeleted=false가 기본이면 삭제된 task는 응답에서 빠지지만,
        // Google Tasks 앱에서 완료→삭제한 항목은 hidden:true 상태로 살아남아
        // "응답에 없으면 삭제"로 판정되지 않는 함정이 있음.
        showDeleted: 'true',
      });
      if (updatedMin) params.set('updatedMin', updatedMin);
      if (pageToken) params.set('pageToken', pageToken);

      const data = await this.request<TasksResponse>(
        accessToken,
        `/lists/${encodeURIComponent(taskListId)}/tasks?${params.toString()}`,
      );

      for (const item of data.items ?? []) {
        allTasks.push(item);
      }

      pageToken = data.nextPageToken;
    } while (pageToken);

    return allTasks;
  }

  async createTask(
    accessToken: string,
    taskListId: string,
    task: Partial<GoogleTask>,
  ): Promise<GoogleTask> {
    return this.request<GoogleTask>(
      accessToken,
      `/lists/${encodeURIComponent(taskListId)}/tasks`,
      {
        method: 'POST',
        body: JSON.stringify(task),
      },
    );
  }

  async updateTask(
    accessToken: string,
    taskListId: string,
    taskId: string,
    task: Partial<GoogleTask>,
  ): Promise<GoogleTask> {
    return this.request<GoogleTask>(
      accessToken,
      `/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(task),
      },
    );
  }

  async deleteTask(
    accessToken: string,
    taskListId: string,
    taskId: string,
  ): Promise<void> {
    await this.request<void>(
      accessToken,
      `/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`,
      { method: 'DELETE' },
    );
  }
}
