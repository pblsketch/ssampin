/**
 * 온라인 교무실 Supabase Edge Function 클라이언트
 *
 * staffroom_* 테이블은 049 마이그레이션에서 service_role 전용으로 잠겨 있어
 * 앱이 테이블을 직접 읽을 수 없다. 모든 조작은 anon key 로 Edge Function 을 거친다.
 * (SignatureSupabaseClient 와 같은 패턴)
 *
 * 엔드포인트:
 *  - staffroom-departments      {action: create|list|get, googleAccessToken, ...}
 *  - staffroom-invites          {action: create|list|revoke, googleAccessToken, departmentId, ...}
 *  - staffroom-members          {action: list|setRole|remove, googleAccessToken, departmentId, ...}
 *  - staffroom-join             {code, googleAccessToken}
 *  - staffroom-save-admin-token {departmentId, accessToken, refreshToken, expiresAt}
 */
import type {
  CreateStaffRoomDepartmentInput,
  CreateStaffRoomInviteInput,
  StaffRoomDepartment,
  StaffRoomInvite,
  StaffRoomMember,
  StaffRoomRole,
} from '@domain/entities/StaffRoom';
import type {
  StaffRoomComment,
  StaffRoomDraft,
  StaffRoomModule,
  StaffRoomPost,
  StaffRoomPostSummary,
  StaffRoomReadStatus,
  WriteStaffRoomPostInput,
} from '@domain/entities/StaffRoomBoard';
import type { IStaffRoomPort, JoinStaffRoomResult } from '@domain/ports/IStaffRoomPort';
import { StaffRoomHttpError } from '@domain/errors/StaffRoomError';

/** Edge Function 에러 응답 */
interface ErrorResponse {
  error?: string;
  /** 이미 멤버인 경우 서버가 어느 부서인지 함께 알려준다 */
  departmentId?: string;
  departmentName?: string | null;
}

export class StaffRoomSupabaseClient implements IStaffRoomPort {
  private readonly baseUrl: string;
  private readonly anonKey: string;

  constructor() {
    this.baseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
    this.anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';
  }

  /** Edge Function 호출 헬퍼 (anon key 인증) */
  private async invoke<T>(functionName: string, body: unknown): Promise<T> {
    if (!this.baseUrl || !this.anonKey) {
      throw new StaffRoomHttpError(
        '온라인 교무실은 인터넷 연결이 필요합니다. 서버 설정을 확인해주세요.',
        0,
      );
    }

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/functions/v1/${functionName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.anonKey,
          Authorization: `Bearer ${this.anonKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch {
      // 계획서 §10.2 — 인터넷이 없으면 조용히 죽이지 말고 이유를 알린다
      throw new StaffRoomHttpError(
        '인터넷에 연결되어 있지 않아 교무실을 열 수 없습니다. 연결을 확인해주세요.',
        0,
      );
    }

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as ErrorResponse;
      throw new StaffRoomHttpError(
        err.error ?? '요청 처리 중 오류가 발생했습니다.',
        res.status,
        err.departmentId ?? null,
      );
    }

    return res.json() as Promise<T>;
  }

  async listDepartments(googleAccessToken: string): Promise<StaffRoomDepartment[]> {
    const res = await this.invoke<{ departments: StaffRoomDepartment[] }>('staffroom-departments', {
      action: 'list',
      googleAccessToken,
    });
    return res.departments;
  }

  async getDepartment(
    googleAccessToken: string,
    departmentId: string,
  ): Promise<{ department: StaffRoomDepartment; board: StaffRoomModule | null }> {
    const res = await this.invoke<{
      department: StaffRoomDepartment;
      board: StaffRoomModule | null;
    }>('staffroom-departments', {
      action: 'get',
      googleAccessToken,
      departmentId,
    });
    return { department: res.department, board: res.board ?? null };
  }

  async createDepartment(
    googleAccessToken: string,
    input: CreateStaffRoomDepartmentInput,
  ): Promise<StaffRoomDepartment> {
    const res = await this.invoke<{ department: StaffRoomDepartment }>('staffroom-departments', {
      action: 'create',
      googleAccessToken,
      name: input.name,
      description: input.description ?? '',
    });
    return res.department;
  }

  async createInvite(
    googleAccessToken: string,
    input: CreateStaffRoomInviteInput,
  ): Promise<StaffRoomInvite> {
    const res = await this.invoke<{ invite: StaffRoomInvite }>('staffroom-invites', {
      action: 'create',
      googleAccessToken,
      departmentId: input.departmentId,
      expiresInDays: input.expiresInDays,
      maxUses: input.maxUses ?? null,
    });
    return res.invite;
  }

  async listInvites(googleAccessToken: string, departmentId: string): Promise<StaffRoomInvite[]> {
    const res = await this.invoke<{ invites: StaffRoomInvite[] }>('staffroom-invites', {
      action: 'list',
      googleAccessToken,
      departmentId,
    });
    return res.invites;
  }

  async revokeInvite(
    googleAccessToken: string,
    departmentId: string,
    inviteId: string,
  ): Promise<StaffRoomInvite> {
    const res = await this.invoke<{ invite: StaffRoomInvite }>('staffroom-invites', {
      action: 'revoke',
      googleAccessToken,
      departmentId,
      inviteId,
    });
    return res.invite;
  }

  async joinByCode(googleAccessToken: string, code: string): Promise<JoinStaffRoomResult> {
    return this.invoke<JoinStaffRoomResult>('staffroom-join', { code, googleAccessToken });
  }

  async listMembers(googleAccessToken: string, departmentId: string): Promise<StaffRoomMember[]> {
    const res = await this.invoke<{ members: StaffRoomMember[] }>('staffroom-members', {
      action: 'list',
      googleAccessToken,
      departmentId,
    });
    return res.members;
  }

  async setMemberRole(
    googleAccessToken: string,
    departmentId: string,
    memberId: string,
    role: StaffRoomRole,
  ): Promise<StaffRoomMember> {
    const res = await this.invoke<{ member: StaffRoomMember }>('staffroom-members', {
      action: 'setRole',
      googleAccessToken,
      departmentId,
      memberId,
      role,
    });
    return res.member;
  }

  async removeMember(
    googleAccessToken: string,
    departmentId: string,
    memberId: string,
  ): Promise<void> {
    await this.invoke<{ removedMemberId: string }>('staffroom-members', {
      action: 'remove',
      googleAccessToken,
      departmentId,
      memberId,
    });
  }

  async saveAdminToken(
    departmentId: string,
    tokens: { accessToken: string; refreshToken: string; expiresAt: string },
  ): Promise<void> {
    await this.invoke<{ departmentId: string }>('staffroom-save-admin-token', {
      departmentId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    });
  }

  // ══════════════════════════════════════════════════════════════
  // 게시판 (M2)
  // ══════════════════════════════════════════════════════════════

  async listPosts(
    googleAccessToken: string,
    departmentId: string,
    moduleId?: string,
  ): Promise<{ moduleId: string; posts: StaffRoomPostSummary[]; myRole: StaffRoomRole }> {
    return this.invoke('staffroom-posts', {
      action: 'list',
      googleAccessToken,
      departmentId,
      moduleId,
    });
  }

  async getPost(
    googleAccessToken: string,
    departmentId: string,
    postId: string,
  ): Promise<{ post: StaffRoomPost; myRole: StaffRoomRole }> {
    return this.invoke('staffroom-posts', {
      action: 'get',
      googleAccessToken,
      departmentId,
      postId,
    });
  }

  async createPost(
    googleAccessToken: string,
    departmentId: string,
    input: WriteStaffRoomPostInput,
  ): Promise<StaffRoomPost> {
    const res = await this.invoke<{ post: StaffRoomPost }>('staffroom-posts', {
      action: 'create',
      googleAccessToken,
      departmentId,
      moduleId: input.moduleId,
      title: input.title,
      body: input.body,
      isRequired: input.isRequired,
      mentionedEmails: input.mentionedEmails,
    });
    return res.post;
  }

  async updatePost(
    googleAccessToken: string,
    departmentId: string,
    postId: string,
    input: { title: string; body: string; mentionedEmails: readonly string[] },
  ): Promise<StaffRoomPost> {
    const res = await this.invoke<{ post: StaffRoomPost }>('staffroom-posts', {
      action: 'update',
      googleAccessToken,
      departmentId,
      postId,
      title: input.title,
      body: input.body,
      mentionedEmails: input.mentionedEmails,
    });
    return res.post;
  }

  async setPostRequired(
    googleAccessToken: string,
    departmentId: string,
    postId: string,
    isRequired: boolean,
  ): Promise<void> {
    await this.invoke<{ postId: string }>('staffroom-posts', {
      action: 'setRequired',
      googleAccessToken,
      departmentId,
      postId,
      isRequired,
    });
  }

  async deletePost(googleAccessToken: string, departmentId: string, postId: string): Promise<void> {
    await this.invoke<{ deletedPostId: string }>('staffroom-posts', {
      action: 'delete',
      googleAccessToken,
      departmentId,
      postId,
    });
  }

  async getPostReaders(
    googleAccessToken: string,
    departmentId: string,
    postId: string,
  ): Promise<StaffRoomReadStatus & { isRequired: boolean }> {
    return this.invoke('staffroom-posts', {
      action: 'readers',
      googleAccessToken,
      departmentId,
      postId,
    });
  }

  async listComments(
    googleAccessToken: string,
    departmentId: string,
    postId: string,
  ): Promise<StaffRoomComment[]> {
    const res = await this.invoke<{ comments: StaffRoomComment[] }>('staffroom-comments', {
      action: 'list',
      googleAccessToken,
      departmentId,
      postId,
    });
    return res.comments;
  }

  async createComment(
    googleAccessToken: string,
    departmentId: string,
    postId: string,
    body: string,
  ): Promise<StaffRoomComment> {
    const res = await this.invoke<{ comment: StaffRoomComment }>('staffroom-comments', {
      action: 'create',
      googleAccessToken,
      departmentId,
      postId,
      body,
    });
    return res.comment;
  }

  async deleteComment(
    googleAccessToken: string,
    departmentId: string,
    commentId: string,
  ): Promise<void> {
    await this.invoke<{ deletedCommentId: string }>('staffroom-comments', {
      action: 'delete',
      googleAccessToken,
      departmentId,
      commentId,
    });
  }

  async getDraft(
    googleAccessToken: string,
    departmentId: string,
    moduleId?: string,
  ): Promise<StaffRoomDraft | null> {
    const res = await this.invoke<{ draft: StaffRoomDraft | null }>('staffroom-drafts', {
      action: 'get',
      googleAccessToken,
      departmentId,
      moduleId,
    });
    return res.draft;
  }

  async saveDraft(
    googleAccessToken: string,
    departmentId: string,
    input: { moduleId?: string; title: string; body: string },
  ): Promise<StaffRoomDraft | null> {
    const res = await this.invoke<{ draft: StaffRoomDraft | null }>('staffroom-drafts', {
      action: 'save',
      googleAccessToken,
      departmentId,
      moduleId: input.moduleId,
      title: input.title,
      body: input.body,
    });
    return res.draft;
  }

  async clearDraft(
    googleAccessToken: string,
    departmentId: string,
    moduleId?: string,
  ): Promise<void> {
    await this.invoke<{ draft: null }>('staffroom-drafts', {
      action: 'clear',
      googleAccessToken,
      departmentId,
      moduleId,
    });
  }

  async setMyName(
    googleAccessToken: string,
    departmentId: string,
    displayName: string,
  ): Promise<StaffRoomMember> {
    const res = await this.invoke<{ member: StaffRoomMember }>('staffroom-members', {
      action: 'setMyName',
      googleAccessToken,
      departmentId,
      displayName,
    });
    return res.member;
  }
}
