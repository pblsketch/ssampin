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
  /** 일일 쿼터(1/d/{project}) 초과로 24시간 안에 회복 불가능한 상태 */
  dailyQuotaExceeded?: boolean;
  /** 서버가 명시한 Retry-After (ms). transient 429/5xx 한정 */
  retryAfterMs?: number;
}

/**
 * 429 응답 본문에서 "일일 쿼터 초과"인지 판정.
 * 매분/매초 단위 throttle은 짧은 백오프로 회복 가능하지만,
 * `1/d/{project}` 쿼터는 PT 자정까지 어떤 재시도도 의미 없음.
 */
function isDailyQuotaExceeded(body: string): boolean {
  // quota_unit: "1/d/{project}" — 일/프로젝트
  if (body.includes('1/d/{project}')) return true;
  // quota_limit: "defaultPerDayPerProject"
  if (body.includes('PerDayPerProject')) return true;
  // 메시지: "Quota exceeded ... limit 'Queries per day'"
  if (/Queries per day/i.test(body)) return true;
  return false;
}

/** Retry-After 헤더(seconds 또는 HTTP-date) → ms. 못 읽으면 null. */
function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const sec = Number(header);
  if (Number.isFinite(sec) && sec >= 0) return Math.min(sec * 1000, 60_000);
  const dateMs = Date.parse(header);
  if (Number.isFinite(dateMs)) {
    const delta = dateMs - Date.now();
    if (delta > 0) return Math.min(delta, 60_000);
  }
  return null;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

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
    backoffAttempt = 0,
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
          return this.request<T>(newToken, path, options, true, backoffAttempt);
        } catch {
          // 갱신 실패 시 원래 에러 throw
        }
      }

      const body = await res.text();

      // 429 / 503: transient 케이스만 1~2회 재시도 (일일 쿼터는 즉시 throw)
      if ((res.status === 429 || res.status === 503) && !isDailyQuotaExceeded(body) && backoffAttempt < 2) {
        const retryAfter = parseRetryAfterMs(res.headers.get('Retry-After'));
        const backoffMs = retryAfter ?? Math.min(1000 * 2 ** backoffAttempt, 4000);
        await sleep(backoffMs);
        return this.request<T>(accessToken, path, options, isRetry, backoffAttempt + 1);
      }

      const message =
        res.status === 401
          ? GOOGLE_AUTH_BLOCKED_MESSAGE
          : `Google Tasks API error: ${res.status} ${body}`;
      const error = new Error(message) as ApiError;
      error.code = res.status;
      if (res.status === 429) {
        if (isDailyQuotaExceeded(body)) {
          error.dailyQuotaExceeded = true;
        } else {
          const retryAfter = parseRetryAfterMs(res.headers.get('Retry-After'));
          if (retryAfter !== null) error.retryAfterMs = retryAfter;
        }
      }
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
