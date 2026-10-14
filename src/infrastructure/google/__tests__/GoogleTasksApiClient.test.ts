import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleTasksApiClient } from '../GoogleTasksApiClient';
import { GOOGLE_AUTH_BLOCKED_MESSAGE } from '@domain/rules/calendarSyncRules';

/**
 * Google Tasks API 클라이언트 계약 — 토큰 갱신 재시도와 한도 처리.
 * 만료된 토큰을 매번 사용자에게 떠넘기지 않으면서(1회 갱신 재시도), 무한 재시도는 막아야 한다.
 */
function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function authOf(call: unknown[]): string {
  const init = call[1] as RequestInit;
  return (init.headers as Record<string, string>)['Authorization'] ?? '';
}

describe('GoogleTasksApiClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('401 이면 토큰을 한 번 갱신해 새 토큰으로 다시 보낸다', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('expired', { status: 401 }))
      .mockResolvedValueOnce(json({ items: [{ id: 'l1', title: '내 목록', updated: 'u' }] }));
    const client = new GoogleTasksApiClient();
    const refresh = vi.fn(async () => 'fresh-token');
    client.setTokenRefreshCallback(refresh);

    const lists = await client.listTaskLists('stale-token');

    expect(lists).toEqual([{ id: 'l1', title: '내 목록', updated: 'u' }]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(authOf(fetchMock.mock.calls[0] as unknown[])).toBe('Bearer stale-token');
    expect(authOf(fetchMock.mock.calls[1] as unknown[])).toBe('Bearer fresh-token');
  });

  it('갱신이 실패하면 인증 차단 안내와 401 코드로 알린다', async () => {
    fetchMock.mockResolvedValueOnce(new Response('expired', { status: 401 }));
    const client = new GoogleTasksApiClient();
    client.setTokenRefreshCallback(async () => {
      throw new Error('refresh failed');
    });

    await expect(client.listTaskLists('stale')).rejects.toMatchObject({
      message: GOOGLE_AUTH_BLOCKED_MESSAGE,
      code: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('갱신 뒤에도 401 이면 다시 갱신하지 않고 멈춘다(무한 재시도 없음)', async () => {
    fetchMock.mockResolvedValue(new Response('still no', { status: 401 }));
    const client = new GoogleTasksApiClient();
    const refresh = vi.fn(async () => 'fresh');
    client.setTokenRefreshCallback(refresh);

    await expect(client.listTaskLists('stale')).rejects.toMatchObject({ code: 401 });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('일일 한도(429)는 재시도 없이 바로 표시해 알린다', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Quota exceeded for '1/d/{project}'" } }), {
        status: 429,
      }),
    );
    const client = new GoogleTasksApiClient();

    await expect(client.listTaskLists('t')).rejects.toMatchObject({
      code: 429,
      dailyQuotaExceeded: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('일시적인 429 는 기다렸다가 다시 보낸다', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response('rate limited', { status: 429, headers: { 'Retry-After': '0' } }),
      )
      .mockResolvedValueOnce(json({ items: [] }));

    const lists = await new GoogleTasksApiClient().listTaskLists('t');
    expect(lists).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('수정(PATCH)은 지운 칸을 null 그대로 보낸다', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ id: 'g1', title: 'a', status: 'needsAction', updated: 'u', etag: 'e' }),
    );
    await new GoogleTasksApiClient().updateTask('t', 'list 1', 'g1', {
      title: 'a',
      status: 'needsAction',
      due: null,
      notes: null,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('PATCH');
    expect(url).toContain('/lists/list%201/tasks/g1');
    expect(JSON.parse(String(init.body))).toEqual({
      title: 'a',
      status: 'needsAction',
      due: null,
      notes: null,
    });
  });

  it('목록 조회는 삭제·숨김·완료 항목까지 모든 쪽을 합쳐 돌려준다', async () => {
    fetchMock
      .mockResolvedValueOnce(
        json({
          items: [{ id: 'a', title: 'A', status: 'needsAction', updated: 'u', etag: 'e' }],
          nextPageToken: 'p2',
        }),
      )
      .mockResolvedValueOnce(
        json({
          items: [
            { id: 'b', title: 'B', status: 'completed', updated: 'u', etag: 'e', deleted: true },
          ],
        }),
      );

    const tasks = await new GoogleTasksApiClient().listTasks('t', 'list-1');

    expect(tasks.map((t) => t.id)).toEqual(['a', 'b']);
    const first = new URL((fetchMock.mock.calls[0] as [string])[0]);
    expect(first.searchParams.get('showDeleted')).toBe('true');
    expect(first.searchParams.get('showHidden')).toBe('true');
    expect(first.searchParams.get('showCompleted')).toBe('true');
    const second = new URL((fetchMock.mock.calls[1] as [string])[0]);
    expect(second.searchParams.get('pageToken')).toBe('p2');
  });
});
