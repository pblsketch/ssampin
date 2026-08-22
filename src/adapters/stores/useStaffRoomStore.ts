/**
 * 온라인 교무실 스토어 (M1)
 *
 * 계획서: docs/01-plan/features/online-staffroom.plan.md §9(M1)
 *
 * 이 탭만 온라인 전용이라(§10.2) "왜 안 되는지"를 항상 남긴다 —
 * 구글 미연결·인터넷 없음·권한 없음을 각각 구분해 한국어로 알린다.
 * 조용히 빈 화면을 띄우는 경로를 만들지 않는다.
 */
import { create } from 'zustand';
import type {
  StaffRoomDepartment,
  StaffRoomInvite,
  StaffRoomMember,
  StaffRoomRole,
} from '@domain/entities/StaffRoom';
import type { StaffRoomModule } from '@domain/entities/StaffRoomBoard';
import { isInviteCode, normalizeInviteCode } from '@domain/valueObjects/StaffRoomInviteCode';
import { isDepartmentAdmin } from '@domain/rules/staffRoomPermission';
import { StaffRoomHttpError } from '@domain/errors/StaffRoomError';

/** 구글 계정이 연결되어 있지 않을 때의 안내 */
const NEEDS_GOOGLE_MESSAGE =
  '온라인 교무실은 구글 로그인이 필요합니다. 설정 > 구글 계정에서 연결해주세요.';

interface StaffRoomState {
  /** 내가 멤버인 부서 목록 */
  departments: StaffRoomDepartment[];
  /** 들어가 있는 부서. null 이면 목록 화면 */
  currentDepartment: StaffRoomDepartment | null;
  /** 그 부서의 게시판(M2 는 부서당 1개). M2 이전 부서에는 없을 수 있다 */
  currentBoard: StaffRoomModule | null;
  members: StaffRoomMember[];
  invites: StaffRoomInvite[];

  isLoading: boolean;
  /** 부서 목록을 한 번이라도 불러왔는가 — 빈 상태와 로딩 전을 구분한다 */
  hasLoadedDepartments: boolean;
  error: string | null;
  /** 구글 계정 연결이 필요한 상태인지 — 화면이 연결 버튼을 띄운다 */
  needsGoogleConnect: boolean;

  loadDepartments: () => Promise<void>;
  createDepartment: (name: string, description: string) => Promise<StaffRoomDepartment | null>;
  openDepartment: (departmentId: string) => Promise<void>;
  closeDepartment: () => void;

  /** 내 표시 이름 정하기 — 서버가 본인 행만 고친다 */
  setMyName: (displayName: string) => Promise<boolean>;

  /**
   * 서버에 보관된 관리자 구글 연결을 지금 것으로 다시 잇는다 (관리자만 의미 있음).
   * 자료실·갤러리가 "구글 연결이 끊어졌습니다"로 막혔을 때 쓴다.
   */
  reconnectAdminDrive: () => Promise<boolean>;

  createInvite: (expiresInDays: number | null) => Promise<StaffRoomInvite | null>;
  revokeInvite: (inviteId: string) => Promise<void>;

  joinByCode: (code: string) => Promise<boolean>;

  setMemberRole: (memberId: string, role: StaffRoomRole) => Promise<void>;
  removeMember: (memberId: string) => Promise<void>;

  clearError: () => void;
}

/** 실패 원인을 한국어 한 줄로 — 서버가 준 문구가 있으면 그걸 그대로 쓴다 */
function messageOf(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return '요청 처리 중 오류가 발생했습니다.';
}

/**
 * 구글 access token 을 가져온다.
 * 연결이 안 돼 있으면 null 을 돌려주고, 부르는 쪽이 안내를 띄운다.
 */
async function getGoogleToken(): Promise<string | null> {
  try {
    const { authenticateGoogle } = await import('@adapters/di/container');
    if (!(await authenticateGoogle.isConnected())) return null;
    return await authenticateGoogle.getValidAccessToken();
  } catch {
    return null;
  }
}

/**
 * 서버에 보관된 **부서 관리자의 구글 연결**을 지금 토큰으로 갱신한다.
 *
 * 왜 필요한가 — 자료실·갤러리는 서버가 관리자 토큰으로 대신 읽어 주는 구조라(계획서 §3.2.1),
 * 그 토큰이 끊기면 "새 파일이 안 올라간다"가 아니라 **부서 자료 전체가 모든 멤버에게 안 열린다.**
 *
 * 그런데 이 값은 **부서를 만들 때 딱 한 번만** 저장되고 그 뒤로 갱신하는 길이 없었다.
 * 서버가 리프레시 토큰으로 스스로 늘려 쓰지만, 그 리프레시 토큰이 무효가 되면
 * (관리자가 구글 연결을 끊었다 다시 잇거나 구글에서 권한을 회수한 경우)
 * 앱에서 아무리 다시 로그인해도 **서버는 옛 토큰을 그대로 들고 있었다.**
 * 화면은 "다시 로그인하면 열립니다"라고 안내했지만 실제로는 열리지 않았다
 * (2026-08-22 오너 신고).
 *
 * @returns 갱신했으면 true. 구글 미연결이거나 리프레시 토큰이 없으면 false.
 */
async function pushAdminToken(departmentId: string): Promise<boolean> {
  try {
    const { staffRoomPort, authenticateGoogle } = await import('@adapters/di/container');
    if (!(await authenticateGoogle.isConnected())) return false;

    const accessToken = await authenticateGoogle.getValidAccessToken();
    const refreshToken = await authenticateGoogle.getRefreshToken();
    // 리프레시 토큰이 없으면 서버가 스스로 갱신할 수 없다 — 저장해도 한 시간짜리다
    if (!refreshToken) return false;

    const expiresAtMs = await authenticateGoogle.getExpiresAt();
    await staffRoomPort.saveAdminToken(departmentId, {
      accessToken,
      refreshToken,
      expiresAt: expiresAtMs
        ? new Date(expiresAtMs).toISOString()
        : new Date(Date.now() + 3600 * 1000).toISOString(),
    });
    return true;
  } catch (err) {
    console.error('[StaffRoom] 관리자 구글 연결 갱신 실패:', err);
    return false;
  }
}

export const useStaffRoomStore = create<StaffRoomState>((set, get) => ({
  departments: [],
  currentDepartment: null,
  currentBoard: null,
  members: [],
  invites: [],
  isLoading: false,
  hasLoadedDepartments: false,
  error: null,
  needsGoogleConnect: false,

  clearError: () => set({ error: null }),

  closeDepartment: () =>
    set({ currentDepartment: null, currentBoard: null, members: [], invites: [] }),

  loadDepartments: async () => {
    set({ isLoading: true, error: null, needsGoogleConnect: false });
    const token = await getGoogleToken();
    if (!token) {
      set({ isLoading: false, needsGoogleConnect: true, error: NEEDS_GOOGLE_MESSAGE });
      return;
    }
    try {
      const { staffRoomPort } = await import('@adapters/di/container');
      const departments = await staffRoomPort.listDepartments(token);
      set({ departments, isLoading: false, hasLoadedDepartments: true });
    } catch (err) {
      set({ isLoading: false, error: messageOf(err) });
    }
  },

  createDepartment: async (name, description) => {
    const trimmed = name.trim();
    if (!trimmed) {
      set({ error: '부서 이름을 입력해주세요.' });
      return null;
    }

    set({ isLoading: true, error: null, needsGoogleConnect: false });
    const token = await getGoogleToken();
    if (!token) {
      set({ isLoading: false, needsGoogleConnect: true, error: NEEDS_GOOGLE_MESSAGE });
      return null;
    }

    try {
      const { staffRoomPort } = await import('@adapters/di/container');
      const department = await staffRoomPort.createDepartment(token, {
        name: trimmed,
        description: description.trim(),
      });

      // 자료가 쌓일 드라이브의 주인 자격을 서버가 대신 쓸 수 있게 토큰을 맡긴다(§3.2).
      // 실패해도 부서 자체는 만들어진 것이므로 목록 갱신은 그대로 진행한다 —
      // 자료실이 생기는 M3 에서 관리자 재로그인 안내로 회복한다(§10.1).
      await pushAdminToken(department.id);

      set((state) => ({
        departments: [...state.departments, department],
        isLoading: false,
        hasLoadedDepartments: true,
      }));
      return department;
    } catch (err) {
      set({ isLoading: false, error: messageOf(err) });
      return null;
    }
  },

  openDepartment: async (departmentId) => {
    set({ isLoading: true, error: null, needsGoogleConnect: false });
    const token = await getGoogleToken();
    if (!token) {
      set({ isLoading: false, needsGoogleConnect: true, error: NEEDS_GOOGLE_MESSAGE });
      return;
    }

    try {
      const { staffRoomPort } = await import('@adapters/di/container');
      const [detail, members] = await Promise.all([
        staffRoomPort.getDepartment(token, departmentId),
        staffRoomPort.listMembers(token, departmentId),
      ]);
      const { department, board } = detail;

      // 초대 목록은 관리자만 볼 수 있다 — 일반 멤버로 호출하면 403 이 난다.
      // 실패해도 부서 화면 전체를 막지는 않되, 조용히 삼키지는 않는다(원인 추적용).
      const invites = isDepartmentAdmin(department.myRole)
        ? await staffRoomPort.listInvites(token, departmentId).catch((inviteErr: unknown) => {
            console.error('[StaffRoom] 초대 목록 불러오기 실패:', inviteErr);
            return [];
          })
        : [];

      set({
        currentDepartment: department,
        currentBoard: board,
        members,
        invites,
        isLoading: false,
      });

      // 관리자가 부서에 들어올 때마다 서버의 구글 연결을 지금 것으로 맞춰 둔다.
      // 이게 없으면 관리자가 앱에서 다시 로그인해도 서버는 옛 토큰을 들고 있어
      // 자료실이 계속 안 열린다(2026-08-22 오너 신고). 화면을 막지 않게 뒤에서 돌린다.
      if (isDepartmentAdmin(department.myRole)) {
        void pushAdminToken(departmentId);
      }
    } catch (err) {
      set({ isLoading: false, error: messageOf(err) });
    }
  },

  reconnectAdminDrive: async () => {
    const department = get().currentDepartment;
    if (!department) return false;

    set({ isLoading: true, error: null });
    const ok = await pushAdminToken(department.id);
    if (!ok) {
      // 구글이 아예 안 이어져 있거나 리프레시 토큰이 없다 — 먼저 구글 로그인을 해야 한다
      set({ isLoading: false, needsGoogleConnect: true, error: NEEDS_GOOGLE_MESSAGE });
      return false;
    }
    set({ isLoading: false });
    return true;
  },

  setMyName: async (displayName) => {
    const department = get().currentDepartment;
    if (!department) return false;

    set({ isLoading: true, error: null });
    const token = await getGoogleToken();
    if (!token) {
      set({ isLoading: false, needsGoogleConnect: true, error: NEEDS_GOOGLE_MESSAGE });
      return false;
    }

    try {
      const { staffRoomPort } = await import('@adapters/di/container');
      const updated = await staffRoomPort.setMyName(token, department.id, displayName);
      set((state) => ({
        members: state.members.map((m) => (m.id === updated.id ? updated : m)),
        isLoading: false,
      }));
      return true;
    } catch (err) {
      set({ isLoading: false, error: messageOf(err) });
      return false;
    }
  },

  createInvite: async (expiresInDays) => {
    const department = get().currentDepartment;
    if (!department) return null;

    set({ isLoading: true, error: null });
    const token = await getGoogleToken();
    if (!token) {
      set({ isLoading: false, needsGoogleConnect: true, error: NEEDS_GOOGLE_MESSAGE });
      return null;
    }

    try {
      const { staffRoomPort } = await import('@adapters/di/container');
      const invite = await staffRoomPort.createInvite(token, {
        departmentId: department.id,
        expiresInDays,
      });
      set((state) => ({ invites: [invite, ...state.invites], isLoading: false }));
      return invite;
    } catch (err) {
      set({ isLoading: false, error: messageOf(err) });
      return null;
    }
  },

  revokeInvite: async (inviteId) => {
    const department = get().currentDepartment;
    if (!department) return;

    set({ isLoading: true, error: null });
    const token = await getGoogleToken();
    if (!token) {
      set({ isLoading: false, needsGoogleConnect: true, error: NEEDS_GOOGLE_MESSAGE });
      return;
    }

    try {
      const { staffRoomPort } = await import('@adapters/di/container');
      const updated = await staffRoomPort.revokeInvite(token, department.id, inviteId);
      set((state) => ({
        invites: state.invites.map((i) => (i.id === updated.id ? updated : i)),
        isLoading: false,
      }));
    } catch (err) {
      set({ isLoading: false, error: messageOf(err) });
    }
  },

  joinByCode: async (rawCode) => {
    const code = normalizeInviteCode(rawCode);
    if (!isInviteCode(code)) {
      // 서버를 부르기 전에 화면에서 먼저 걸러 준다 — 헛걸음과 한도 소모를 줄인다
      set({ error: '초대 코드는 영문·숫자 6자리입니다. 코드를 다시 확인해주세요.' });
      return false;
    }

    set({ isLoading: true, error: null, needsGoogleConnect: false });
    const token = await getGoogleToken();
    if (!token) {
      // 코드만으로는 들어갈 수 없다 — 입장은 구글 로그인으로만 이뤄진다(§7)
      set({ isLoading: false, needsGoogleConnect: true, error: NEEDS_GOOGLE_MESSAGE });
      return false;
    }

    try {
      const { staffRoomPort } = await import('@adapters/di/container');
      const result = await staffRoomPort.joinByCode(token, code);
      set({ isLoading: false });
      await get().loadDepartments();
      await get().openDepartment(result.departmentId);
      return true;
    } catch (err) {
      // 이미 그 부서의 멤버라면 막다른 오류로 두지 말고 그 부서로 데려간다 —
      // 코드를 두 번 넣은 선생님이 "왜 안 되지"로 끝나지 않게 한다
      const departmentId = err instanceof StaffRoomHttpError ? err.departmentId : null;
      if (departmentId) {
        set({ isLoading: false, error: null });
        await get().loadDepartments();
        await get().openDepartment(departmentId);
        return true;
      }
      set({ isLoading: false, error: messageOf(err) });
      return false;
    }
  },

  setMemberRole: async (memberId, role) => {
    const department = get().currentDepartment;
    if (!department) return;

    set({ isLoading: true, error: null });
    const token = await getGoogleToken();
    if (!token) {
      set({ isLoading: false, needsGoogleConnect: true, error: NEEDS_GOOGLE_MESSAGE });
      return;
    }

    try {
      const { staffRoomPort } = await import('@adapters/di/container');
      const updated = await staffRoomPort.setMemberRole(token, department.id, memberId, role);
      set((state) => ({
        members: state.members.map((m) => (m.id === updated.id ? updated : m)),
        isLoading: false,
      }));
    } catch (err) {
      set({ isLoading: false, error: messageOf(err) });
    }
  },

  removeMember: async (memberId) => {
    const department = get().currentDepartment;
    if (!department) return;

    set({ isLoading: true, error: null });
    const token = await getGoogleToken();
    if (!token) {
      set({ isLoading: false, needsGoogleConnect: true, error: NEEDS_GOOGLE_MESSAGE });
      return;
    }

    try {
      const { staffRoomPort } = await import('@adapters/di/container');
      await staffRoomPort.removeMember(token, department.id, memberId);
      set((state) => ({
        members: state.members.filter((m) => m.id !== memberId),
        isLoading: false,
      }));
    } catch (err) {
      set({ isLoading: false, error: messageOf(err) });
    }
  },
}));
