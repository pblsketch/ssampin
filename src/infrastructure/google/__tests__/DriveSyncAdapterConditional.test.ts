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

async function checksumText(content: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
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

    await expect(adapter.getSyncManifest('folder')).rejects.toThrow('v2 쌤핀 동기화 장부가 중복');
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
    const body = fetchMock.mock.calls[1]?.[1]?.body;
    expect(body).toBeInstanceOf(Blob);
    await expect((body as Blob).text()).resolves.toContain('"name":"v2--events.json"');
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

describe('DriveSyncAdapter v2 네임스페이스', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('v1 장부와 파일을 v2 이름으로 복사한 뒤 version 2 장부를 만든다', async () => {
    const legacyContent = '{"events":[]}';
    const legacyManifest = {
      version: 1,
      lastSyncedAt: EXPECTED,
      deviceId: 'legacy-pc',
      deviceName: '이전 PC',
      files: {
        events: {
          checksum: await checksumText(legacyContent),
          lastModified: EXPECTED,
          size: new TextEncoder().encode(legacyContent).length,
        },
      },
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      .mockResolvedValueOnce(
        jsonResponse({ files: [{ id: 'legacy-manifest', name: 'manifest.json' }] }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(legacyManifest), { status: 200 }))
      .mockResolvedValueOnce(
        jsonResponse({ files: [{ id: 'legacy-events', name: 'events.json' }] }),
      )
      .mockResolvedValueOnce(new Response(legacyContent, { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      .mockResolvedValueOnce(
        jsonResponse({ id: 'v2-events', name: 'v2--events.json', modifiedTime: EXPECTED }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          files: [{ id: 'v2-events', name: 'v2--events.json', modifiedTime: EXPECTED }],
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(legacyManifest), { status: 200 }))
      .mockResolvedValueOnce(
        jsonResponse({ id: 'v2-manifest', name: 'v2--manifest.json', modifiedTime: EXPECTED }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          files: [{ id: 'v2-manifest', name: 'v2--manifest.json', modifiedTime: EXPECTED }],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new DriveSyncAdapter(async () => 'test-token');

    await expect(adapter.getSyncManifest('folder')).resolves.toEqual({
      ...legacyManifest,
      version: 2,
    });
    const copiedFileBody = fetchMock.mock.calls[6]?.[1]?.body;
    const v2ManifestBody = fetchMock.mock.calls[9]?.[1]?.body;
    expect(copiedFileBody).toBeInstanceOf(Blob);
    expect(v2ManifestBody).toBeInstanceOf(Blob);
    await expect((copiedFileBody as Blob).text()).resolves.toContain('"name":"v2--events.json"');
    await expect((v2ManifestBody as Blob).text()).resolves.toContain('"version": 2');
  });

  it('v1 실제 파일이 장부 체크섬과 다르면 v2 파일을 만들지 않고 이전을 중단한다', async () => {
    const legacyContent = '{"events":[{"id":"changed"}]}';
    const legacyManifest = {
      version: 1,
      lastSyncedAt: EXPECTED,
      deviceId: 'legacy-pc',
      deviceName: '이전 PC',
      files: {
        events: {
          checksum: await checksumText('{"events":[]}'),
          lastModified: EXPECTED,
          size: new TextEncoder().encode(legacyContent).length,
        },
      },
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      .mockResolvedValueOnce(
        jsonResponse({ files: [{ id: 'legacy-manifest', name: 'manifest.json' }] }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(legacyManifest), { status: 200 }))
      .mockResolvedValueOnce(
        jsonResponse({ files: [{ id: 'legacy-events', name: 'events.json' }] }),
      )
      .mockResolvedValueOnce(new Response(legacyContent, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new DriveSyncAdapter(async () => 'test-token');

    await expect(adapter.getSyncManifest('folder')).rejects.toThrow(
      '이전 events 파일이 동기화 장부와 일치하지 않습니다',
    );
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('중단된 이전이 남긴 v2 파일은 그대로 채택하고 다시 올리지 않는다', async () => {
    const legacyContent = '{"events":[{"id":"latest"}]}';
    const legacyManifest = {
      version: 1,
      lastSyncedAt: EXPECTED,
      deviceId: 'legacy-pc',
      deviceName: '이전 PC',
      files: {
        events: {
          checksum: await checksumText(legacyContent),
          lastModified: '2026-08-08T07:00:00.000Z',
          size: new TextEncoder().encode(legacyContent).length,
        },
      },
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      .mockResolvedValueOnce(
        jsonResponse({ files: [{ id: 'legacy-manifest', name: 'manifest.json' }] }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(legacyManifest), { status: 200 }))
      .mockResolvedValueOnce(
        jsonResponse({ files: [{ id: 'legacy-events', name: 'events.json' }] }),
      )
      .mockResolvedValueOnce(new Response(legacyContent, { status: 200 }))
      .mockResolvedValueOnce(
        jsonResponse({
          files: [
            {
              id: 'resumed-v2-events',
              name: 'v2--events.json',
              modifiedTime: '2026-08-08T09:00:00.000Z',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(new Response(legacyContent, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(legacyManifest), { status: 200 }))
      .mockResolvedValueOnce(
        jsonResponse({ id: 'v2-manifest', name: 'v2--manifest.json', modifiedTime: EXPECTED }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          files: [{ id: 'v2-manifest', name: 'v2--manifest.json', modifiedTime: EXPECTED }],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new DriveSyncAdapter(async () => 'test-token');

    await expect(adapter.getSyncManifest('folder')).resolves.toMatchObject({
      version: 2,
      files: {
        events: {
          checksum: await checksumText(legacyContent),
          lastModified: '2026-08-08T09:00:00.000Z',
        },
      },
    });
    // 이미 있는 이전 결과는 건드리지 않는다 — PATCH 가 한 번도 나가면 안 된다.
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === 'PATCH')).toHaveLength(0);
  });

  it('★다른 기기가 먼저 만든 v2 파일은 덮어쓰지 않고 그 본문을 장부에 적는다', async () => {
    const legacyContent = '{"events":[{"id":"mine"}]}';
    const otherDeviceContent = '{"events":[{"id":"other"}]}';
    const legacyManifest = {
      version: 1,
      lastSyncedAt: EXPECTED,
      deviceId: 'legacy-pc',
      deviceName: '이전 PC',
      files: {
        events: {
          checksum: await checksumText(legacyContent),
          lastModified: EXPECTED,
          size: new TextEncoder().encode(legacyContent).length,
        },
      },
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      .mockResolvedValueOnce(
        jsonResponse({ files: [{ id: 'legacy-manifest', name: 'manifest.json' }] }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(legacyManifest), { status: 200 }))
      .mockResolvedValueOnce(
        jsonResponse({ files: [{ id: 'legacy-events', name: 'events.json' }] }),
      )
      .mockResolvedValueOnce(new Response(legacyContent, { status: 200 }))
      .mockResolvedValueOnce(
        jsonResponse({
          files: [
            {
              id: 'other-v2-events',
              name: 'v2--events.json',
              modifiedTime: '2026-08-08T09:30:00.000Z',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(new Response(otherDeviceContent, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(legacyManifest), { status: 200 }))
      .mockResolvedValueOnce(
        jsonResponse({ id: 'v2-manifest', name: 'v2--manifest.json', modifiedTime: EXPECTED }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          files: [{ id: 'v2-manifest', name: 'v2--manifest.json', modifiedTime: EXPECTED }],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new DriveSyncAdapter(async () => 'test-token');

    // 장부에는 **실제 Drive 파일의 체크섬**이 들어가야 한다. 내 v1 스냅샷을 적으면
    // 장부와 실제 내용이 어긋나 다음 동기화가 멀쩡한 파일을 오염으로 본다.
    await expect(adapter.getSyncManifest('folder')).resolves.toMatchObject({
      version: 2,
      files: {
        events: {
          checksum: await checksumText(otherDeviceContent),
          size: new TextEncoder().encode(otherDeviceContent).length,
          lastModified: '2026-08-08T09:30:00.000Z',
        },
      },
    });
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === 'PATCH')).toHaveLength(0);
  });

  it('★v2 장부가 동시에 만들어지면 자기 것만 정리하고 먼저 만들어진 장부를 따른다', async () => {
    const legacyManifest = {
      version: 1,
      lastSyncedAt: EXPECTED,
      deviceId: 'legacy-pc',
      deviceName: '이전 PC',
      files: {},
    };
    const winnerManifest = {
      version: 2,
      lastSyncedAt: EXPECTED,
      deviceId: 'other-pc',
      deviceName: '다른 PC',
      files: {},
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      .mockResolvedValueOnce(
        jsonResponse({ files: [{ id: 'legacy-manifest', name: 'manifest.json' }] }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(legacyManifest), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(legacyManifest), { status: 200 }))
      .mockResolvedValueOnce(
        jsonResponse({ id: 'zz-mine', name: 'v2--manifest.json', modifiedTime: EXPECTED }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          files: [
            { id: 'zz-mine', name: 'v2--manifest.json', modifiedTime: EXPECTED },
            { id: 'aa-winner', name: 'v2--manifest.json', modifiedTime: EXPECTED },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ id: 'zz-mine' }))
      .mockResolvedValueOnce(new Response(JSON.stringify(winnerManifest), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new DriveSyncAdapter(async () => 'test-token');

    await expect(adapter.getSyncManifest('folder')).resolves.toEqual(winnerManifest);
    // 지운 것은 **자기 것 하나뿐** — 서로 상대를 지우면 장부가 통째로 사라진다.
    const trashCalls = fetchMock.mock.calls.filter((call) => call[1]?.method === 'PATCH');
    expect(trashCalls).toHaveLength(1);
    expect(String(fetchMock.mock.calls[6]?.[0])).toContain('zz-mine');
  });

  it('★최초 장부 생성이 쓰는 파일과 장부 읽기가 찾는 파일이 같다', async () => {
    // SyncToCloud 는 논리 이름 'manifest.json' 으로 최초 장부를 만든다. 물리 이름 규칙이
    // 어긋나면 "만들었는데 못 읽는" 상태가 되어 매 동기화가 장부를 새로 만들려 든다.
    const initial = {
      version: 2,
      lastSyncedAt: EXPECTED,
      deviceId: 'new-device',
      deviceName: '새 기기',
      files: {},
    };
    const createMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      .mockResolvedValueOnce(
        jsonResponse({ id: 'new-manifest', name: 'v2--manifest.json', modifiedTime: EXPECTED }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          files: [{ id: 'new-manifest', name: 'v2--manifest.json', modifiedTime: EXPECTED }],
        }),
      );
    vi.stubGlobal('fetch', createMock);
    const adapter = new DriveSyncAdapter(async () => 'test-token');

    const created = await adapter.createSyncFileIfMissing(
      'folder',
      'manifest.json',
      JSON.stringify(initial, null, 2),
    );
    expect(created).not.toBeNull();
    const createdName = await (createMock.mock.calls[1]?.[1]?.body as Blob).text();
    expect(createdName).toContain('"name":"v2--manifest.json"');

    // 같은 이름을 getSyncManifest 가 찾는지 — 조회 질의에 그 이름이 들어가야 한다.
    const readMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ files: [{ id: 'new-manifest', name: 'v2--manifest.json' }] }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(initial), { status: 200 }));
    vi.stubGlobal('fetch', readMock);

    await expect(adapter.getSyncManifest('folder')).resolves.toEqual(initial);
    expect(decodeURIComponent(String(readMock.mock.calls[0]?.[0]))).toContain(
      "name='v2--manifest.json'",
    );
  });

  it('파일 목록에서 v2 파일만 논리 이름으로 돌려준다', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        files: [
          { id: 'legacy', name: 'events.json', modifiedTime: EXPECTED },
          { id: 'v2-events', name: 'v2--events.json', modifiedTime: EXPECTED },
          { id: 'v2-manifest', name: 'v2--manifest.json', modifiedTime: EXPECTED },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new DriveSyncAdapter(async () => 'test-token');

    await expect(adapter.listSyncFiles('folder')).resolves.toEqual([
      { id: 'v2-events', name: 'events.json', modifiedTime: EXPECTED },
    ]);
  });

  it('지원 버전보다 새로운 v2 장부는 쓰기 전에 차단한다', async () => {
    const futureManifest = {
      version: 3,
      lastSyncedAt: EXPECTED,
      deviceId: 'future-device',
      deviceName: '미래 기기',
      files: {},
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ files: [{ id: 'future-manifest', name: 'v2--manifest.json' }] }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(futureManifest), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new DriveSyncAdapter(async () => 'test-token');

    await expect(adapter.getSyncManifest('folder')).rejects.toThrow('앱을 업데이트');
  });
});

describe('DriveSyncAdapter 동기화 폴더 경쟁 생성', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('폴더 생성 직후 같은 이름 폴더가 둘이면 방금 만든 폴더를 정리하고 중단한다', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'z-created-folder', name: '쌤핀 동기화' }))
      .mockResolvedValueOnce(
        jsonResponse({
          files: [
            { id: 'a-other-folder', name: '쌤핀 동기화' },
            { id: 'z-created-folder', name: '쌤핀 동기화' },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ id: 'z-created-folder', trashed: true }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new DriveSyncAdapter(async () => 'test-token');

    await expect(adapter.getOrCreateSyncFolder()).rejects.toThrow('동시에 생성');
    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({
      method: 'PATCH',
      body: JSON.stringify({ trashed: true }),
    });
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

  it('조건부 삭제는 수정 시각과 ETag가 같을 때만 DELETE한다', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          files: [{ id: 'note-file', name: 'note-body--1.json', modifiedTime: EXPECTED }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          { id: 'note-file', modifiedTime: EXPECTED },
          { headers: { ETag: '"note-revision-1"' } },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new DriveSyncAdapter(async () => 'test-token');

    await expect(
      adapter.deleteSyncFileIfUnchanged('folder', 'note-body--1.json', EXPECTED),
    ).resolves.toBe(true);
    const deleteInit = fetchMock.mock.calls[2]?.[1];
    expect(deleteInit?.method).toBe('DELETE');
    expect(new Headers(deleteInit?.headers).get('If-Match')).toBe('"note-revision-1"');
  });

  it('조건부 삭제 직전 수정 시각이 바뀌면 파일을 남긴다', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          files: [{ id: 'note-file', name: 'note-body--1.json', modifiedTime: EXPECTED }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ id: 'note-file', modifiedTime: '2026-08-24T09:00:00.000Z' }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new DriveSyncAdapter(async () => 'test-token');

    await expect(
      adapter.deleteSyncFileIfUnchanged('folder', 'note-body--1.json', EXPECTED),
    ).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('ETag를 읽을 수 없는 브라우저에서는 갱신 가능한 일반 파일 삭제를 보류한다', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          files: [{ id: 'note-file', name: 'note-body--1.json', modifiedTime: EXPECTED }],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ id: 'note-file', modifiedTime: EXPECTED }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new DriveSyncAdapter(async () => 'test-token');

    await expect(
      adapter.deleteSyncFileIfUnchanged('folder', 'note-body--1.json', EXPECTED),
    ).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('ETag가 없어도 세대명이 불변인 학생 사진은 수정 시각 확인 후 삭제한다', async () => {
    const filename = 'student-photos__student-1.jpg.json.rev-checksum-device';
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ files: [{ id: 'photo-file', name: filename, modifiedTime: EXPECTED }] }),
      )
      .mockResolvedValueOnce(jsonResponse({ id: 'photo-file', modifiedTime: EXPECTED }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new DriveSyncAdapter(async () => 'test-token');

    await expect(adapter.deleteSyncFileIfUnchanged('folder', filename, EXPECTED)).resolves.toBe(
      true,
    );
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe('DELETE');
    expect(new Headers(fetchMock.mock.calls[2]?.[1]?.headers).has('If-Match')).toBe(false);
  });
});
