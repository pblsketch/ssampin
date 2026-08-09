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
