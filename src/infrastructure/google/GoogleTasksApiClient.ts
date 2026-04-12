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
      const error = new Error(
        `Google Tasks API error: ${res.status} ${err}`,
      ) as ApiError;
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
