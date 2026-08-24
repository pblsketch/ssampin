/*
  온라인 교무실 — 임시저장이 말머리·태그·첨부까지 왕복하는지 (056 근본 해법).

  배경: v2.4.4 릴리즈 전 UltraQA P1 — 임시저장이 제목·본문만 보관해, 쓰다 만 글을
  이어 열면 골라 둔 말머리·태그·첨부가 조용히 사라졌다. 임시 조치는 배너 문구를
  사실대로 바꾼 것뿐이었고, 여기서 세 값을 실제로 왕복시킨다.

  이 테스트가 잡는 회귀:
   1) 자동 저장이 세 값을 빼먹고 제목·본문만 보내는 것 (P1 재발)
   2) 자동 저장·버리기가 전역 context(loadPosts 가 채우는 값)에 다시 묶이는 것 —
      목록을 열지 않고 글쓰기부터 하면 엉뚱한 게시판에 저장되던 이원화 구조
   3) "말머리 없음"(null)을 고른 것이 "안 바꿈"으로 뭉개지는 것
   4) 게시 직후 임시저장 부활 (2026-08-24 에 고친 타이머 절단의 회귀)
*/
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { StaffRoomDraft } from '@domain/entities/StaffRoomBoard';

const saveDraft = vi.fn(
  async (
    _token: string,
    _departmentId: string,
    input: {
      moduleId?: string;
      title: string;
      body: string;
      bodyFormat: string;
      categoryId: string | null;
      tags: readonly string[];
      fileIds: readonly string[];
    },
  ) => ({
    moduleId: input.moduleId ?? 'board-1',
    title: input.title,
    body: input.body,
    bodyFormat: input.bodyFormat,
    categoryId: input.categoryId,
    tags: input.tags,
    fileIds: input.fileIds,
    updatedAt: '2026-08-24T01:00:00.000Z',
  }),
);
const getDraft = vi.fn(async (): Promise<StaffRoomDraft | null> => null);
const clearDraft = vi.fn(async () => {});
const createPost = vi.fn(async () => ({}));
const listPosts = vi.fn(async () => ({ moduleId: 'board-1', posts: [] }));

vi.mock('@adapters/di/container', () => ({
  staffRoomPort: { saveDraft, getDraft, clearDraft, createPost, listPosts },
  authenticateGoogle: {
    isConnected: async () => true,
    getValidAccessToken: async () => 'token-1',
  },
}));

const { useStaffRoomBoardStore } = await import('../useStaffRoomBoardStore');

/** 자동 저장 지연(1.5초)을 넘긴 뒤 안쪽 async 사슬(임포트·토큰)까지 흘려보낸다 */
const settleAutosave = async () => {
  await vi.advanceTimersByTimeAsync(1_600);
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

beforeEach(() => {
  vi.useFakeTimers();
  saveDraft.mockClear();
  getDraft.mockClear();
  clearDraft.mockClear();
  createPost.mockClear();
  listPosts.mockClear();
  useStaffRoomBoardStore.getState().reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('자동 저장 — 말머리·태그·첨부도 함께 보낸다 (056)', () => {
  it('★ 세 값이 제목·본문과 함께 서버로 간다', async () => {
    const s = useStaffRoomBoardStore.getState();
    s.updateDraft('dept-1', 'board-7', { title: '체육대회 안내' });
    s.updateDraft('dept-1', 'board-7', { categoryId: 'cat-1' });
    s.updateDraft('dept-1', 'board-7', { tags: ['체육대회'] });
    s.updateDraft('dept-1', 'board-7', { fileIds: ['11111111-1111-4111-8111-111111111111'] });
    await settleAutosave();

    // 타자마다 부르지 않는다 — 늦춰서 한 번만
    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(saveDraft.mock.calls[0]![2]).toMatchObject({
      moduleId: 'board-7',
      title: '체육대회 안내',
      categoryId: 'cat-1',
      tags: ['체육대회'],
      fileIds: ['11111111-1111-4111-8111-111111111111'],
    });
  });

  it('★ 전역 context 가 아니라 인자로 받은 게시판에 저장한다 (목록을 연 적이 없어도)', async () => {
    // loadPosts 를 한 번도 부르지 않은 상태 — 이원화 시절에는 context.moduleId 가
    // 비어 서버가 기본 게시판으로 밀어 넣었다.
    useStaffRoomBoardStore.getState().updateDraft('dept-1', 'board-7', { title: '제목' });
    await settleAutosave();

    expect(saveDraft.mock.calls[0]![2].moduleId).toBe('board-7');
  });

  it('"말머리 없음"(null)으로 되돌린 것도 저장된다 — "안 바꿈"과 다르다', async () => {
    const s = useStaffRoomBoardStore.getState();
    s.updateDraft('dept-1', 'board-7', { title: '제목', categoryId: 'cat-1' });
    s.updateDraft('dept-1', 'board-7', { categoryId: null });
    await settleAutosave();

    expect(useStaffRoomBoardStore.getState().draftCategoryId).toBeNull();
    expect(saveDraft.mock.calls[0]![2].categoryId).toBeNull();
  });
});

describe('불러오기·버리기 — 세 값의 복원과 정리', () => {
  it('★ loadDraft 가 세 값을 상태에 복원한다', async () => {
    getDraft.mockResolvedValueOnce({
      moduleId: 'board-7',
      title: '체육대회 안내',
      body: '본문',
      bodyFormat: 'plain',
      categoryId: 'cat-1',
      tags: ['체육대회', '준비물'],
      fileIds: ['11111111-1111-4111-8111-111111111111'],
      updatedAt: '2026-08-24T01:00:00.000Z',
    });
    await useStaffRoomBoardStore.getState().loadDraft('dept-1', 'board-7');

    const state = useStaffRoomBoardStore.getState();
    expect(state.draftCategoryId).toBe('cat-1');
    expect(state.draftTags).toEqual(['체육대회', '준비물']);
    expect(state.draftFileIds).toEqual(['11111111-1111-4111-8111-111111111111']);
  });

  it('임시저장이 없으면 세 값도 비운다 — 직전 글쓰기의 잔상이 남지 않게', async () => {
    useStaffRoomBoardStore.setState({
      draftCategoryId: 'cat-old',
      draftTags: ['잔상'],
      draftFileIds: ['22222222-2222-4222-8222-222222222222'],
    });
    getDraft.mockResolvedValueOnce(null);
    await useStaffRoomBoardStore.getState().loadDraft('dept-1', 'board-7');

    const state = useStaffRoomBoardStore.getState();
    expect(state.draftCategoryId).toBeNull();
    expect(state.draftTags).toEqual([]);
    expect(state.draftFileIds).toEqual([]);
  });

  it('★ discardDraft 는 인자로 받은 게시판의 것을 지우고 상태를 비운다', async () => {
    const s = useStaffRoomBoardStore.getState();
    s.updateDraft('dept-1', 'board-7', { title: '제목', tags: ['태그'] });
    await s.discardDraft('dept-1', 'board-7');

    expect(clearDraft).toHaveBeenCalledWith('token-1', 'dept-1', 'board-7');
    const state = useStaffRoomBoardStore.getState();
    expect(state.draftTitle).toBe('');
    expect(state.draftTags).toEqual([]);
  });
});

describe('게시 직후 임시저장 부활 방지 (2026-08-24 수정의 회귀 가드)', () => {
  it('★ 타자 1.5초 안에 [올리기]를 눌러도 임시저장 타이머가 발화하지 않는다', async () => {
    const s = useStaffRoomBoardStore.getState();
    s.updateDraft('dept-1', 'board-7', { title: '올릴 글', tags: ['태그'] });

    // 지연이 차기 전에 게시 — 타이머가 살아 있으면 게시 후 발화해 임시저장이 부활한다
    await s.writePost('dept-1', {
      title: '올릴 글',
      body: '',
      bodyFormat: 'plain',
      isRequired: false,
      mentionedEmails: [],
      categoryId: null,
      tags: ['태그'],
      fileIds: [],
    });
    await settleAutosave();

    expect(saveDraft).not.toHaveBeenCalled();
    // 화면 상태도 비워진다 — 다음 글쓰기에 "쓰시던 글"로 뜨지 않게
    expect(useStaffRoomBoardStore.getState().draftTags).toEqual([]);
  });
});
