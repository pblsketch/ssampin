import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleDriveClient } from './GoogleDriveClient';
import {
  BOARD_FILE_MISSING_MESSAGE,
  MemoShareDriveClient,
  WORKSPACE_SHARING_BLOCKED_MESSAGE,
} from './MemoShareDriveClient';
import type { MemoShareBoardFile } from '@domain/entities/MemoShareItem';
import type { MemoShareImageUpload } from '@domain/ports/IMemoShareClient';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** fetch 응답 mock */
function mockResponse(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

/** i번째 fetch 호출의 [url, init] */
function call(fetchMock: ReturnType<typeof vi.fn>, index: number): [string, RequestInit] {
  const entry = fetchMock.mock.calls[index];
  if (!entry) throw new Error(`fetch 호출 ${index}번이 없습니다`);
  return [entry[0] as string, (entry[1] ?? {}) as RequestInit];
}

/** multipart 업로드 body(Blob) → 텍스트 */
async function bodyText(init: RequestInit): Promise<string> {
  const body = init.body;
  if (body instanceof Blob) return body.text();
  return String(body);
}

// 'hello' base64
const PNG_DATA_URL = 'data:image/png;base64,aGVsbG8=';

const IMAGE_UPLOAD: MemoShareImageUpload = {
  itemId: 'm1',
  dataUrl: PNG_DATA_URL,
  mime: 'image/png',
};

function makeBoard(withImage: boolean): MemoShareBoardFile {
  return {
    version: 1,
    title: '우리 반 메모',
    updatedAt: '2026-06-11T02:30:00.000Z',
    items: [
      {
        id: 'm1',
        content: '안녕하세요',
        color: 'yellow',
        fontSize: 'base',
        sortOrder: 0,
        updatedAt: '2026-06-11T02:00:00.000Z',
        ...(withImage ? { image: { fileId: '', width: 100, height: 80 } } : {}),
      },
    ],
  };
}

describe('GoogleDriveClient 신규 메서드 (plan C-3 W5·W7)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let drive: GoogleDriveClient;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    drive = new GoogleDriveClient(() => Promise.resolve('test-token'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('createPublicPermission: POST /files/{id}/permissions + {type:anyone, role:reader}', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, { id: 'perm-1' }));

    await drive.createPublicPermission('file-1');

    const [url, init] = call(fetchMock, 0);
    expect(url).toBe('https://www.googleapis.com/drive/v3/files/file-1/permissions');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ type: 'anyone', role: 'reader' });
  });

  it('deleteFile: DELETE /files/{id} — 204 정상 처리', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(204));

    await expect(drive.deleteFile('file-1')).resolves.toBeUndefined();

    const [url, init] = call(fetchMock, 0);
    expect(url).toBe('https://www.googleapis.com/drive/v3/files/file-1');
    expect(init.method).toBe('DELETE');
  });

  it('deleteFile: 404는 조용히 무시 (이미 삭제됨 — 멱등)', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(404, 'File not found'));

    await expect(drive.deleteFile('file-gone')).resolves.toBeUndefined();
  });

  it('deleteFile: 404 외 오류는 그대로 throw', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(500, 'Internal error'));

    await expect(drive.deleteFile('file-1')).rejects.toThrow(/500/);
  });
});

describe('MemoShareDriveClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: MemoShareDriveClient;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    client = new MemoShareDriveClient(() => Promise.resolve('test-token'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** 폴더 보장 2단계 응답 enqueue: 루트 검색 → 자식 목록(기존 서브폴더 유무 선택) */
  function enqueueFolderLookup(subFolderExists: boolean): void {
    fetchMock.mockResolvedValueOnce(
      mockResponse(200, { files: [{ id: 'root-1', name: '쌤핀 과제' }] }),
    );
    fetchMock.mockResolvedValueOnce(
      mockResponse(200, {
        files: subFolderExists
          ? [{ id: 'share-1', name: '교실 공유 메모', mimeType: FOLDER_MIME }]
          : [],
      }),
    );
  }

  describe('createBoard', () => {
    it('폴더 보장 → 이미지 업로드 → 권한 → JSON 업로드(fileId 치환) → 권한 순서', async () => {
      enqueueFolderLookup(false);
      // 서브폴더 생성
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, { id: 'share-1', name: '교실 공유 메모', mimeType: FOLDER_MIME }),
      );
      // 이미지 업로드
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, { id: 'img-file-1', name: 'img-m1.png', mimeType: 'image/png' }),
      );
      // 이미지 권한
      fetchMock.mockResolvedValueOnce(mockResponse(200, { id: 'perm-1' }));
      // JSON 업로드
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, {
          id: 'board-file-1',
          name: 'board-x.json',
          mimeType: 'application/json',
          createdTime: '2026-06-11T03:00:00.000Z',
        }),
      );
      // JSON 권한
      fetchMock.mockResolvedValueOnce(mockResponse(200, { id: 'perm-2' }));

      const result = await client.createBoard(makeBoard(true), [IMAGE_UPLOAD]);

      expect(result).toEqual({
        fileId: 'board-file-1',
        imageFileIds: { m1: 'img-file-1' },
        createdAt: '2026-06-11T03:00:00.000Z',
      });

      // 서브폴더 생성 바디
      const [subUrl, subInit] = call(fetchMock, 2);
      expect(subUrl).toBe('https://www.googleapis.com/drive/v3/files');
      expect(JSON.parse(subInit.body as string)).toEqual({
        name: '교실 공유 메모',
        mimeType: FOLDER_MIME,
        parents: ['root-1'],
      });

      // 이미지 multipart 업로드 — 파일명 img-{itemId}.{ext}
      const [imgUrl, imgInit] = call(fetchMock, 3);
      expect(imgUrl).toContain('/upload/drive/v3/files?uploadType=multipart');
      expect(imgInit.method).toBe('POST');
      const imgBody = await bodyText(imgInit);
      expect(imgBody).toContain('"name":"img-m1.png"');
      expect(imgBody).toContain('"parents":["share-1"]');

      // 이미지 업로드 직후 권한 부여
      const [permUrl, permInit] = call(fetchMock, 4);
      expect(permUrl).toBe('https://www.googleapis.com/drive/v3/files/img-file-1/permissions');
      expect(JSON.parse(permInit.body as string)).toEqual({ type: 'anyone', role: 'reader' });

      // JSON 업로드 — image.fileId가 업로드된 Drive fileId로 치환되어 있어야 함
      const [jsonUrl, jsonInit] = call(fetchMock, 5);
      expect(jsonUrl).toContain('/upload/drive/v3/files?uploadType=multipart');
      const jsonBody = await bodyText(jsonInit);
      expect(jsonBody).toMatch(/"name":"board-[0-9a-f-]+\.json"/);
      expect(jsonBody).toContain('"fileId":"img-file-1"');
      expect(jsonBody).not.toContain('"fileId":""');

      // JSON 업로드 직후 권한 부여
      const [jsonPermUrl] = call(fetchMock, 6);
      expect(jsonPermUrl).toBe(
        'https://www.googleapis.com/drive/v3/files/board-file-1/permissions',
      );
    });

    it('권한 부여 403(워크스페이스 차단) → 생성 파일 전부 롤백 삭제 + 한국어 안내 throw', async () => {
      enqueueFolderLookup(true);
      // 이미지 업로드 성공
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, { id: 'img-file-1', name: 'img-m1.png', mimeType: 'image/png' }),
      );
      // 이미지 권한 403 (워크스페이스 정책)
      fetchMock.mockResolvedValueOnce(
        mockResponse(403, { error: { message: 'insufficientPermissions' } }),
      );
      // 롤백 DELETE
      fetchMock.mockResolvedValueOnce(mockResponse(204));

      await expect(client.createBoard(makeBoard(true), [IMAGE_UPLOAD])).rejects.toThrow(
        WORKSPACE_SHARING_BLOCKED_MESSAGE,
      );

      // 롤백: 업로드된 이미지가 영구 삭제됐는지
      const [rollbackUrl, rollbackInit] = call(fetchMock, 4);
      expect(rollbackUrl).toBe('https://www.googleapis.com/drive/v3/files/img-file-1');
      expect(rollbackInit.method).toBe('DELETE');
    });

    it('폴더 캐시: createBoard 2회 호출 시 폴더 조회(GET files?q=)는 1회만', async () => {
      const board = makeBoard(false);
      enqueueFolderLookup(true);
      // 1회차: JSON 업로드 + 권한
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, { id: 'board-file-1', name: 'b1.json', mimeType: 'application/json' }),
      );
      fetchMock.mockResolvedValueOnce(mockResponse(200, { id: 'perm-1' }));
      // 2회차: JSON 업로드 + 권한 (폴더 조회 없음)
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, { id: 'board-file-2', name: 'b2.json', mimeType: 'application/json' }),
      );
      fetchMock.mockResolvedValueOnce(mockResponse(200, { id: 'perm-2' }));

      await client.createBoard(board, []);
      await client.createBoard(board, []);

      const folderLookups = fetchMock.mock.calls.filter((c) =>
        (c[0] as string).includes('/drive/v3/files?q='),
      );
      // 루트 검색 1회 + 자식 목록 1회 — 2회째 호출에서는 캐시 사용
      expect(folderLookups).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalledTimes(6);
    });
  });

  describe('updateBoard', () => {
    it('신규 이미지 업로드+권한 → 삭제 대상 DELETE → JSON PATCH 전체 교체', async () => {
      enqueueFolderLookup(true);
      // 신규 이미지 업로드
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, { id: 'img-new-1', name: 'img-m1.png', mimeType: 'image/png' }),
      );
      // 이미지 권한
      fetchMock.mockResolvedValueOnce(mockResponse(200, { id: 'perm-1' }));
      // 삭제 대상 이미지 DELETE
      fetchMock.mockResolvedValueOnce(mockResponse(204));
      // JSON PATCH
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, {
          id: 'board-file-1',
          name: 'b1.json',
          mimeType: 'application/json',
        }),
      );

      const board = makeBoard(true);
      const result = await client.updateBoard('board-file-1', board, [IMAGE_UPLOAD], ['img-old-1']);

      expect(result).toEqual({
        imageFileIds: { m1: 'img-new-1' },
        updatedAt: board.updatedAt,
      });

      // 삭제 대상 이미지 영구 삭제
      const [delUrl, delInit] = call(fetchMock, 4);
      expect(delUrl).toBe('https://www.googleapis.com/drive/v3/files/img-old-1');
      expect(delInit.method).toBe('DELETE');

      // JSON 전체 교체 PATCH — fileId 치환 포함
      const [patchUrl, patchInit] = call(fetchMock, 5);
      expect(patchUrl).toContain('/upload/drive/v3/files/board-file-1?uploadType=multipart');
      expect(patchInit.method).toBe('PATCH');
      const patchBody = await bodyText(patchInit);
      expect(patchBody).toContain('"fileId":"img-new-1"');
    });

    it('JSON PATCH 404 → "공유 끊김" 한국어 안내 + code 404 보존', async () => {
      enqueueFolderLookup(true);
      // JSON PATCH 404 (사용자가 Drive에서 직접 삭제)
      fetchMock.mockResolvedValueOnce(mockResponse(404, 'File not found'));

      let caught: unknown;
      try {
        await client.updateBoard('board-gone', makeBoard(false), [], []);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe(BOARD_FILE_MISSING_MESSAGE);
      expect((caught as Error & { code?: number }).code).toBe(404);
    });
  });

  describe('deleteBoard', () => {
    it('이미지 전부 + JSON을 DELETE — 404는 무시(멱등)', async () => {
      // 이미지 1: 404 (이미 삭제됨)
      fetchMock.mockResolvedValueOnce(mockResponse(404, 'File not found'));
      // 이미지 2: 204
      fetchMock.mockResolvedValueOnce(mockResponse(204));
      // JSON: 204
      fetchMock.mockResolvedValueOnce(mockResponse(204));

      await expect(client.deleteBoard('board-file-1', ['img-1', 'img-2'])).resolves.toBeUndefined();

      expect(fetchMock).toHaveBeenCalledTimes(3);
      const urls = [0, 1, 2].map((i) => call(fetchMock, i)[0]);
      expect(urls).toEqual([
        'https://www.googleapis.com/drive/v3/files/img-1',
        'https://www.googleapis.com/drive/v3/files/img-2',
        'https://www.googleapis.com/drive/v3/files/board-file-1',
      ]);
      for (const i of [0, 1, 2]) {
        expect(call(fetchMock, i)[1].method).toBe('DELETE');
      }
    });
  });
});
