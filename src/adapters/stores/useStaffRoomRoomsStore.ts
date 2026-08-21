/**
 * 온라인 교무실 — 공간(모듈)·배너·토론방·회의록 스토어 (M4)
 *
 * 계획서 §6 · §8-C · §8-E
 *
 * ★ §8-E — 여기 어디에도 **사람별 누적을 세는 자리가 없다.** 들고 있는 집계는
 *   `tally`(안건 하나의 찬반) 하나뿐이다. "누가 몇 번 참여했나"는 만들지 않는다.
 */
import { create } from 'zustand';
import type { StaffRoomModule, StaffRoomModuleKind } from '@domain/entities/StaffRoomBoard';
import type {
  StaffRoomBanner,
  StaffRoomDiscussion,
  StaffRoomMinutes,
  StaffRoomStance,
  StaffRoomVote,
  WriteStaffRoomMinutesInput,
} from '@domain/entities/StaffRoomRooms';

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

const DEFAULT_BANNER: StaffRoomBanner = { kind: 'color', value: 'accent' };

interface StaffRoomRoomsState {
  /** 부서의 공간 목록 — 탭이 이 순서대로 뜬다(§6) */
  modules: StaffRoomModule[];
  banner: StaffRoomBanner;
  hasLoadedModules: boolean;

  discussions: StaffRoomDiscussion[];
  /** 열어 본 안건. null 이면 목록 화면 */
  currentDiscussion: StaffRoomDiscussion | null;
  /** 열어 본 안건에 사람들이 낸 뜻 */
  votes: StaffRoomVote[];
  /** 부서 멤버 수 — "아직 몇 분이 안 내셨습니다"를 말할 때 쓴다 */
  memberCount: number;

  minutes: StaffRoomMinutes[];

  isLoading: boolean;
  error: string | null;

  loadModules: (departmentId: string) => Promise<void>;
  addModule: (departmentId: string, kind: StaffRoomModuleKind, name: string) => Promise<boolean>;
  renameModule: (departmentId: string, moduleId: string, name: string) => Promise<boolean>;
  moveModule: (departmentId: string, moduleId: string, direction: 'up' | 'down') => Promise<void>;
  removeModule: (departmentId: string, moduleId: string) => Promise<boolean>;
  saveBanner: (departmentId: string, banner: StaffRoomBanner) => Promise<boolean>;

  loadDiscussions: (departmentId: string, moduleId: string) => Promise<void>;
  openDiscussion: (departmentId: string, discussionId: string) => Promise<void>;
  closeDiscussionView: () => void;
  addDiscussion: (
    departmentId: string,
    moduleId: string,
    input: { title: string; body: string },
  ) => Promise<boolean>;
  vote: (
    departmentId: string,
    discussionId: string,
    stance: StaffRoomStance,
    comment: string,
  ) => Promise<boolean>;
  setClosed: (departmentId: string, discussionId: string, closed: boolean) => Promise<void>;
  removeDiscussion: (departmentId: string, discussionId: string) => Promise<boolean>;

  loadMinutes: (departmentId: string, moduleId: string) => Promise<void>;
  saveMinutes: (
    departmentId: string,
    moduleId: string,
    input: WriteStaffRoomMinutesInput,
    minutesId?: string,
  ) => Promise<boolean>;
  removeMinutes: (departmentId: string, minutesId: string) => Promise<boolean>;

  clearError: () => void;
  reset: () => void;
}

export const useStaffRoomRoomsStore = create<StaffRoomRoomsState>((set, get) => ({
  modules: [],
  banner: DEFAULT_BANNER,
  hasLoadedModules: false,
  discussions: [],
  currentDiscussion: null,
  votes: [],
  memberCount: 0,
  minutes: [],
  isLoading: false,
  error: null,

  clearError: () => set({ error: null }),

  reset: () =>
    set({
      modules: [],
      banner: DEFAULT_BANNER,
      hasLoadedModules: false,
      discussions: [],
      currentDiscussion: null,
      votes: [],
      memberCount: 0,
      minutes: [],
      error: null,
    }),

  loadModules: async (departmentId) => {
    try {
      const token = await getGoogleToken();
      if (!token) {
        set({ error: '구글 로그인이 필요합니다.', hasLoadedModules: true });
        return;
      }
      const { staffRoomPort } = await import('@adapters/di/container');
      const res = await staffRoomPort.listModules(token, departmentId);
      set({ modules: res.modules, banner: res.banner, hasLoadedModules: true });
    } catch (err) {
      set({ error: messageOf(err), hasLoadedModules: true });
    }
  },

  addModule: async (departmentId, kind, name) => {
    set({ error: null });
    try {
      const token = await getGoogleToken();
      if (!token) return false;
      const { staffRoomPort } = await import('@adapters/di/container');
      await staffRoomPort.addModule(token, departmentId, kind, name);
      await get().loadModules(departmentId);
      return true;
    } catch (err) {
      set({ error: messageOf(err) });
      return false;
    }
  },

  renameModule: async (departmentId, moduleId, name) => {
    set({ error: null });
    try {
      const token = await getGoogleToken();
      if (!token) return false;
      const { staffRoomPort } = await import('@adapters/di/container');
      await staffRoomPort.renameModule(token, departmentId, moduleId, name);
      await get().loadModules(departmentId);
      return true;
    } catch (err) {
      set({ error: messageOf(err) });
      return false;
    }
  },

  moveModule: async (departmentId, moduleId, direction) => {
    try {
      const token = await getGoogleToken();
      if (!token) return;
      const { staffRoomPort } = await import('@adapters/di/container');
      await staffRoomPort.moveModule(token, departmentId, moduleId, direction);
      await get().loadModules(departmentId);
    } catch (err) {
      set({ error: messageOf(err) });
    }
  },

  removeModule: async (departmentId, moduleId) => {
    set({ error: null });
    try {
      const token = await getGoogleToken();
      if (!token) return false;
      const { staffRoomPort } = await import('@adapters/di/container');
      await staffRoomPort.deleteModule(token, departmentId, moduleId);
      await get().loadModules(departmentId);
      return true;
    } catch (err) {
      // 마지막 게시판·자료실을 지우려 한 경우 서버가 한국어로 이유를 준다
      set({ error: messageOf(err) });
      return false;
    }
  },

  saveBanner: async (departmentId, banner) => {
    set({ error: null });
    try {
      const token = await getGoogleToken();
      if (!token) return false;
      const { staffRoomPort } = await import('@adapters/di/container');
      await staffRoomPort.setBanner(token, departmentId, banner);
      set({ banner });
      return true;
    } catch (err) {
      set({ error: messageOf(err) });
      return false;
    }
  },

  loadDiscussions: async (departmentId, moduleId) => {
    set({ isLoading: true, error: null });
    try {
      const token = await getGoogleToken();
      if (!token) {
        set({ isLoading: false, error: '구글 로그인이 필요합니다.' });
        return;
      }
      const { staffRoomPort } = await import('@adapters/di/container');
      const res = await staffRoomPort.listDiscussions(token, departmentId, moduleId);
      set({
        discussions: res.discussions,
        memberCount: res.memberCount,
        isLoading: false,
      });
    } catch (err) {
      set({ isLoading: false, error: messageOf(err) });
    }
  },

  openDiscussion: async (departmentId, discussionId) => {
    set({ isLoading: true, error: null });
    try {
      const token = await getGoogleToken();
      if (!token) {
        set({ isLoading: false });
        return;
      }
      const { staffRoomPort } = await import('@adapters/di/container');
      const res = await staffRoomPort.getDiscussion(token, departmentId, discussionId);
      set({
        currentDiscussion: res.discussion,
        votes: res.votes,
        memberCount: res.memberCount,
        isLoading: false,
      });
    } catch (err) {
      set({ isLoading: false, error: messageOf(err) });
    }
  },

  closeDiscussionView: () => set({ currentDiscussion: null, votes: [] }),

  addDiscussion: async (departmentId, moduleId, input) => {
    set({ error: null });
    try {
      const token = await getGoogleToken();
      if (!token) return false;
      const { staffRoomPort } = await import('@adapters/di/container');
      await staffRoomPort.addDiscussion(token, departmentId, moduleId, input);
      await get().loadDiscussions(departmentId, moduleId);
      return true;
    } catch (err) {
      set({ error: messageOf(err) });
      return false;
    }
  },

  vote: async (departmentId, discussionId, stance, comment) => {
    set({ error: null });
    try {
      const token = await getGoogleToken();
      if (!token) return false;
      const { staffRoomPort } = await import('@adapters/di/container');
      await staffRoomPort.voteOnDiscussion(token, departmentId, discussionId, stance, comment);
      // 집계와 누가 어떻게 냈는지가 함께 바뀌므로 통째로 다시 읽는다
      await get().openDiscussion(departmentId, discussionId);
      return true;
    } catch (err) {
      set({ error: messageOf(err) });
      return false;
    }
  },

  setClosed: async (departmentId, discussionId, closed) => {
    try {
      const token = await getGoogleToken();
      if (!token) return;
      const { staffRoomPort } = await import('@adapters/di/container');
      await staffRoomPort.setDiscussionClosed(token, departmentId, discussionId, closed);
      await get().openDiscussion(departmentId, discussionId);
    } catch (err) {
      set({ error: messageOf(err) });
    }
  },

  removeDiscussion: async (departmentId, discussionId) => {
    set({ error: null });
    try {
      const token = await getGoogleToken();
      if (!token) return false;
      const { staffRoomPort } = await import('@adapters/di/container');
      await staffRoomPort.deleteDiscussion(token, departmentId, discussionId);
      set({
        currentDiscussion: null,
        votes: [],
        discussions: get().discussions.filter((d) => d.id !== discussionId),
      });
      return true;
    } catch (err) {
      set({ error: messageOf(err) });
      return false;
    }
  },

  loadMinutes: async (departmentId, moduleId) => {
    set({ isLoading: true, error: null });
    try {
      const token = await getGoogleToken();
      if (!token) {
        set({ isLoading: false, error: '구글 로그인이 필요합니다.' });
        return;
      }
      const { staffRoomPort } = await import('@adapters/di/container');
      set({
        minutes: await staffRoomPort.listMinutes(token, departmentId, moduleId),
        isLoading: false,
      });
    } catch (err) {
      set({ isLoading: false, error: messageOf(err) });
    }
  },

  saveMinutes: async (departmentId, moduleId, input, minutesId) => {
    set({ error: null });
    try {
      const token = await getGoogleToken();
      if (!token) return false;
      const { staffRoomPort } = await import('@adapters/di/container');
      if (minutesId) {
        await staffRoomPort.updateMinutes(token, departmentId, minutesId, input);
      } else {
        await staffRoomPort.addMinutes(token, departmentId, moduleId, input);
      }
      await get().loadMinutes(departmentId, moduleId);
      return true;
    } catch (err) {
      set({ error: messageOf(err) });
      return false;
    }
  },

  removeMinutes: async (departmentId, minutesId) => {
    set({ error: null });
    try {
      const token = await getGoogleToken();
      if (!token) return false;
      const { staffRoomPort } = await import('@adapters/di/container');
      await staffRoomPort.deleteMinutes(token, departmentId, minutesId);
      set({ minutes: get().minutes.filter((m) => m.id !== minutesId) });
      return true;
    } catch (err) {
      set({ error: messageOf(err) });
      return false;
    }
  },
}));
