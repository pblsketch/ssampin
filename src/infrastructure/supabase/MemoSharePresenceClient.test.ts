/**
 * MemoSharePresenceClient — fetch mock 단위 테스트.
 *
 * 검증: REST URL(board_id=in.(...) + select 컬럼) / anon 헤더(apikey + Bearer) /
 * 행 매핑(snake_case → 도메인 타입) / env 미설정·빈 입력 시 비활성(빈 맵, fetch 0회).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { MemoSharePresenceClient } from './MemoSharePresenceClient';

function stubFetch(rows: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => rows,
  }));
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('MemoSharePresenceClient', () => {
  it('fetchPresence: REST URL(board_id=in + select)과 anon 헤더로 호출하고 행을 도메인 타입으로 매핑한다', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    const fetchMock = stubFetch([
      {
        board_id: 'b1',
        last_seen_at: '2026-06-12T01:00:00.000Z',
        sound_on: true,
        last_ack_nonce: 'nonce-1',
        last_ack_result: 'played',
        last_ack_at: '2026-06-12T01:00:05.000Z',
      },
      {
        board_id: 'b2',
        last_seen_at: '2026-06-12T00:50:00.000Z',
        sound_on: false,
        last_ack_nonce: null,
        // 허용 외 값은 필드 단위로 무시 (행 전체 거부 아님)
        last_ack_result: 'weird-value',
        last_ack_at: null,
      },
    ]);

    const client = new MemoSharePresenceClient();
    expect(client.isConfigured()).toBe(true);
    const map = await client.fetchPresence(['b1', 'b2']);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe(
      'https://example.supabase.co/rest/v1/memo_share_presence' +
        '?board_id=in.(b1,b2)&select=board_id,last_seen_at,sound_on,last_ack_nonce,last_ack_result,last_ack_at',
    );
    expect(call[1].method).toBe('GET');
    expect(call[1].headers).toEqual({
      apikey: 'anon-key',
      Authorization: 'Bearer anon-key',
    });

    expect(map.get('b1')).toEqual({
      boardId: 'b1',
      lastSeenAt: '2026-06-12T01:00:00.000Z',
      soundOn: true,
      lastAckNonce: 'nonce-1',
      lastAckResult: 'played',
      lastAckAt: '2026-06-12T01:00:05.000Z',
    });
    expect(map.get('b2')).toEqual({
      boardId: 'b2',
      lastSeenAt: '2026-06-12T00:50:00.000Z',
      soundOn: false,
    });
  });

  it('env 미설정이면 fetch 없이 빈 맵(명확한 비활성)', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    const fetchMock = stubFetch([]);

    const client = new MemoSharePresenceClient();
    expect(client.isConfigured()).toBe(false);
    const map = await client.fetchPresence(['b1']);

    expect(map.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('boardIds가 비어 있으면 fetch 없이 빈 맵', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    const fetchMock = stubFetch([]);

    const client = new MemoSharePresenceClient();
    const map = await client.fetchPresence([]);

    expect(map.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('필수 필드가 깨진 행은 해당 행만 건너뛴다 (크래시 금지)', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    stubFetch([
      { board_id: '', last_seen_at: '2026-06-12T01:00:00.000Z', sound_on: true },
      { board_id: 'ok', last_seen_at: '2026-06-12T01:00:00.000Z', sound_on: 'truthy-string' },
    ]);

    const client = new MemoSharePresenceClient();
    const map = await client.fetchPresence(['ok']);

    expect(map.size).toBe(1);
    // sound_on이 boolean true가 아니면 안전하게 false 처리
    expect(map.get('ok')?.soundOn).toBe(false);
  });
});
