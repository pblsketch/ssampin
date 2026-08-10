import { afterEach, describe, expect, it, vi } from 'vitest';
import { DriveSyncAdapter } from '../DriveSyncAdapter';

const EXPECTED = '2026-08-08T08:00:00.000Z';

function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  });
}

describe('DriveSyncAdapter 조건부 파일 업로드', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ETag를 If-Match 헤더로 전달해 원자적 PATCH를 수행한다', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          files: [{ id: 'events-file', name: 'events.json', modifiedTime: EXPECTED }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          { id: 'events-file', modifiedTime: EXPECTED },
          { headers: { ETag: '"events-revision-1"' } },
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'events-file',
          name: 'events.json',
          modifiedTime: '2026-08-08T08:01:00.000Z',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new DriveSyncAdapter(async () => 'test-token');

    const result = await adapter.uploadSyncFileIfUnchanged(
      'folder',
      'events.json',
      '{"events":[]}',
      EXPECTED,
    );

    expect(result?.fileId).toBe('events-file');
    const patchInit = fetchMock.mock.calls[2]?.[1];
    expect(patchInit?.method).toBe('PATCH');
    expect(new Headers(patchInit?.headers).get('If-Match')).toBe('"events-revision-1"');
  });

  it('Drive가 412를 반환하면 덮어쓰지 않고 null을 반환한다', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          files: [{ id: 'events-file', name: 'events.json', modifiedTime: EXPECTED }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          { id: 'events-file', modifiedTime: EXPECTED },
          { headers: { ETag: '"events-revision-1"' } },
        ),
      )
      .mockResolvedValueOnce(new Response('precondition failed', { status: 412 }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new DriveSyncAdapter(async () => 'test-token');

    await expect(
      adapter.uploadSyncFileIfUnchanged('folder', 'events.json', '{"events":[]}', EXPECTED),
    ).resolves.toBeNull();
  });

  it('같은 이름의 기존 파일이 둘 이상이면 어느 파일도 조건부 PATCH하지 않는다', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        files: [
          { id: 'events-a', name: 'events.json', modifiedTime: EXPECTED },
          { id: 'events-b', name: 'events.json', modifiedTime: EXPECTED },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new DriveSyncAdapter(async () => 'test-token');

    await expect(
      adapter.uploadSyncFileIfUnchanged('folder', 'events.json', '{"events":[]}', EXPECTED),
    ).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('manifest가 중복되면 임의 파일을 읽지 않고 null로 안전 중단한다', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        files: [
          { id: 'manifest-a', name: 'manifest.json', modifiedTime: EXPECTED },
          { id: 'manifest-b', name: 'manifest.json', modifiedTime: EXPECTED },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new DriveSyncAdapter(async () => 'test-token');

    await expect(adapter.getSyncManifest('folder')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('매니페스트도 읽은 본문과 ETag가 모두 같을 때만 PATCH한다', async () => {
    const expected = {
      version: 1 as const,
      deviceId: 'pc',
      deviceName: 'PC',
      lastSyncedAt: EXPECTED,
      files: { todos: { checksum: 'old', lastModified: EXPECTED, size: 1 } },
    };
    const next = {
      ...expected,
      files: { ...expected.files, events: { checksum: 'new', lastModified: EXPECTED, size: 2 } },
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          files: [{ id: 'manifest-file', name: 'manifest.json', modifiedTime: EXPECTED }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          { id: 'manifest-file', modifiedTime: EXPECTED },
          { headers: { ETag: '"manifest-revision-1"' } },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(expected), { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ id: 'manifest-file', name: 'manifest.json' }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new DriveSyncAdapter(async () => 'test-token');

    await expect(adapter.updateSyncManifestIfUnchanged('folder', expected, next)).resolves.toBe(
      true,
    );
    const patchInit = fetchMock.mock.calls[3]?.[1];
    expect(new Headers(patchInit?.headers).get('If-Match')).toBe('"manifest-revision-1"');
  });

  it('매니페스트 본문이 기대 스냅샷과 달라졌으면 PATCH하지 않는다', async () => {
    const expected = {
      version: 1 as const,
      deviceId: 'pc',
      deviceName: 'PC',
      lastSyncedAt: EXPECTED,
      files: {},
    };
    const concurrent = {
      ...expected,
      files: { todos: { checksum: 'new', lastModified: EXPECTED, size: 1 } },
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          files: [{ id: 'manifest-file', name: 'manifest.json', modifiedTime: EXPECTED }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          { id: 'manifest-file', modifiedTime: EXPECTED },
          { headers: { ETag: '"manifest-revision-2"' } },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(concurrent), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new DriveSyncAdapter(async () => 'test-token');

    await expect(adapter.updateSyncManifestIfUnchanged('folder', expected, expected)).resolves.toBe(
      false,
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('같은 이름 파일이 없을 때만 POST로 새 파일을 생성한다', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      .mockResolvedValueOnce(
        jsonResponse({ id: 'created-events', name: 'events.json', modifiedTime: EXPECTED }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          files: [{ id: 'created-events', name: 'events.json', modifiedTime: EXPECTED }],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new DriveSyncAdapter(async () => 'test-token');

    await expect(
      adapter.createSyncFileIfMissing('folder', 'events.json', '{"events":[]}'),
    ).resolves.toEqual({ fileId: 'created-events', modifiedTime: EXPECTED });
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('POST');
  });

  it('생성 직후 같은 이름 경쟁 파일이 나타나면 내 생성 파일을 휴지통으로 보내고 null을 반환한다', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      .mockResolvedValueOnce(
        jsonResponse({ id: 'created-events', name: 'events.json', modifiedTime: EXPECTED }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          files: [
            { id: 'other-events', name: 'events.json', modifiedTime: EXPECTED },
            { id: 'created-events', name: 'events.json', modifiedTime: EXPECTED },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ id: 'created-events', trashed: true }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new DriveSyncAdapter(async () => 'test-token');

    await expect(
      adapter.createSyncFileIfMissing('folder', 'events.json', '{"events":[]}'),
    ).resolves.toBeNull();
    const cleanupInit = fetchMock.mock.calls[3]?.[1];
    expect(cleanupInit?.method).toBe('PATCH');
    expect(cleanupInit?.body).toBe(JSON.stringify({ trashed: true }));
  });
});

/**
 * ADR-041 회귀 — **실제 브라우저·Electron 렌더러에서는 ETag를 읽을 수 없다.**
 *
 * Google API 응답의 `Access-Control-Expose-Headers`에 `etag`가 없어(실측 2026-08-11 —
 * 200/401 모두 `content-encoding,date,server,content-length,vary`뿐) `headers.get('ETag')`는
 * 항상 null이다. 위 테스트들은 모의 응답에 ETag를 **직접 넣어주기 때문에** 이 현실을
 * 재현하지 못했고, 그래서 "조건부 갱신 100% 실패"가 v2.3.1부터 v2.3.5까지 살아남았다.
 *
 * 아래 두 테스트는 ETag 헤더가 **없는** 응답만 준다 — 실제 Drive와 같은 조건이다.
 */
describe('ADR-041 — ETag를 읽을 수 없어도 조건부 갱신이 동작한다', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ETag 헤더가 없어도 수정 시각이 같으면 파일을 PATCH한다 (If-Match 없이)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          files: [{ id: 'events-file', name: 'events.json', modifiedTime: EXPECTED }],
        }),
      )
      // ETag 헤더 없음 = 실제 Google 응답
      .mockResolvedValueOnce(jsonResponse({ id: 'events-file', modifiedTime: EXPECTED }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'events-file',
          name: 'events.json',
          modifiedTime: '2026-08-11T01:00:00.000Z',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new DriveSyncAdapter(async () => 'test-token');

    const result = await adapter.uploadSyncFileIfUnchanged(
      'folder',
      'events.json',
      '{"events":[]}',
      EXPECTED,
    );

    expect(result?.fileId).toBe('events-file');
    const patchInit = fetchMock.mock.calls[2]?.[1];
    expect(patchInit?.method).toBe('PATCH');
    // ETag가 없으면 If-Match를 아예 보내지 않는다(빈 값 전송 금지 — 412 유발).
    expect(new Headers(patchInit?.headers).has('If-Match')).toBe(false);
  });

  it('ETag 헤더가 없어도 본문이 기대와 같으면 매니페스트를 PATCH한다', async () => {
    const expected = {
      version: 1 as const,
      deviceId: 'pc',
      deviceName: 'PC',
      lastSyncedAt: EXPECTED,
      files: { todos: { checksum: 'old', lastModified: EXPECTED, size: 1 } },
    };
    const next = {
      ...expected,
      files: { ...expected.files, events: { checksum: 'new', lastModified: EXPECTED, size: 2 } },
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          files: [{ id: 'manifest-file', name: 'manifest.json', modifiedTime: EXPECTED }],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ id: 'manifest-file', modifiedTime: EXPECTED }))
      .mockResolvedValueOnce(new Response(JSON.stringify(expected), { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ id: 'manifest-file', name: 'manifest.json' }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new DriveSyncAdapter(async () => 'test-token');

    await expect(adapter.updateSyncManifestIfUnchanged('folder', expected, next)).resolves.toBe(
      true,
    );
  });

  it('수정 시각이 달라진 경우는 ETag 유무와 무관하게 여전히 막는다', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          files: [{ id: 'events-file', name: 'events.json', modifiedTime: EXPECTED }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ id: 'events-file', modifiedTime: '2026-08-11T09:00:00.000Z' }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new DriveSyncAdapter(async () => 'test-token');

    await expect(
      adapter.uploadSyncFileIfUnchanged('folder', 'events.json', '{"events":[]}', EXPECTED),
    ).resolves.toBeNull();
  });
});
