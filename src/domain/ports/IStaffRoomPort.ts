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

/** 초대 코드로 참여한 결과 */
export interface JoinStaffRoomResult {
  readonly memberId: string;
  readonly departmentId: string;
  readonly departmentName: string | null;
}

export interface IStaffRoomPort {
  /** 내가 멤버인 부서 목록 */
  listDepartments(googleAccessToken: string): Promise<StaffRoomDepartment[]>;

  /** 부서 하나 (멤버만) */
  getDepartment(googleAccessToken: string, departmentId: string): Promise<StaffRoomDepartment>;

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
}
