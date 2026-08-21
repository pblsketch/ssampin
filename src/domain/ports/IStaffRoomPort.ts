/**
 * 온라인 교무실 서버 포트 (M1)
 *
 * 계획서: docs/01-plan/features/online-staffroom.plan.md §9(M1)
 *
 * 모든 조작에 **구글 access token 이 함께 간다.** 서버가 그 토큰을 구글에 되물어
 * 이메일을 확인하고, 그 이메일이 부서 멤버인지 본 뒤에만 응답한다(§7).
 * 앱이 "나는 아무개입니다"라고 문자열로 주장하는 경로는 만들지 않는다.
 *
 * M1 범위 밖(게시판·자료실·토론방·갤러리)은 여기에 선언하지 않는다.
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

/** 초대 코드로 참여한 결과 */
export interface JoinStaffRoomResult {
  readonly memberId: string;
  readonly departmentId: string;
  readonly departmentName: string | null;
}

export interface IStaffRoomPort {
  /** 내가 멤버인 부서 목록 */
  listDepartments(googleAccessToken: string): Promise<StaffRoomDepartment[]>;

  /**
   * 부서 하나 (멤버만).
   *
   * 게시판(module)을 함께 준다 — 글을 읽으려면 게시판 id 가 필요하고,
   * 부서를 열 때마다 한 번 더 왕복하지 않기 위해서다.
   * M2 이전에 만들어진 부서에는 게시판이 없을 수 있어 board 가 null 일 수 있다.
   */
  getDepartment(
    googleAccessToken: string,
    departmentId: string,
  ): Promise<{ department: StaffRoomDepartment; board: StaffRoomModule | null }>;

  /** 부서 만들기 — 만든 사람이 관리자가 된다 */
  createDepartment(
    googleAccessToken: string,
    input: CreateStaffRoomDepartmentInput,
  ): Promise<StaffRoomDepartment>;

  /** 초대 발급 (관리자만) */
  createInvite(
    googleAccessToken: string,
    input: CreateStaffRoomInviteInput,
  ): Promise<StaffRoomInvite>;

  /** 초대 목록 (관리자만) */
  listInvites(googleAccessToken: string, departmentId: string): Promise<StaffRoomInvite[]>;

  /** 초대 해지 (관리자만) */
  revokeInvite(
    googleAccessToken: string,
    departmentId: string,
    inviteId: string,
  ): Promise<StaffRoomInvite>;

  /** 초대 코드로 참여 — 서버가 구글 이메일을 확인한 뒤에만 등록된다 */
  joinByCode(googleAccessToken: string, code: string): Promise<JoinStaffRoomResult>;

  /** 멤버 목록 (멤버 누구나) */
  listMembers(googleAccessToken: string, departmentId: string): Promise<StaffRoomMember[]>;

  /** 권한 변경 (관리자만) */
  setMemberRole(
    googleAccessToken: string,
    departmentId: string,
    memberId: string,
    role: StaffRoomRole,
  ): Promise<StaffRoomMember>;

  /** 내보내기 (관리자만) */
  removeMember(googleAccessToken: string, departmentId: string, memberId: string): Promise<void>;

  /**
   * 부서 관리자의 구글 토큰 보관.
   * 자료가 쌓일 드라이브의 주인 자격을 서버가 대신 쓰기 위한 것이다(§3.2 · §3.2.1).
   */
  saveAdminToken(
    departmentId: string,
    tokens: {
      readonly accessToken: string;
      readonly refreshToken: string;
      readonly expiresAt: string;
    },
  ): Promise<void>;

  // ══════════════════════════════════════════════════════════════
  // 게시판 (M2)
  // ══════════════════════════════════════════════════════════════

  /**
   * 글 목록.
   *
   * 응답에 본문이 없다(계획서 §3.5-다) — 목록에 본문까지 실으면 교사 1,500명 기준
   * 월 전송량이 무료 등급을 넘는다. 본문은 글을 열 때 따로 받는다.
   *
   * 이 호출은 부수 효과가 있다 — 서버가 "이 게시판을 지금 봤다"고 기록하므로
   * 다음부터 그 이전 글은 안 읽음으로 세지 않는다.
   */
  listPosts(
    googleAccessToken: string,
    departmentId: string,
    moduleId?: string,
  ): Promise<{ moduleId: string; posts: StaffRoomPostSummary[]; myRole: StaffRoomRole }>;

  /** 글 하나 (본문 포함). 필독 글이면 "내가 읽었다"가 기록된다 */
  getPost(
    googleAccessToken: string,
    departmentId: string,
    postId: string,
  ): Promise<{ post: StaffRoomPost; myRole: StaffRoomRole }>;

  /** 글 쓰기. 필독 지정은 관리자만 통과한다 */
  createPost(
    googleAccessToken: string,
    departmentId: string,
    input: WriteStaffRoomPostInput,
  ): Promise<StaffRoomPost>;

  /** 글 고치기 (쓴 사람 또는 관리자) */
  updatePost(
    googleAccessToken: string,
    departmentId: string,
    postId: string,
    input: { title: string; body: string; mentionedEmails: readonly string[] },
  ): Promise<StaffRoomPost>;

  /** 필독 지정·해제 (관리자만). 해제하면 사람별 읽음 기록도 지워진다 */
  setPostRequired(
    googleAccessToken: string,
    departmentId: string,
    postId: string,
    isRequired: boolean,
  ): Promise<void>;

  /** 글 지우기 (쓴 사람 또는 관리자) */
  deletePost(googleAccessToken: string, departmentId: string, postId: string): Promise<void>;

  /**
   * 필독 글을 누가 봤는지.
   * 일반 글에는 사람별 기록을 쌓지 않으므로(§3.5-나) 빈 목록이 온다.
   */
  getPostReaders(
    googleAccessToken: string,
    departmentId: string,
    postId: string,
  ): Promise<StaffRoomReadStatus & { isRequired: boolean }>;

  /** 댓글 목록 */
  listComments(
    googleAccessToken: string,
    departmentId: string,
    postId: string,
  ): Promise<StaffRoomComment[]>;

  /** 댓글 쓰기 */
  createComment(
    googleAccessToken: string,
    departmentId: string,
    postId: string,
    body: string,
  ): Promise<StaffRoomComment>;

  /** 댓글 지우기 (쓴 사람 또는 관리자) */
  deleteComment(googleAccessToken: string, departmentId: string, commentId: string): Promise<void>;

  /** 쓰던 글 불러오기 (본인 것만) */
  getDraft(
    googleAccessToken: string,
    departmentId: string,
    moduleId?: string,
  ): Promise<StaffRoomDraft | null>;

  /** 쓰던 글 자동 저장 (제목·본문이 모두 비면 지운다) */
  saveDraft(
    googleAccessToken: string,
    departmentId: string,
    input: { moduleId?: string; title: string; body: string },
  ): Promise<StaffRoomDraft | null>;

  /** 쓰던 글 버리기 */
  clearDraft(googleAccessToken: string, departmentId: string, moduleId?: string): Promise<void>;

  /**
   * 부서에서 쓸 내 이름 정하기.
   *
   * 구글이 이름을 주지 않아서(쌤핀은 이메일 권한만 받는다) 본인이 직접 적는다.
   * 서버가 요청자 본인 행만 고치므로 남의 이름은 관리자도 못 바꾼다.
   */
  setMyName(
    googleAccessToken: string,
    departmentId: string,
    displayName: string,
  ): Promise<StaffRoomMember>;
}
