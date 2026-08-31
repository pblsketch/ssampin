/**
 * REGRESSION — Drive 파일 목록 페이지네이션.
 *
 * Drive files.list 는 pageSize 를 주지 않으면 100개까지만 돌려준다. 옛 구현은
 * pageToken 을 따라가지 않아 폴더 파일이 100개를 넘으면 목록이 조용히 잘렸고,
 * 그 뒤로는 실제로 존재하는 파일을 "없다"고 판정해
 *   - 업로드가 "클라우드 teacher-schedule 파일이 동기화 중 생성되었습니다"로 영구 교착
 *   - 다운로드는 이름순 뒤쪽 파일을 통째로 누락
 * 됐다(v2.4.7 실사용 신고). 이 테스트는 그 상태로 되돌아가는 걸 막는다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DriveSyncAdapter } from '../DriveSyncAdapter';

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function page(names: string[], nextPageToken?: string) {
  return jsonResponse({
    files: names.map((name, i) => ({
      id: `${name}-id-${i}`,
      name,
      modifiedTime: '2026-09-01T00:00:00.000Z',
    })),
    ...(nextPageToken ? { nextPageToken } : {}),
  });
}

describe('DriveSyncAdapter.listSyncFiles 페이지네이션', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('nextPageToken을 끝까지 따라가 2페이지 뒤의 파일도 목록에 담는다', async () => {
    const firstPage = Array.from({ length: 100 }, (_, i) => `v2--student-photos__p${i}.json`);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page(firstPage, 'token-2'))
      .mockResolvedValueOnce(page(['v2--teacher-schedule.json'], 'token-3'))
      .mockResolvedValueOnce(page(['v2--todos.json']));
    vi.stubGlobal('fetch', fetchMock);

    const files = await new DriveSyncAdapter(async () => 'test-token').listSyncFiles('folder');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    // 잘린 목록이면 여기서 teacher-schedule 이 사라져 업로드가 교착에 빠졌다.
    expect(files.map((f) => f.name)).toContain('teacher-schedule.json');
    expect(files.map((f) => f.name)).toContain('todos.json');
    expect(files).toHaveLength(102);
  });

  it('한 페이지 요청에 pageSize와 pageToken을 실어 보낸다', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page(['v2--settings.json'], 'token-2'))
      .mockResolvedValueOnce(page(['v2--teacher-schedule.json']));
    vi.stubGlobal('fetch', fetchMock);

    await new DriveSyncAdapter(async () => 'test-token').listSyncFiles('folder');

    const firstUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(firstUrl).toContain('pageSize=1000');
    expect(firstUrl).toContain('nextPageToken');
    expect(firstUrl).not.toContain('pageToken=');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('pageToken=token-2');
  });

  it('같은 pageToken이 반복돼도 무한 루프에 빠지지 않는다', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      // Response 본문은 한 번만 읽히므로 호출마다 새로 만든다.
      .mockImplementation(async () => page(['v2--teacher-schedule.json'], 'same-token'));
    vi.stubGlobal('fetch', fetchMock);

    const files = await new DriveSyncAdapter(async () => 'test-token').listSyncFiles('folder');

    // 검증 대상은 "멈춘다"는 것 — 토큰이 그대로면 한 번 더 받고 끝낸다.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(files).toHaveLength(2);
  });

  it('장부(manifest)와 v2 접두사가 없는 파일은 목록에서 제외한다', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        page(['v2--manifest.json', 'manifest.json', 'events.json', 'v2--events.json']),
      );
    vi.stubGlobal('fetch', fetchMock);

    const files = await new DriveSyncAdapter(async () => 'test-token').listSyncFiles('folder');

    expect(files.map((f) => f.name)).toEqual(['events.json']);
  });
});
