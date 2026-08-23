/**
 * 온라인 교무실 게시판 스토어 (M2)
 *
 * 부서·멤버·초대는 `useStaffRoomStore` 가 맡고, 여기는 글·댓글·임시저장만 다룬다.
 * 한 스토어에 다 넣으면 부서 화면을 열 때마다 글 상태까지 딸려 다니게 된다.
 *
 * 계획서에서 이 파일이 지켜야 할 것:
 *  - §3.5-다 목록에는 본문이 없다. 본문은 글을 열 때 따로 받는다.
 *  - §3.5-나 안 읽음은 "마지막 본 시각" 한 줄로 푼다. 사람×글 기록을 만들지 않는다.
 *  - §8-A  임시저장은 자동으로 — 긴 글을 한 번 날리면 두 번 다시 안 쓴다.
 */
import { create } from 'zustand';
import { DEFAULT_STAFFROOM_BODY_FORMAT } from '@domain/entities/StaffRoomBoard';
import type {
  StaffRoomBodyFormat,
  StaffRoomComment,
  StaffRoomPost,
  StaffRoomPostSummary,
  StaffRoomReadStatus,
} from '@domain/entities/StaffRoomBoard';

/** 임시저장을 서버로 보내기 전에 기다리는 시간 — 타자 한 글자마다 부르지 않기 위해 */
const DRAFT_SAVE_DELAY_MS = 1_500;

/** 실패 원인을 한국어 한 줄로 — 서버가 준 문구가 있으면 그대로 */
function messageOf(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return '요청 처리 중 오류가 발생했습니다.';
}

/** 구글 access token — 연결이 안 돼 있으면 null */
async function getGoogleToken(): Promise<string | null> {
  try {
    const { authenticateGoogle } = await import('@adapters/di/container');
    if (!(await authenticateGoogle.isConnected())) return null;
    return await authenticateGoogle.getValidAccessToken();
  } catch {
    return null;
  }
}

/** 지금 어느 부서·게시판을 보고 있는지 */
interface BoardContext {
  readonly departmentId: string;
  readonly moduleId: string | null;
}

interface StaffRoomBoardState {
  posts: StaffRoomPostSummary[];
  /** 열어 본 글. null 이면 목록 화면 */
  currentPost: StaffRoomPost | null;
  comments: StaffRoomComment[];
  /** 필독 글의 읽음 현황. 일반 글이면 null */
  readStatus: (StaffRoomReadStatus & { isRequired: boolean }) | null;

  /** 쓰던 글 */
  draftTitle: string;
  draftBody: string;
  /**
   * 쓰던 글의 본문 형식.
   *
   * 불러온 임시저장이 어떤 형식이었는지 기억해 두었다가 저장할 때 그대로
   * 돌려보낸다. 기억하지 않으면 서식으로 쓰다 만 글을 이어 쓸 때 맨글로
   * 덮어써져 서식이 풀린다.
   */
  draftBodyFormat: StaffRoomBodyFormat;
  draftMentions: string[];
  /** 마지막으로 자동 저장된 시각. 화면이 "자동 저장됨"을 보여줄 때 쓴다 */
  draftSavedAt: string | null;

  isLoading: boolean;
  hasLoadedPosts: boolean;
  error: string | null;

  loadPosts: (departmentId: string, moduleId?: string) => Promise<void>;
  openPost: (departmentId: string, postId: string) => Promise<void>;
  closePost: () => void;

  writePost: (
    departmentId: string,
    input: {
      title: string;
      body: string;
      /** 본문을 무슨 형식으로 썼는지 — 편집기가 정해서 넘긴다 */
      bodyFormat: StaffRoomBodyFormat;
      isRequired: boolean;
      mentionedEmails: string[];
    },
  ) => Promise<boolean>;
  editPost: (
    departmentId: string,
    postId: string,
    input: {
      title: string;
      body: string;
      bodyFormat: StaffRoomBodyFormat;
      mentionedEmails: string[];
    },
  ) => Promise<boolean>;
  setRequired: (departmentId: string, postId: string, isRequired: boolean) => Promise<void>;
  removePost: (departmentId: string, postId: string) => Promise<boolean>;

  addComment: (departmentId: string, postId: string, body: string) => Promise<boolean>;
  removeComment: (departmentId: string, commentId: string) => Promise<void>;

  /** 쓰던 글 불러오기 (글쓰기 화면을 열 때) */
  loadDraft: (departmentId: string, moduleId?: string) => Promise<void>;
  /** 타자에 따라 부르면 알아서 늦춰서 저장한다 */
  updateDraft: (
    departmentId: string,
    patch: { title?: string; body?: string; bodyFormat?: StaffRoomBodyFormat; mentions?: string[] },
  ) => void;
  /** 쓰던 글 버리기 */
  discardDraft: (departmentId: string) => Promise<void>;

  clearError: () => void;
  reset: () => void;
}

/** 자동 저장 타이머 — 스토어 밖에 둔다(상태가 아니라 부수 효과라서) */
let draftTimer: ReturnType<typeof setTimeout> | null = null;
let context: BoardContext = { departmentId: '', moduleId: null };

export const useStaffRoomBoardStore = create<StaffRoomBoardState>((set, get) => ({
  posts: [],
  currentPost: null,
  comments: [],
  readStatus: null,
  draftTitle: '',
  draftBody: '',
  draftBodyFormat: DEFAULT_STAFFROOM_BODY_FORMAT,
  draftMentions: [],
  draftSavedAt: null,
  isLoading: false,
  hasLoadedPosts: false,
  error: null,

  clearError: () => set({ error: null }),

  reset: () => {
    if (draftTimer) {
      clearTimeout(draftTimer);
      draftTimer = null;
    }
    context = { departmentId: '', moduleId: null };
    set({
      posts: [],
      currentPost: null,
      comments: [],
      readStatus: null,
      draftTitle: '',
      draftBody: '',
      draftBodyFormat: DEFAULT_STAFFROOM_BODY_FORMAT,
      draftMentions: [],
      draftSavedAt: null,
      hasLoadedPosts: false,
      error: null,
    });
  },

  closePost: () => set({ currentPost: null, comments: [], readStatus: null }),

  loadPosts: async (departmentId, moduleId) => {
    set({ isLoading: true, error: null });
    const token = await getGoogleToken();
    if (!token) {
      set({ isLoading: false, error: '구글 로그인이 필요합니다.' });
      return;
    }
    try {
      const { staffRoomPort } = await import('@adapters/di/container');
      const res = await staffRoomPort.listPosts(token, departmentId, moduleId);
      context = { departmentId, moduleId: res.moduleId };
      set({ posts: res.posts, isLoading: false, hasLoadedPosts: true });
    } catch (err) {
      set({ isLoading: false, error: messageOf(err) });
    }
  },

  openPost: async (departmentId, postId) => {
    set({ isLoading: true, error: null });
    const token = await getGoogleToken();
    if (!token) {
      set({ isLoading: false, error: '구글 로그인이 필요합니다.' });
      return;
    }
    try {
      const { staffRoomPort } = await import('@adapters/di/container');
      const [detail, comments] = await Promise.all([
        staffRoomPort.getPost(token, departmentId, postId),
        staffRoomPort.listComments(token, departmentId, postId),
      ]);

      // 읽음 현황은 필독 글에만 있다(§3.5-나). 일반 글에는 부르지 않는다.
      const readStatus = detail.post.isRequired
        ? await staffRoomPort.getPostReaders(token, departmentId, postId).catch((e: unknown) => {
            console.error('[StaffRoomBoard] 읽음 현황 조회 실패:', e);
            return null;
          })
        : null;

      set({ currentPost: detail.post, comments, readStatus, isLoading: false });

      // 글을 열면 그 글은 읽은 것이 된다 — 목록도 맞춰 준다
      set((state) => ({
        posts: state.posts.map((p) => (p.id === postId ? { ...p, isUnread: false } : p)),
      }));
    } catch (err) {
      set({ isLoading: false, error: messageOf(err) });
    }
  },

  writePost: async (departmentId, input) => {
    if (!input.title.trim()) {
      set({ error: '제목을 입력해주세요.' });
      return false;
    }
    set({ isLoading: true, error: null });
    const token = await getGoogleToken();
    if (!token) {
      set({ isLoading: false, error: '구글 로그인이 필요합니다.' });
      return false;
    }
    try {
      const { staffRoomPort } = await import('@adapters/di/container');
      await staffRoomPort.createPost(token, departmentId, {
        moduleId: context.moduleId ?? '',
        title: input.title,
        body: input.body,
        bodyFormat: input.bodyFormat,
        isRequired: input.isRequired,
        mentionedEmails: input.mentionedEmails,
      });
      // 올렸으면 쓰던 글은 서버에서도 지워진다 — 화면 상태도 비운다
      set({
        draftTitle: '',
        draftBody: '',
        draftBodyFormat: DEFAULT_STAFFROOM_BODY_FORMAT,
        draftMentions: [],
        draftSavedAt: null,
      });
      await get().loadPosts(departmentId, context.moduleId ?? undefined);
      return true;
    } catch (err) {
      set({ isLoading: false, error: messageOf(err) });
      return false;
    }
  },

  editPost: async (departmentId, postId, input) => {
    if (!input.title.trim()) {
      set({ error: '제목을 입력해주세요.' });
      return false;
    }
    set({ isLoading: true, error: null });
    const token = await getGoogleToken();
    if (!token) {
      set({ isLoading: false, error: '구글 로그인이 필요합니다.' });
      return false;
    }
    try {
      const { staffRoomPort } = await import('@adapters/di/container');
      const post = await staffRoomPort.updatePost(token, departmentId, postId, input);
      set((state) => ({
        currentPost: post,
        posts: state.posts.map((p) =>
          p.id === postId ? { ...p, title: post.title, updatedAt: post.updatedAt } : p,
        ),
        isLoading: false,
      }));
      return true;
    } catch (err) {
      set({ isLoading: false, error: messageOf(err) });
      return false;
    }
  },

  setRequired: async (departmentId, postId, isRequired) => {
    set({ isLoading: true, error: null });
    const token = await getGoogleToken();
    if (!token) {
      set({ isLoading: false, error: '구글 로그인이 필요합니다.' });
      return;
    }
    try {
      const { staffRoomPort } = await import('@adapters/di/container');
      await staffRoomPort.setPostRequired(token, departmentId, postId, isRequired);
      set((state) => ({
        posts: state.posts.map((p) => (p.id === postId ? { ...p, isRequired } : p)),
        currentPost:
          state.currentPost && state.currentPost.id === postId
            ? { ...state.currentPost, isRequired }
            : state.currentPost,
        isLoading: false,
      }));
      // 필독으로 바뀌면 읽음 현황이 생기고, 풀면 사라진다
      if (get().currentPost?.id === postId) {
        await get().openPost(departmentId, postId);
      }
    } catch (err) {
      set({ isLoading: false, error: messageOf(err) });
    }
  },

  removePost: async (departmentId, postId) => {
    set({ isLoading: true, error: null });
    const token = await getGoogleToken();
    if (!token) {
      set({ isLoading: false, error: '구글 로그인이 필요합니다.' });
      return false;
    }
    try {
      const { staffRoomPort } = await import('@adapters/di/container');
      await staffRoomPort.deletePost(token, departmentId, postId);
      set((state) => ({
        posts: state.posts.filter((p) => p.id !== postId),
        currentPost: null,
        comments: [],
        readStatus: null,
        isLoading: false,
      }));
      return true;
    } catch (err) {
      set({ isLoading: false, error: messageOf(err) });
      return false;
    }
  },

  addComment: async (departmentId, postId, body) => {
    if (!body.trim()) return false;
    set({ error: null });
    const token = await getGoogleToken();
    if (!token) {
      set({ error: '구글 로그인이 필요합니다.' });
      return false;
    }
    try {
      const { staffRoomPort } = await import('@adapters/di/container');
      const comment = await staffRoomPort.createComment(token, departmentId, postId, body);
      set((state) => ({
        comments: [...state.comments, comment],
        posts: state.posts.map((p) =>
          p.id === postId ? { ...p, commentCount: p.commentCount + 1 } : p,
        ),
      }));
      return true;
    } catch (err) {
      set({ error: messageOf(err) });
      return false;
    }
  },

  removeComment: async (departmentId, commentId) => {
    set({ error: null });
    const token = await getGoogleToken();
    if (!token) {
      set({ error: '구글 로그인이 필요합니다.' });
      return;
    }
    try {
      const { staffRoomPort } = await import('@adapters/di/container');
      await staffRoomPort.deleteComment(token, departmentId, commentId);
      const postId = get().currentPost?.id;
      set((state) => ({
        comments: state.comments.filter((c) => c.id !== commentId),
        posts: state.posts.map((p) =>
          p.id === postId ? { ...p, commentCount: Math.max(0, p.commentCount - 1) } : p,
        ),
      }));
    } catch (err) {
      set({ error: messageOf(err) });
    }
  },

  loadDraft: async (departmentId, moduleId) => {
    const token = await getGoogleToken();
    if (!token) return;
    try {
      const { staffRoomPort } = await import('@adapters/di/container');
      const draft = await staffRoomPort.getDraft(
        token,
        departmentId,
        moduleId ?? context.moduleId ?? undefined,
      );
      if (draft) {
        set({
          draftTitle: draft.title,
          draftBody: draft.body,
          // 저장돼 있던 형식을 그대로 이어받는다 — 여기서 기본값으로 되돌리면
          // 서식으로 쓰다 만 글이 이어 쓰는 순간 맨글로 바뀐다.
          draftBodyFormat: draft.bodyFormat,
          draftSavedAt: draft.updatedAt,
        });
      } else {
        set({
          draftTitle: '',
          draftBody: '',
          draftBodyFormat: DEFAULT_STAFFROOM_BODY_FORMAT,
          draftSavedAt: null,
        });
      }
    } catch (err) {
      // 쓰던 글을 못 불러와도 새 글은 쓸 수 있어야 한다 — 화면을 막지 않는다
      console.error('[StaffRoomBoard] 쓰던 글 불러오기 실패:', err);
    }
  },

  updateDraft: (departmentId, patch) => {
    set((state) => ({
      draftTitle: patch.title ?? state.draftTitle,
      draftBody: patch.body ?? state.draftBody,
      draftBodyFormat: patch.bodyFormat ?? state.draftBodyFormat,
      draftMentions: patch.mentions ?? state.draftMentions,
    }));

    // 타자 한 글자마다 서버를 부르지 않도록 늦춰서 한 번만 저장한다
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      void (async () => {
        const token = await getGoogleToken();
        if (!token) return;
        try {
          const { staffRoomPort } = await import('@adapters/di/container');
          const saved = await staffRoomPort.saveDraft(token, departmentId, {
            moduleId: context.moduleId ?? undefined,
            title: get().draftTitle,
            body: get().draftBody,
            // 임시저장은 글과 같은 형식으로 보관해야 이어 쓸 때 서식이 풀리지 않는다.
            bodyFormat: get().draftBodyFormat,
          });
          set({ draftSavedAt: saved?.updatedAt ?? null });
        } catch (err) {
          // 자동 저장 실패는 글쓰기를 막지 않는다. 대신 조용히 삼키지 않는다.
          console.error('[StaffRoomBoard] 자동 저장 실패:', err);
        }
      })();
    }, DRAFT_SAVE_DELAY_MS);
  },

  discardDraft: async (departmentId) => {
    if (draftTimer) {
      clearTimeout(draftTimer);
      draftTimer = null;
    }
    set({
      draftTitle: '',
      draftBody: '',
      draftBodyFormat: DEFAULT_STAFFROOM_BODY_FORMAT,
      draftMentions: [],
      draftSavedAt: null,
    });
    const token = await getGoogleToken();
    if (!token) return;
    try {
      const { staffRoomPort } = await import('@adapters/di/container');
      await staffRoomPort.clearDraft(token, departmentId, context.moduleId ?? undefined);
    } catch (err) {
      console.error('[StaffRoomBoard] 쓰던 글 지우기 실패:', err);
    }
  },
}));
