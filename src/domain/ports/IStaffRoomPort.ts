/**
 * 온라인 교무실 서버 포트 (M1)
 *
 * 계획서: docs/01-plan/features/online-staffroom.plan.md §9(M1)
 *
 * 모든 조작에 **구글 access token 이 함께 간다.** 서버가 그 토큰을 구글에 되물어
 * 이메일을 확인하고, 그 이메일이 부서 멤버인지 본 뒤에만 응답한다(§7).
 * 앱이 "나는 아무개입니다"라고 문자열로 주장하는 경로는 만들지 않는다.
 *
 * M2 에서 게시판, M3 에서 자료실이 더해졌다. 토론방·갤러리는 M4 이므로 아직 없다.
 */
import type {
  StaffRoomMySubmission,
  StaffRoomSubmission,
  StaffRoomSubmissionSaveResult,
  StaffRoomSubmissionTargets,
  WriteStaffRoomSubmissionInput,
} from '@domain/entities/StaffRoomSubmission';
import type {
  CreateStaffRoomDepartmentInput,
  CreateStaffRoomInviteInput,
  StaffRoomDepartment,
  StaffRoomInvite,
  StaffRoomMember,
  StaffRoomRole,
} from '@domain/entities/StaffRoom';
import type {
  StaffRoomBodyFormat,
  StaffRoomCategory,
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
  StaffRoomEvent,
  StaffRoomTask,
  StaffRoomTaskForm,
  StaffRoomVote,
  WriteStaffRoomEventInput,
  WriteStaffRoomMinutesInput,
  WriteStaffRoomTaskInput,
} from '@domain/entities/StaffRoomRooms';
import type {
  StaffRoomFile,
  StaffRoomFileVersion,
  StaffRoomSearchHit,
  StaffRoomStorageUsage,
  StaffRoomUploadTicket,
  UploadStaffRoomFileInput,
} from '@domain/entities/StaffRoomLibrary';

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
    input: {
      title: string;
      body: string;
      bodyFormat: StaffRoomBodyFormat;
      mentionedEmails: readonly string[];
      categoryId: string | null;
      tags: readonly string[];
      fileIds: readonly string[];
    },
  ): Promise<StaffRoomPost>;

  // ── 말머리 (054) ─────────────────────────────────────────────────
  //    목록은 멤버 누구나(글 쓸 때 골라야 한다), 나머지는 관리자만.

  /** 부서의 말머리 목록 */
  listCategories(googleAccessToken: string, departmentId: string): Promise<StaffRoomCategory[]>;

  /** 말머리 만들기 (관리자) */
  createCategory(
    googleAccessToken: string,
    departmentId: string,
    name: string,
  ): Promise<StaffRoomCategory>;

  /** 말머리 이름 고치기 (관리자) */
  renameCategory(
    googleAccessToken: string,
    departmentId: string,
    categoryId: string,
    name: string,
  ): Promise<StaffRoomCategory>;

  /** 말머리 지우기 (관리자). **글은 지워지지 않는다** — 말머리만 떨어진다 */
  removeCategory(
    googleAccessToken: string,
    departmentId: string,
    categoryId: string,
  ): Promise<void>;

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

  /** 쓰던 글 자동 저장 (제목·본문이 모두 비면 지운다). 말머리·태그·첨부도 함께 보관한다 */
  saveDraft(
    googleAccessToken: string,
    departmentId: string,
    input: {
      moduleId?: string;
      title: string;
      body: string;
      bodyFormat: StaffRoomBodyFormat;
      categoryId: string | null;
      tags: readonly string[];
      fileIds: readonly string[];
    },
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

  // ════════════════════════════════════════════════════════════════
  // 자료실 (M3)
  //
  // ★ 파일 바이트는 이 포트를 지나지 않는다(계획서 §3.4 · ADR-065).
  //   올릴 때는 `createUploadSession` 이 받아 온 주소로 앱이 구글에 곧장 올리고,
  //   내려받을 때는 `getDownloadUrl` 이 준 구글 링크를 그대로 연다.
  //   여기 오가는 것은 표찰(이름·크기·올린 사람)과 검색용 글자뿐이다.
  // ════════════════════════════════════════════════════════════════

  /**
   * 자료실 목록 + 부서가 쓰는 용량.
   *
   * `moduleId` 를 주면 **그 공간의 자료만** 온다(M4 — 자료실·갤러리가 여러 개일 수 있다).
   * 안 주면 부서의 기본 자료실로 떨어진다.
   */
  listFiles(
    googleAccessToken: string,
    departmentId: string,
    moduleId?: string,
  ): Promise<{
    module: StaffRoomModule;
    files: StaffRoomFile[];
    usage: StaffRoomStorageUsage;
    /** 관리자가 구글을 연결해 뒀는가. 아니면 올리기·내려받기가 안 된다(§3.2.1) */
    driveConnected: boolean;
    /**
     * 왜 안 되는가 — 조치가 다르므로 구분한다.
     * `missing` 아직 연결 안 함(처음 연결해야 한다) · `broken` 끊어짐(다시 로그인해야 한다)
     */
    driveStatus: 'connected' | 'missing' | 'broken';
  }>;

  /** 올리기 세션 주소를 받는다 — 파일은 이 주소로 구글에 곧장 간다 */
  createUploadSession(
    googleAccessToken: string,
    departmentId: string,
    input: UploadStaffRoomFileInput,
  ): Promise<StaffRoomUploadTicket>;

  /** 다 올린 뒤 등록 — 서버가 드라이브에 되물어 표와 대조한다 */
  commitUpload(
    googleAccessToken: string,
    departmentId: string,
    ticketId: string,
    driveFileId: string,
  ): Promise<StaffRoomFile>;

  /** 미리보기 글자를 올릴 주소를 받는다 (§3.4-가 — 글자도 드라이브로 간다) */
  createPreviewSession(
    googleAccessToken: string,
    departmentId: string,
    fileId: string,
    size: number,
  ): Promise<StaffRoomUploadTicket>;

  /** 미리보기 글자 등록 */
  commitPreview(
    googleAccessToken: string,
    departmentId: string,
    ticketId: string,
    driveFileId: string,
    fileId: string,
  ): Promise<void>;

  /**
   * 내려받기 — 서버가 내 지메일에 읽기 권한을 주고 구글 링크를 돌려준다(§3.4-나).
   * 파일은 구글에서 곧장 오므로 쌤핀 서버를 지나지 않는다.
   */
  getDownloadUrl(
    googleAccessToken: string,
    departmentId: string,
    fileId: string,
  ): Promise<{ url: string; name: string }>;

  /** 자료 지우기 — 올린 사람 본인 또는 관리자 */
  deleteFile(googleAccessToken: string, departmentId: string, fileId: string): Promise<void>;

  /** 접어 둔 이전 판 (§8-C) */
  listFileVersions(
    googleAccessToken: string,
    departmentId: string,
    fileId: string,
  ): Promise<StaffRoomFileVersion[]>;

  /**
   * 검색에 쓸 글자를 받아 온다 (§3.4-가).
   *
   * `drive.file` 권한 탓에 앱이 관리자 드라이브의 글자 파일을 직접 못 읽어서
   * 서버가 대신 읽어 준다. 한 번에 30개까지, 받은 것은 앱이 갈무리해 둔다.
   */
  fetchPreviews(
    googleAccessToken: string,
    departmentId: string,
    fileIds: readonly string[],
  ): Promise<Array<{ fileId: string; text: string }>>;

  /**
   * 글에서 찾기 (§8-A 부서 전체 검색).
   *
   * 자료는 앱이 받아 둔 글자로 직접 찾지만, **글 본문은 앱에 없다**(§3.5-다 —
   * 목록에 본문을 싣지 않는다). 그래서 글만 서버가 찾고 걸린 것만 돌려준다.
   */
  searchPosts(
    googleAccessToken: string,
    departmentId: string,
    query: string,
  ): Promise<StaffRoomSearchHit[]>;

  // ════════════════════════════════════════════════════════════════
  // 공간(모듈) · 배너 · 토론방 · 회의록 (M4)
  // ════════════════════════════════════════════════════════════════

  /** 부서의 공간 목록 + 배너 (§6) */
  listModules(
    googleAccessToken: string,
    departmentId: string,
  ): Promise<{ modules: StaffRoomModule[]; banner: StaffRoomBanner }>;

  /** 공간 만들기 (관리자만) */
  addModule(
    googleAccessToken: string,
    departmentId: string,
    kind: StaffRoomModuleKind,
    name: string,
  ): Promise<StaffRoomModule>;

  /** 공간 이름 바꾸기 (관리자만) */
  renameModule(
    googleAccessToken: string,
    departmentId: string,
    moduleId: string,
    name: string,
  ): Promise<void>;

  /** 탭 순서 한 칸 옮기기 (관리자만) */
  moveModule(
    googleAccessToken: string,
    departmentId: string,
    moduleId: string,
    direction: 'up' | 'down',
  ): Promise<void>;

  /** 공간 지우기 (관리자만). 마지막 게시판·자료실은 서버가 막는다 */
  deleteModule(googleAccessToken: string, departmentId: string, moduleId: string): Promise<void>;

  /** 배너 정하기 (관리자만) */
  setBanner(
    googleAccessToken: string,
    departmentId: string,
    banner: StaffRoomBanner,
  ): Promise<void>;

  /** 안건 목록 + 집계 */
  listDiscussions(
    googleAccessToken: string,
    departmentId: string,
    moduleId: string,
  ): Promise<{ discussions: StaffRoomDiscussion[]; memberCount: number }>;

  /** 안건 하나 + 낸 뜻 전부 */
  getDiscussion(
    googleAccessToken: string,
    departmentId: string,
    discussionId: string,
  ): Promise<{
    discussion: StaffRoomDiscussion;
    votes: StaffRoomVote[];
    memberCount: number;
  }>;

  /** 안건 내기 (멤버 누구나) */
  addDiscussion(
    googleAccessToken: string,
    departmentId: string,
    moduleId: string,
    input: { title: string; body: string },
  ): Promise<StaffRoomDiscussion>;

  /** 뜻 내기 — 사람마다 안건당 한 줄이라 다시 내면 고쳐진다 */
  voteOnDiscussion(
    googleAccessToken: string,
    departmentId: string,
    discussionId: string,
    stance: StaffRoomStance,
    comment: string,
  ): Promise<StaffRoomTally>;

  /** 마감 / 마감 풀기 (낸 사람 또는 관리자) */
  setDiscussionClosed(
    googleAccessToken: string,
    departmentId: string,
    discussionId: string,
    closed: boolean,
  ): Promise<void>;

  /** 안건 지우기 (낸 사람 또는 관리자) */
  deleteDiscussion(
    googleAccessToken: string,
    departmentId: string,
    discussionId: string,
  ): Promise<void>;

  /** 회의록 목록 (§8-C) */
  listMinutes(
    googleAccessToken: string,
    departmentId: string,
    moduleId: string,
  ): Promise<StaffRoomMinutes[]>;

  /** 회의록 쓰기 */
  addMinutes(
    googleAccessToken: string,
    departmentId: string,
    moduleId: string,
    input: WriteStaffRoomMinutesInput,
  ): Promise<StaffRoomMinutes>;

  /** 회의록 고치기 (쓴 사람 또는 관리자) */
  updateMinutes(
    googleAccessToken: string,
    departmentId: string,
    minutesId: string,
    input: WriteStaffRoomMinutesInput,
  ): Promise<StaffRoomMinutes>;

  /** 회의록 지우기 (쓴 사람 또는 관리자) */
  deleteMinutes(googleAccessToken: string, departmentId: string, minutesId: string): Promise<void>;

  // ════════════════════════════════════════════════════════════════
  // 제출 과제 (066)
  //
  // ★ 만들기는 **멤버 누구나** 한다. 취합은 부장만 하는 일이 아니다.
  // ★ 목록(`listSubmissions`)은 언제나 익명이다 — 진행률 숫자와 내 상태만 온다.
  //   명단은 `listSubmissionTargets` 로만 오고, 그건 만든이·관리자만 부를 수 있다.
  // ════════════════════════════════════════════════════════════════

  /**
   * 업무에 걸어 둔 서식 목록.
   *
   * 자료실 파일을 가리키기만 한다. 내려받기는 자료실의 기존 경로를 그대로 쓴다 —
   * 권한을 내주는 길을 두 벌로 만들지 않는다.
   */
  /**
   * 붙여넣기로 읽어낸 일정 여러 건을 한 번에 올린다.
   *
   * 파싱은 앱이 하고(domain/rules/staffRoomSchedulePaste.ts), 사람이 미리보기로
   * 확인한 뒤 다듬어진 줄만 여기로 온다. 서버가 다시 검사하므로 앱을 안 거치는
   * 경로로 이상한 것이 들어와도 막힌다.
   */
  addEvents(
    googleAccessToken: string,
    departmentId: string,
    events: readonly { startsOn: string; title: string; place: string; memo: string }[],
  ): Promise<{ events: StaffRoomEvent[]; rejected: number }>;

  listTaskForms(
    googleAccessToken: string,
    departmentId: string,
    taskId: string,
  ): Promise<StaffRoomTaskForm[]>;

  /** 업무 서식을 통째로 바꾼다 (업무를 고칠 수 있는 사람만) */
  setTaskForms(
    googleAccessToken: string,
    departmentId: string,
    taskId: string,
    fileIds: readonly string[],
  ): Promise<{ forms: StaffRoomTaskForm[]; droppedFiles: number }>;

  /** 제출 과제 목록 (익명 — 주체 명단은 안 온다) */
  listSubmissions(
    googleAccessToken: string,
    departmentId: string,
    moduleId: string,
  ): Promise<StaffRoomSubmission[]>;

  /** 제출 과제 만들기 (멤버 누구나) */
  addSubmission(
    googleAccessToken: string,
    departmentId: string,
    moduleId: string,
    input: WriteStaffRoomSubmissionInput,
  ): Promise<StaffRoomSubmissionSaveResult>;

  /** 제출 과제 고치기 (만든이·관리자) */
  updateSubmission(
    googleAccessToken: string,
    departmentId: string,
    submissionId: string,
    input: WriteStaffRoomSubmissionInput,
  ): Promise<StaffRoomSubmissionSaveResult>;

  /** 제출 과제 지우기 (만든이·관리자) */
  deleteSubmission(
    googleAccessToken: string,
    departmentId: string,
    submissionId: string,
  ): Promise<void>;

  /**
   * "냈음" 표시 (본인·만든이·관리자).
   *
   * `targetEmail` 이 없으면 내 칸이다. 남의 칸을 켜고 끄는 것은 취합자와
   * 관리자만 — 종이나 메신저로 받은 것을 대신 표시할 수 있어야 한다.
   */
  toggleSubmissionDone(
    googleAccessToken: string,
    departmentId: string,
    submissionId: string,
    done: boolean,
    targetEmail?: string,
  ): Promise<StaffRoomSubmission>;

  /**
   * 제출 주체 명단 — 낸 사람 + 안 낸 사람 + 부서를 나간 사람 (만든이·관리자만).
   *
   * ★ 목록에 안 담고 여기로만 내보내는 이유: "권한 없으면 이름을 지운다"를
   *   여기저기 적으면 한 줄만 빠뜨려도 샌다. 통로를 하나로 좁혀 그 자리에서만
   *   판정한다(계획서 D2).
   */
  listSubmissionTargets(
    googleAccessToken: string,
    departmentId: string,
    submissionId: string,
  ): Promise<StaffRoomSubmissionTargets>;

  // ════════════════════════════════════════════════════════════════
  // 부서 일정 · 업무 분담 (M4 · §8-B)
  //
  // ★ 부서 일정을 개인 일정으로 **복사하지 않는다.** 부서가 주인이라 나가면 안 보여야 하고,
  //   복사하면 부서에서 고쳐도 내 것은 안 바뀐다. 읽어서 겹쳐 보여줄 뿐이다.
  // ════════════════════════════════════════════════════════════════

  /** 이 부서의 일정·업무 */
  listPlan(
    googleAccessToken: string,
    departmentId: string,
  ): Promise<{ events: StaffRoomEvent[]; tasks: StaffRoomTask[] }>;

  /**
   * 내가 멤버인 여러 부서의 일정·업무를 한 번에.
   * 내 달력·내 할 일 위에 겹쳐 보여줄 때 쓴다 — 부서마다 따로 부르면 왕복이 부서 수만큼 는다.
   */
  listMyPlan(
    googleAccessToken: string,
    departmentIds: readonly string[],
  ): Promise<{
    events: StaffRoomEvent[];
    tasks: StaffRoomTask[];
    /**
     * 내가 주체인 제출 과제 — **미완료 전부 + 최근 14일 완료분**.
     *
     * 완료분을 함께 싣는 이유: 개인 화면에서 체크한 직후 줄이 사라지면
     * 잘못 누른 것을 되돌릴 수 없다. 그렇다고 전부 실으면 제출 과제는
     * 학년도 전환 대상이 아니라 해마다 쌓여 화면을 덮는다.
     */
    submissions: StaffRoomMySubmission[];
    /** 상한에 닿아 잘렸는가 */
    submissionsTruncated: boolean;
  }>;

  addEvent(
    googleAccessToken: string,
    departmentId: string,
    input: WriteStaffRoomEventInput,
  ): Promise<StaffRoomEvent>;

  updateEvent(
    googleAccessToken: string,
    departmentId: string,
    eventId: string,
    input: WriteStaffRoomEventInput,
  ): Promise<StaffRoomEvent>;

  deleteEvent(googleAccessToken: string, departmentId: string, eventId: string): Promise<void>;

  addTask(
    googleAccessToken: string,
    departmentId: string,
    input: WriteStaffRoomTaskInput,
  ): Promise<StaffRoomTask>;

  updateTask(
    googleAccessToken: string,
    departmentId: string,
    taskId: string,
    input: WriteStaffRoomTaskInput,
  ): Promise<StaffRoomTask>;

  /** 끝냄 표시 — 맡은 본인 또는 관리자만 (§8-B) */
  toggleTaskDone(
    googleAccessToken: string,
    departmentId: string,
    taskId: string,
    done: boolean,
  ): Promise<StaffRoomTask>;

  deleteTask(googleAccessToken: string, departmentId: string, taskId: string): Promise<void>;
}
