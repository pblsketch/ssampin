/**
 * useMemoShareStore 단위 + 메타 테스트 (plan.md v2 E 섹션).
 *
 * 케이스:
 *   1) useMemoStore.subscribe 연동 — 공유 중 메모 수정 감지 → debounce 1.5s 묶음 → 1회 push
 *   2) 공유 중 메모 삭제 — 즉시 push하지 않고 확인 플로우(deletedMemoNotice) → confirm 시 push
 *   3) 구글 미로그인 게이트 — createBoard 거부 + 동기화 큐 보존("동기화 대기 중")
 *   4) syncPending 전이 — 실패 시 백오프 재시도 3회 → 큐 보존 + pending → 수동 재시도로 복구
 *   5) [메타] useMemoStore 무수정 — 공유 기능이 useMemoStore.ts를 침범하지 않음 (관찰만)
 *   6) [메타] SC-10 무서버 저장 — memoShare 경로에 supabase 호출 부재 (ShortLinkClient 제외)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Memo } from '@domain/entities/Memo';
import type { MemoShareBoard } from '@domain/entities/MemoShareBoard';
import { computeItemHash } from '@domain/rules/memoShareRules';

const ROOT = resolve(__dirname, '../../../..');
const NOW = '2026-06-11T00:00:00.000Z';

/* ──────────────────────────────────────────────────────────────────────────
 * DI container mock — 테스트는 Drive/스토리지를 전부 가짜로 대체한다.
 * (실제 MemoShareDriveClient는 다른 세션이 병렬 작성 중 — container가
 *  lazy dynamic import를 쓰므로 mock으로 완전히 차단된다)
 * ────────────────────────────────────────────────────────────────────────── */
const { fakes } = vi.hoisted(() => {
  const storageData = new Map<string, unknown>();
  return {
    fakes: {
      storageData,
      storage: {
        read: vi.fn(async (key: string) => storageData.get(key) ?? null),
        write: vi.fn(async (key: string, value: unknown) => {
          storageData.set(key, value);
        }),
        remove: vi.fn(async (key: string) => {
          storageData.delete(key);
        }),
        readBinary: vi.fn(async () => null),
        writeBinary: vi.fn(async () => undefined),
        removeBinary: vi.fn(async () => undefined),
        listBinary: vi.fn(async () => [] as readonly string[]),
      },
      client: {
        createBoard: vi.fn(async () => ({
          fileId: 'drive-file-1',
          imageFileIds: {} as Record<string, string>,
          createdAt: '2026-06-11T00:00:00.000Z',
        })),
        updateBoard: vi.fn(
          async (
            _fileId: string,
            _board: {
              items: readonly unknown[];
              title?: string;
              ttsVoice?: string;
              attention?: { kind: string; itemId?: string; nonce: string; requestedAt: string };
            },
            _imagesToUpload: readonly unknown[],
            _imageFileIdsToDelete: readonly string[],
          ) => ({
            imageFileIds: {} as Record<string, string>,
            updatedAt: '2026-06-11T01:00:00.000Z',
          }),
        ),
        deleteBoard: vi.fn(async () => undefined),
      },
      authenticateGoogle: {
        isConnected: vi.fn(async () => true),
        getValidAccessToken: vi.fn(async () => 'fake-token'),
      },
      shortLinkClient: {
        createShortLink: vi.fn(async (url: string) => url),
      },
    },
  };
});

vi.mock('@adapters/di/container', () => ({
  storage: fakes.storage,
  // useMemoStore가 모듈 로드 시점에 참조 — 본 테스트에서는 호출되지 않음
  memoRepository: {},
  authenticateGoogle: fakes.authenticateGoogle,
  getMemoShareClient: vi.fn(async () => fakes.client),
  resetMemoShareClient: vi.fn(),
  shortLinkClient: fakes.shortLinkClient,
}));

import { useMemoStore } from '@adapters/stores/useMemoStore';
import {
  useMemoShareStore,
  __resetMemoShareStoreForTests,
  SYNC_DEBOUNCE_MS,
  SYNC_RETRY_DELAYS_MS,
} from '@adapters/stores/useMemoShareStore';

function makeMemo(id: string, overrides: Partial<Memo> = {}): Memo {
  return {
    id,
    content: '내일 회의 준비',
    color: 'yellow',
    x: 40,
    y: 40,
    width: 280,
    height: 220,
    rotation: 0,
    createdAt: NOW,
    updatedAt: NOW,
    archived: false,
    fontSize: 'base',
    ...overrides,
  };
}

function makeBoard(memos: readonly Memo[], id = 'file-1'): MemoShareBoard {
  return {
    id,
    title: '우리 반 메모',
    shareUrl: `https://ssampin.com/memo/${id}`,
    items: memos.map((memo, index) => ({
      memoId: memo.id,
      sortOrder: index,
      lastSyncedAt: NOW,
      lastSyncedHash: computeItemHash(memo),
    })),
    createdAt: NOW,
    updatedAt: NOW,
  };
}

/** 보드를 영속 스토리지에 심고 store를 초기화한다 */
async function seedAndInitialize(board: MemoShareBoard, memos: readonly Memo[]): Promise<void> {
  fakes.storageData.set('memoShareBoards', { boards: [board] });
  useMemoStore.setState({ memos, loaded: true });
  await useMemoShareStore.getState().initialize();
}

beforeEach(() => {
  vi.useFakeTimers();
  __resetMemoShareStoreForTests();
  fakes.storageData.clear();
  fakes.storage.read.mockClear();
  fakes.storage.write.mockClear();
  fakes.client.createBoard.mockClear();
  fakes.client.updateBoard.mockClear();
  fakes.client.deleteBoard.mockClear();
  fakes.client.updateBoard.mockImplementation(async () => ({
    imageFileIds: {} as Record<string, string>,
    updatedAt: '2026-06-11T01:00:00.000Z',
  }));
  fakes.authenticateGoogle.isConnected.mockImplementation(async () => true);
  useMemoStore.setState({ memos: [], loaded: true });
});

afterEach(() => {
  __resetMemoShareStoreForTests();
  vi.useRealTimers();
});

describe('useMemoShareStore — subscribe 연동', () => {
  it('공유 중 메모가 수정되면 debounce 1.5s 후 동기화를 1회 push한다 (연속 수정 묶음)', async () => {
    const m1 = makeMemo('m1');
    await seedAndInitialize(makeBoard([m1]), [m1]);

    // 연속 수정 2회 — debounce로 1회 묶임
    useMemoStore.setState({
      memos: [{ ...m1, content: '수정 1', updatedAt: '2026-06-11T00:10:00.000Z' }],
    });
    await vi.advanceTimersByTimeAsync(500);
    useMemoStore.setState({
      memos: [{ ...m1, content: '수정 2', updatedAt: '2026-06-11T00:11:00.000Z' }],
    });

    expect(fakes.client.updateBoard).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS + 100);

    expect(fakes.client.updateBoard).toHaveBeenCalledTimes(1);
    expect(fakes.client.updateBoard).toHaveBeenCalledWith(
      'file-1',
      expect.objectContaining({ version: 1, title: '우리 반 메모' }),
      [],
      [],
    );

    const state = useMemoShareStore.getState();
    expect(state.syncStatus).toBe('idle');
    expect(state.pendingBoardIds).toHaveLength(0);
    // 동기화 결과(새 해시) 영속
    expect(fakes.storage.write).toHaveBeenCalledWith(
      'memoShareBoards',
      expect.objectContaining({ boards: expect.any(Array) }),
    );
    const link = state.boards[0]?.items[0];
    expect(link?.lastSyncedHash).toBe(
      computeItemHash({ ...m1, content: '수정 2', updatedAt: '2026-06-11T00:11:00.000Z' }),
    );
  });

  it('공유하지 않은 메모의 변경은 동기화를 트리거하지 않는다', async () => {
    const m1 = makeMemo('m1');
    const other = makeMemo('other');
    await seedAndInitialize(makeBoard([m1]), [m1, other]);

    useMemoStore.setState({ memos: [m1, { ...other, content: '무관한 수정' }] });
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS + 100);

    expect(fakes.client.updateBoard).not.toHaveBeenCalled();
    expect(useMemoShareStore.getState().pendingBoardIds).toHaveLength(0);
  });
});

describe('useMemoShareStore — 공유 메모 삭제 확인 흐름', () => {
  it('공유 중 메모 삭제는 즉시 push하지 않고 확인 플로우를 노출하고, confirm 시 push한다', async () => {
    const m1 = makeMemo('m1');
    await seedAndInitialize(makeBoard([m1]), [m1]);

    // 메모 삭제
    useMemoStore.setState({ memos: [] });
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS + 500);

    // 확인 전에는 push되지 않는다
    expect(fakes.client.updateBoard).not.toHaveBeenCalled();
    const notice = useMemoShareStore.getState().deletedMemoNotice;
    expect(notice).not.toBeNull();
    expect(notice?.memoIds).toEqual(['m1']);
    expect(notice?.boardIds).toEqual(['file-1']);

    // confirm → 해당 보드 즉시 동기화 (항목 제거 반영)
    useMemoShareStore.getState().confirmDeletedMemoSync();
    await vi.advanceTimersByTimeAsync(100);

    expect(fakes.client.updateBoard).toHaveBeenCalledTimes(1);
    const boardFile = fakes.client.updateBoard.mock.calls[0]?.[1];
    expect(boardFile?.items).toHaveLength(0);
    expect(useMemoShareStore.getState().deletedMemoNotice).toBeNull();
  });

  it('dismiss는 확인 플로우만 닫고 push하지 않는다', async () => {
    const m1 = makeMemo('m1');
    await seedAndInitialize(makeBoard([m1]), [m1]);

    useMemoStore.setState({ memos: [] });
    useMemoShareStore.getState().dismissDeletedMemoNotice();
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS + 500);

    expect(fakes.client.updateBoard).not.toHaveBeenCalled();
    expect(useMemoShareStore.getState().deletedMemoNotice).toBeNull();
  });
});

describe('useMemoShareStore — 구글 미로그인 게이트', () => {
  it('미로그인 시 createBoard는 거부되고 한국어 안내 error를 세팅한다', async () => {
    fakes.authenticateGoogle.isConnected.mockImplementation(async () => false);
    const m1 = makeMemo('m1');
    useMemoStore.setState({ memos: [m1], loaded: true });
    await useMemoShareStore.getState().initialize();

    const result = await useMemoShareStore.getState().createBoard(['m1'], '우리 반 메모');

    expect(result).toBeNull();
    expect(fakes.client.createBoard).not.toHaveBeenCalled();
    expect(useMemoShareStore.getState().error).toContain('로그인');
  });

  it('미로그인 중 변경분은 push하지 않고 큐 보존 + "동기화 대기 중"(pending) 상태가 된다', async () => {
    const m1 = makeMemo('m1');
    await seedAndInitialize(makeBoard([m1]), [m1]);
    fakes.authenticateGoogle.isConnected.mockImplementation(async () => false);

    useMemoStore.setState({ memos: [{ ...m1, content: '오프라인 수정' }] });
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS + 100);

    expect(fakes.client.updateBoard).not.toHaveBeenCalled();
    const state = useMemoShareStore.getState();
    expect(state.syncStatus).toBe('pending');
    expect(state.pendingBoardIds).toContain('file-1');
  });
});

describe('useMemoShareStore — syncPending 전이 (백오프 재시도)', () => {
  it('실패 시 백오프 재시도 3회 후에도 실패하면 큐 보존 + pending, 수동 재시도로 복구된다', async () => {
    const m1 = makeMemo('m1');
    await seedAndInitialize(makeBoard([m1]), [m1]);

    fakes.client.updateBoard.mockImplementation(async () => {
      throw new Error('network error');
    });

    useMemoStore.setState({ memos: [{ ...m1, content: '실패할 수정' }] });

    // debounce + 백오프 3회(1.5s/3s/6s) 전부 소진
    const totalRetryMs = SYNC_RETRY_DELAYS_MS.reduce((sum, ms) => sum + ms, 0);
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS + totalRetryMs + 1000);

    // 초기 시도 1회 + 재시도 3회 = 4회
    expect(fakes.client.updateBoard).toHaveBeenCalledTimes(1 + SYNC_RETRY_DELAYS_MS.length);
    const failed = useMemoShareStore.getState();
    expect(failed.syncStatus).toBe('pending');
    expect(failed.pendingBoardIds).toContain('file-1');
    expect(failed.error).not.toBeNull();

    // 복구 후 수동 재시도 → idle 전이 + 큐 비움
    fakes.client.updateBoard.mockImplementation(async () => ({
      imageFileIds: {} as Record<string, string>,
      updatedAt: '2026-06-11T02:00:00.000Z',
    }));
    useMemoShareStore.getState().retrySync();
    await vi.advanceTimersByTimeAsync(100);

    const recovered = useMemoShareStore.getState();
    expect(recovered.syncStatus).toBe('idle');
    expect(recovered.pendingBoardIds).toHaveLength(0);
    expect(recovered.error).toBeNull();
  });
});

describe('useMemoShareStore — updateBoardMemos (공유 중 보드 구성 편집)', () => {
  const PNG_IMAGE = {
    dataUrl: 'data:image/png;base64,QUFBQQ==',
    fileName: 'photo.png',
    mimeType: 'image/png',
    width: 100,
    height: 80,
    originalSize: 1000,
  } as const;

  it('포스트잇 추가: 새 메모는 이미지 업로드 포함 push되고 링크(fileId/shareUrl)는 불변이다', async () => {
    const m1 = makeMemo('m1');
    const m2 = makeMemo('m2', { content: '이미지 메모', image: PNG_IMAGE });
    await seedAndInitialize(makeBoard([m1]), [m1, m2]);
    fakes.client.updateBoard.mockImplementation(async () => ({
      imageFileIds: { m2: 'img-file-2' } as Record<string, string>,
      updatedAt: '2026-06-11T03:00:00.000Z',
    }));

    const ok = useMemoShareStore.getState().updateBoardMemos('file-1', ['m1', 'm2']);
    expect(ok).toBe(true);
    await vi.advanceTimersByTimeAsync(100);

    expect(fakes.client.updateBoard).toHaveBeenCalledTimes(1);
    const call = fakes.client.updateBoard.mock.calls[0];
    // 링크 불변 — 새 파일 생성이 아니라 같은 fileId로 updateBoard
    expect(call?.[0]).toBe('file-1');
    expect(call?.[1]?.items).toHaveLength(2);
    // 새 메모 이미지 업로드 포함
    expect(call?.[2]).toEqual([expect.objectContaining({ itemId: 'm2', mime: 'image/png' })]);
    expect(call?.[3]).toEqual([]);

    const board = useMemoShareStore.getState().boards[0];
    expect(board?.id).toBe('file-1');
    expect(board?.shareUrl).toBe('https://ssampin.com/memo/file-1');
    expect(board?.items.map((i) => i.memoId)).toEqual(['m1', 'm2']);
    expect(board?.items[1]?.imageFileId).toBe('img-file-2');
    expect(useMemoShareStore.getState().pendingBoardIds).toHaveLength(0);
  });

  it('포스트잇 제거: 보드 JSON에서 빠지고 해당 이미지 fileId가 Drive 삭제 목록에 담긴다', async () => {
    const m1 = makeMemo('m1');
    const m2 = makeMemo('m2', { content: '이미지 메모', image: PNG_IMAGE });
    const base = makeBoard([m1, m2]);
    const boardWithImage: MemoShareBoard = {
      ...base,
      items: base.items.map((link) =>
        link.memoId === 'm2' ? { ...link, imageFileId: 'img-old' } : link,
      ),
    };
    await seedAndInitialize(boardWithImage, [m1, m2]);

    const ok = useMemoShareStore.getState().updateBoardMemos('file-1', ['m1']);
    expect(ok).toBe(true);
    await vi.advanceTimersByTimeAsync(100);

    expect(fakes.client.updateBoard).toHaveBeenCalledTimes(1);
    const call = fakes.client.updateBoard.mock.calls[0];
    expect(call?.[0]).toBe('file-1');
    expect(call?.[1]?.items).toHaveLength(1);
    expect(call?.[2]).toEqual([]); // 업로드 없음
    expect(call?.[3]).toEqual(['img-old']); // 빠진 메모의 이미지 영구 삭제

    const board = useMemoShareStore.getState().boards[0];
    expect(board?.id).toBe('file-1');
    expect(board?.items.map((i) => i.memoId)).toEqual(['m1']);
    // 로컬 메모는 무손상 — 보드에서만 빠진다
    expect(useMemoStore.getState().memos.map((m) => m.id)).toContain('m2');
  });

  it('제목 변경: 보드 JSON title 갱신 + 링크 불변', async () => {
    const m1 = makeMemo('m1');
    await seedAndInitialize(makeBoard([m1]), [m1]);

    const ok = useMemoShareStore.getState().updateBoardMemos('file-1', ['m1'], '새 제목');
    expect(ok).toBe(true);
    await vi.advanceTimersByTimeAsync(100);

    expect(fakes.client.updateBoard).toHaveBeenCalledTimes(1);
    const call = fakes.client.updateBoard.mock.calls[0];
    expect(call?.[0]).toBe('file-1');
    expect((call?.[1] as { title?: string } | undefined)?.title).toBe('새 제목');

    const board = useMemoShareStore.getState().boards[0];
    expect(board?.title).toBe('새 제목');
    expect(board?.id).toBe('file-1');
    expect(board?.shareUrl).toBe('https://ssampin.com/memo/file-1');
  });

  it('0개 구성은 거부한다 (최소 1개) — 존재하지 않는 memoId만 넘겨도 거부', async () => {
    const m1 = makeMemo('m1');
    await seedAndInitialize(makeBoard([m1]), [m1]);

    expect(useMemoShareStore.getState().updateBoardMemos('file-1', [])).toBe(false);
    expect(useMemoShareStore.getState().updateBoardMemos('file-1', ['ghost'])).toBe(false);
    expect(useMemoShareStore.getState().error).toContain('1개 이상');

    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS + 500);
    expect(fakes.client.updateBoard).not.toHaveBeenCalled();
    // 거부 후에도 기존 보드 구성 유지
    expect(useMemoShareStore.getState().boards[0]?.items.map((i) => i.memoId)).toEqual(['m1']);
  });

  it('MAX_ITEMS(50) 초과 구성은 거부한다', async () => {
    const m1 = makeMemo('m1');
    const many = Array.from({ length: 51 }, (_, i) => makeMemo(`x${i}`));
    await seedAndInitialize(makeBoard([m1]), [m1, ...many]);

    const ok = useMemoShareStore.getState().updateBoardMemos(
      'file-1',
      many.map((m) => m.id),
    );
    expect(ok).toBe(false);
    expect(useMemoShareStore.getState().error).toContain('최대');

    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS + 500);
    expect(fakes.client.updateBoard).not.toHaveBeenCalled();
  });
});

describe('useMemoShareStore — 주목 (알림음/TTS 낭독)', () => {
  it('triggerAttention: debounce를 우회해 즉시 attention(chime)을 실어 업로드하고, 다음 일반 동기화에는 미포함(자연 소멸)', async () => {
    const m1 = makeMemo('m1');
    const board = { ...makeBoard([m1]), ttsVoice: 'male' as const };
    await seedAndInitialize(board, [m1]);

    const ok = await useMemoShareStore.getState().triggerAttention('file-1');
    expect(ok).toBe(true);
    await vi.advanceTimersByTimeAsync(100); // debounce(1.5s) 없이 즉시

    expect(fakes.client.updateBoard).toHaveBeenCalledTimes(1);
    const first = fakes.client.updateBoard.mock.calls[0]?.[1];
    expect(first?.attention?.kind).toBe('chime');
    expect(first?.attention?.nonce).toBeTruthy();
    expect(first?.attention?.itemId).toBeUndefined();
    // ttsVoice는 모든 동기화에 항상 실린다
    expect(first?.ttsVoice).toBe('male');

    // 다음 일반 동기화(메모 수정) — attention 미포함, ttsVoice는 유지
    useMemoStore.setState({
      memos: [{ ...m1, content: '수정', updatedAt: '2026-06-11T00:30:00.000Z' }],
    });
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS + 100);

    expect(fakes.client.updateBoard).toHaveBeenCalledTimes(2);
    const second = fakes.client.updateBoard.mock.calls[1]?.[1];
    expect(second?.attention).toBeUndefined();
    expect(second?.ttsVoice).toBe('male');
  });

  it('triggerTtsRead: attention(kind=tts)에 itemId가 실리고, 보드에 없는 메모는 거부한다', async () => {
    const m1 = makeMemo('m1');
    const other = makeMemo('other');
    await seedAndInitialize(makeBoard([m1]), [m1, other]);

    // 보드에 공유되지 않은 메모 → 거부
    expect(await useMemoShareStore.getState().triggerTtsRead('file-1', 'other')).toBe(false);
    expect(fakes.client.updateBoard).not.toHaveBeenCalled();

    const ok = await useMemoShareStore.getState().triggerTtsRead('file-1', 'm1');
    expect(ok).toBe(true);
    await vi.advanceTimersByTimeAsync(100);

    expect(fakes.client.updateBoard).toHaveBeenCalledTimes(1);
    const boardFile = fakes.client.updateBoard.mock.calls[0]?.[1];
    expect(boardFile?.attention?.kind).toBe('tts');
    expect(boardFile?.attention?.itemId).toBe('m1');
    expect(boardFile?.attention?.nonce).toBeTruthy();
  });

  it('미로그인이면 주목 신호를 거부하고 한국어 안내를 세팅한다', async () => {
    const m1 = makeMemo('m1');
    await seedAndInitialize(makeBoard([m1]), [m1]);
    fakes.authenticateGoogle.isConnected.mockImplementation(async () => false);

    expect(await useMemoShareStore.getState().triggerAttention('file-1')).toBe(false);
    expect(useMemoShareStore.getState().error).toContain('로그인');

    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS + 500);
    expect(fakes.client.updateBoard).not.toHaveBeenCalled();
  });

  it('setBoardTtsVoice: 보드 영속 + 내용 diff가 없어도 ttsVoice를 실어 업로드한다', async () => {
    const m1 = makeMemo('m1');
    await seedAndInitialize(makeBoard([m1]), [m1]);

    await useMemoShareStore.getState().setBoardTtsVoice('file-1', 'male');

    // 로컬 보드 갱신 + 영속
    expect(useMemoShareStore.getState().boards[0]?.ttsVoice).toBe('male');
    expect(fakes.storage.write).toHaveBeenCalledWith(
      'memoShareBoards',
      expect.objectContaining({ boards: expect.any(Array) }),
    );

    // 내용 변경이 전혀 없어도 forceUpload로 업로드된다 (일반 debounce 경유)
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS + 100);
    expect(fakes.client.updateBoard).toHaveBeenCalledTimes(1);
    const boardFile = fakes.client.updateBoard.mock.calls[0]?.[1];
    expect(boardFile?.ttsVoice).toBe('male');
    expect(boardFile?.attention).toBeUndefined();
    expect(useMemoShareStore.getState().syncStatus).toBe('idle');
  });
});

/* ──────────────────────────────────────────────────────────────────────────
 * 메타 테스트
 * ────────────────────────────────────────────────────────────────────────── */

describe('[메타] useMemoStore 무수정 (subscribe 관찰만)', () => {
  it('useMemoStore.ts는 교실 공유(memoShare)를 전혀 알지 못한다', () => {
    const source = readFileSync(resolve(ROOT, 'src/adapters/stores/useMemoStore.ts'), 'utf8');
    expect(
      /memoshare/i.test(source),
      'useMemoStore.ts에 memoShare 참조가 생겼습니다. 로컬 메모가 원본이며 공유 기능은 ' +
        'subscribe 관찰만 해야 합니다 — useMemoStore는 수정 금지.',
    ).toBe(false);
  });

  it('useMemoShareStore는 useMemoStore를 subscribe/getState로 관찰만 하고 setState하지 않는다', () => {
    const source = readFileSync(resolve(ROOT, 'src/adapters/stores/useMemoShareStore.ts'), 'utf8');
    expect(source).toContain('useMemoStore.subscribe');
    expect(
      source.includes('useMemoStore.setState'),
      'useMemoShareStore가 useMemoStore.setState를 호출합니다 — 관찰만 허용됩니다.',
    ).toBe(false);
  });
});

describe('[메타] SC-10 무서버 저장 — memoShare 경로에 supabase 호출 부재', () => {
  /**
   * 공유 데이터(내용·이미지)는 선생님 개인 Google Drive에만 저장된다.
   * memoShare 경로에서 허용되는 유일한 supabase 접점은 숏링크(ShortLinkClient,
   * URL 문자열만 저장)뿐이다. 그 외 supabase 참조가 생기면 무서버 저장 원칙 위반.
   */
  const MEMO_SHARE_FILES = [
    'src/domain/entities/MemoShareBoard.ts',
    'src/domain/entities/MemoShareItem.ts',
    'src/domain/ports/IMemoShareClient.ts',
    'src/domain/rules/memoShareRules.ts',
    'src/usecases/memoShare/CreateShareBoard.ts',
    'src/usecases/memoShare/SyncShareBoard.ts',
    'src/usecases/memoShare/StopSharing.ts',
    'src/adapters/stores/useMemoShareStore.ts',
    'src/adapters/components/Memo/MemoShareModal.tsx',
    'src/adapters/components/Memo/MemoShareBadge.tsx',
    // 다른 세션이 병렬 작성 중 — 존재하면 함께 검사
    'src/infrastructure/google/MemoShareDriveClient.ts',
  ] as const;

  it('memoShare 경로 파일의 supabase 참조는 ShortLinkClient(숏링크) 한정이다', () => {
    const violations: string[] = [];
    for (const relPath of MEMO_SHARE_FILES) {
      const fullPath = resolve(ROOT, relPath);
      if (!existsSync(fullPath)) continue;
      const lines = readFileSync(fullPath, 'utf8').split('\n');
      lines.forEach((line, index) => {
        if (!/supabase/i.test(line)) return;
        // 허용: 숏링크(URL 문자열만 저장) 관련 라인
        if (/shortlink/i.test(line)) return;
        violations.push(`${relPath}:${index + 1} → ${line.trim()}`);
      });
    }
    expect(
      violations,
      'memoShare 경로에서 ShortLinkClient 외 supabase 참조가 발견되었습니다 (무서버 저장 ' +
        `원칙 SC-10 위반):\n${violations.join('\n')}`,
    ).toEqual([]);
  });

  it('useMemoShareStore의 외부 클라이언트는 Drive 포트(getMemoShareClient)와 숏링크뿐이다', () => {
    const source = readFileSync(resolve(ROOT, 'src/adapters/stores/useMemoShareStore.ts'), 'utf8');
    expect(source).toContain('getMemoShareClient');
    // 다른 Supabase 클라이언트(과제수합/서명/설문 등) 사용 금지
    for (const banned of [
      'assignmentSupabaseClient',
      'signatureSupabaseClient',
      'surveySupabaseClient',
      'consultationSupabaseClient',
    ]) {
      expect(
        source.includes(banned),
        `useMemoShareStore가 ${banned}를 사용합니다 — 무서버 저장 원칙 위반.`,
      ).toBe(false);
    }
  });
});
