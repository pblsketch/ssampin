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
 *  - staffroom-library          {action: list|uploadSession|commit|download|delete|..., ...}
 *  - staffroom-rooms            {action: modules|addModule|discussions|vote|minutesList|..., ...}
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
  StaffRoomModuleKind,
  StaffRoomPost,
  StaffRoomPostSummary,
  StaffRoomReadStatus,
  WriteStaffRoomPostInput,
} from '@domain/entities/StaffRoomBoard';
import type {
  StaffRoomBanner,
  StaffRoomDiscussion,
  StaffRoomMinutes,
  StaffRoomStance,
  StaffRoomTally,
  StaffRoomVote,
  WriteStaffRoomMinutesInput,
} from '@domain/entities/StaffRoomRooms';
import type {
  StaffRoomFile,
  StaffRoomFileVersion,
  StaffRoomSearchHit,
  StaffRoomStorageUsage,
  StaffRoomUploadTicket,
  UploadStaffRoomFileInput,
} from '@domain/entities/StaffRoomLibrary';
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

  // ════════════════════════════════════════════════════════════════
  // 자료실 (M3)
  //
  // ★ 파일 바이트가 이 클래스를 지나지 않는다(계획서 §3.4 · ADR-065).
  //   업로드는 `uploadToSession` 이 구글 주소로 곧장 보내고, 다운로드는
  //   서버가 준 구글 링크를 화면이 그대로 연다.
  // ════════════════════════════════════════════════════════════════

  async listFiles(
    googleAccessToken: string,
    departmentId: string,
  ): Promise<{
    module: StaffRoomModule;
    files: StaffRoomFile[];
    usage: StaffRoomStorageUsage;
    driveConnected: boolean;
  }> {
    return this.invoke('staffroom-library', {
      action: 'list',
      googleAccessToken,
      departmentId,
    });
  }

  async createUploadSession(
    googleAccessToken: string,
    departmentId: string,
    input: UploadStaffRoomFileInput,
  ): Promise<StaffRoomUploadTicket> {
    return this.invoke('staffroom-library', {
      action: 'uploadSession',
      googleAccessToken,
      departmentId,
      name: input.name,
      mimeType: input.mimeType,
      size: input.size,
      replacesFileId: input.replacesFileId,
    });
  }

  async commitUpload(
    googleAccessToken: string,
    departmentId: string,
    ticketId: string,
    driveFileId: string,
  ): Promise<StaffRoomFile> {
    const res = await this.invoke<{ file: StaffRoomFile }>('staffroom-library', {
      action: 'commit',
      googleAccessToken,
      departmentId,
      ticketId,
      driveFileId,
    });
    return res.file;
  }

  async createPreviewSession(
    googleAccessToken: string,
    departmentId: string,
    fileId: string,
    size: number,
  ): Promise<StaffRoomUploadTicket> {
    return this.invoke('staffroom-library', {
      action: 'previewSession',
      googleAccessToken,
      departmentId,
      fileId,
      size,
    });
  }

  async commitPreview(
    googleAccessToken: string,
    departmentId: string,
    ticketId: string,
    driveFileId: string,
    fileId: string,
  ): Promise<void> {
    await this.invoke('staffroom-library', {
      action: 'commitPreview',
      googleAccessToken,
      departmentId,
      ticketId,
      driveFileId,
      fileId,
    });
  }

  async getDownloadUrl(
    googleAccessToken: string,
    departmentId: string,
    fileId: string,
  ): Promise<{ url: string; name: string }> {
    return this.invoke('staffroom-library', {
      action: 'download',
      googleAccessToken,
      departmentId,
      fileId,
    });
  }

  async deleteFile(googleAccessToken: string, departmentId: string, fileId: string): Promise<void> {
    await this.invoke('staffroom-library', {
      action: 'delete',
      googleAccessToken,
      departmentId,
      fileId,
    });
  }

  async listFileVersions(
    googleAccessToken: string,
    departmentId: string,
    fileId: string,
  ): Promise<StaffRoomFileVersion[]> {
    const res = await this.invoke<{ versions: StaffRoomFileVersion[] }>('staffroom-library', {
      action: 'versions',
      googleAccessToken,
      departmentId,
      fileId,
    });
    return res.versions;
  }

  async fetchPreviews(
    googleAccessToken: string,
    departmentId: string,
    fileIds: readonly string[],
  ): Promise<Array<{ fileId: string; text: string }>> {
    const res = await this.invoke<{ previews: Array<{ fileId: string; text: string }> }>(
      'staffroom-library',
      { action: 'previews', googleAccessToken, departmentId, fileIds },
    );
    return res.previews;
  }

  async searchPosts(
    googleAccessToken: string,
    departmentId: string,
    query: string,
  ): Promise<StaffRoomSearchHit[]> {
    const res = await this.invoke<{
      posts: Array<{
        id: string;
        moduleId: string;
        title: string;
        snippet: string;
        matchedInContent: boolean;
        updatedAt: string;
      }>;
    }>('staffroom-library', { action: 'searchPosts', googleAccessToken, departmentId, query });

    return res.posts.map((p) => ({
      kind: 'post' as const,
      id: p.id,
      moduleId: p.moduleId,
      title: p.title,
      snippet: p.snippet,
      matchedInContent: p.matchedInContent,
      updatedAt: p.updatedAt,
    }));
  }

  // ════════════════════════════════════════════════════════════════
  // 공간(모듈) · 배너 · 토론방 · 회의록 (M4)
  // ════════════════════════════════════════════════════════════════

  async listModules(
    googleAccessToken: string,
    departmentId: string,
  ): Promise<{ modules: StaffRoomModule[]; banner: StaffRoomBanner }> {
    return this.invoke('staffroom-rooms', { action: 'modules', googleAccessToken, departmentId });
  }

  async addModule(
    googleAccessToken: string,
    departmentId: string,
    kind: StaffRoomModuleKind,
    name: string,
  ): Promise<StaffRoomModule> {
    const res = await this.invoke<{ module: StaffRoomModule }>('staffroom-rooms', {
      action: 'addModule',
      googleAccessToken,
      departmentId,
      kind,
      name,
    });
    return res.module;
  }

  async renameModule(
    googleAccessToken: string,
    departmentId: string,
    moduleId: string,
    name: string,
  ): Promise<void> {
    await this.invoke('staffroom-rooms', {
      action: 'renameModule',
      googleAccessToken,
      departmentId,
      moduleId,
      name,
    });
  }

  async moveModule(
    googleAccessToken: string,
    departmentId: string,
    moduleId: string,
    direction: 'up' | 'down',
  ): Promise<void> {
    await this.invoke('staffroom-rooms', {
      action: 'moveModule',
      googleAccessToken,
      departmentId,
      moduleId,
      direction,
    });
  }

  async deleteModule(
    googleAccessToken: string,
    departmentId: string,
    moduleId: string,
  ): Promise<void> {
    await this.invoke('staffroom-rooms', {
      action: 'deleteModule',
      googleAccessToken,
      departmentId,
      moduleId,
    });
  }

  async setBanner(
    googleAccessToken: string,
    departmentId: string,
    banner: StaffRoomBanner,
  ): Promise<void> {
    await this.invoke('staffroom-rooms', {
      action: 'setBanner',
      googleAccessToken,
      departmentId,
      kind: banner.kind,
      value: banner.value,
    });
  }

  async listDiscussions(
    googleAccessToken: string,
    departmentId: string,
    moduleId: string,
  ): Promise<{ discussions: StaffRoomDiscussion[]; memberCount: number }> {
    return this.invoke('staffroom-rooms', {
      action: 'discussions',
      googleAccessToken,
      departmentId,
      moduleId,
    });
  }

  async getDiscussion(
    googleAccessToken: string,
    departmentId: string,
    discussionId: string,
  ): Promise<{ discussion: StaffRoomDiscussion; votes: StaffRoomVote[]; memberCount: number }> {
    return this.invoke('staffroom-rooms', {
      action: 'getDiscussion',
      googleAccessToken,
      departmentId,
      discussionId,
    });
  }

  async addDiscussion(
    googleAccessToken: string,
    departmentId: string,
    moduleId: string,
    input: { title: string; body: string },
  ): Promise<StaffRoomDiscussion> {
    const res = await this.invoke<{ discussion: StaffRoomDiscussion }>('staffroom-rooms', {
      action: 'addDiscussion',
      googleAccessToken,
      departmentId,
      moduleId,
      title: input.title,
      body: input.body,
    });
    return res.discussion;
  }

  async voteOnDiscussion(
    googleAccessToken: string,
    departmentId: string,
    discussionId: string,
    stance: StaffRoomStance,
    comment: string,
  ): Promise<StaffRoomTally> {
    const res = await this.invoke<{ tally: StaffRoomTally }>('staffroom-rooms', {
      action: 'vote',
      googleAccessToken,
      departmentId,
      discussionId,
      stance,
      comment,
    });
    return res.tally;
  }

  async setDiscussionClosed(
    googleAccessToken: string,
    departmentId: string,
    discussionId: string,
    closed: boolean,
  ): Promise<void> {
    await this.invoke('staffroom-rooms', {
      action: 'closeDiscussion',
      googleAccessToken,
      departmentId,
      discussionId,
      closed,
    });
  }

  async deleteDiscussion(
    googleAccessToken: string,
    departmentId: string,
    discussionId: string,
  ): Promise<void> {
    await this.invoke('staffroom-rooms', {
      action: 'deleteDiscussion',
      googleAccessToken,
      departmentId,
      discussionId,
    });
  }

  async listMinutes(
    googleAccessToken: string,
    departmentId: string,
    moduleId: string,
  ): Promise<StaffRoomMinutes[]> {
    const res = await this.invoke<{ minutes: StaffRoomMinutes[] }>('staffroom-rooms', {
      action: 'minutesList',
      googleAccessToken,
      departmentId,
      moduleId,
    });
    return res.minutes;
  }

  async addMinutes(
    googleAccessToken: string,
    departmentId: string,
    moduleId: string,
    input: WriteStaffRoomMinutesInput,
  ): Promise<StaffRoomMinutes> {
    const res = await this.invoke<{ minutes: StaffRoomMinutes }>('staffroom-rooms', {
      action: 'addMinutes',
      googleAccessToken,
      departmentId,
      moduleId,
      ...input,
    });
    return res.minutes;
  }

  async updateMinutes(
    googleAccessToken: string,
    departmentId: string,
    minutesId: string,
    input: WriteStaffRoomMinutesInput,
  ): Promise<StaffRoomMinutes> {
    const res = await this.invoke<{ minutes: StaffRoomMinutes }>('staffroom-rooms', {
      action: 'updateMinutes',
      googleAccessToken,
      departmentId,
      minutesId,
      ...input,
    });
    return res.minutes;
  }

  async deleteMinutes(
    googleAccessToken: string,
    departmentId: string,
    minutesId: string,
  ): Promise<void> {
    await this.invoke('staffroom-rooms', {
      action: 'deleteMinutes',
      googleAccessToken,
      departmentId,
      minutesId,
    });
  }
}
