/**
 * 온라인 교무실 — 부서·멤버·초대 엔티티 (M1)
 *
 * 계획서: docs/01-plan/features/online-staffroom.plan.md §2 · §7 · §9(M1)
 *
 * M1 범위는 "부서를 만들고 사람을 모으는 데까지"다.
 * 게시판·자료실·토론방·갤러리(모듈)는 M2 이후이므로 여기에 타입을 두지 않는다.
 *
 * domain 레이어이므로 외부 의존성을 import 하지 않는다.
 */
import type { StaffRoomInviteCode } from '@domain/valueObjects/StaffRoomInviteCode';

/**
 * 부서 안에서의 권한 — 관리자 / 일반 2단계뿐이다(계획서 §2 확정).
 * 세 번째 등급을 만들지 않는다.
 */
export type StaffRoomRole = 'admin' | 'member';

/** 부서 — 부서를 만든 선생님이 관리자가 되고, 자료는 그 사람 드라이브에 쌓인다(§1). */
export interface StaffRoomDepartment {
  readonly id: string;
  /** 부서 이름 (예: "2학년부", "정보부") */
  readonly name: string;
  /** 한 줄 소개 — 없을 수 있다. 배너 꾸미기는 M4 */
  readonly description: string | null;
  /** 부서를 만든(= 자료가 쌓이는 드라이브 주인) 선생님의 지메일 */
  readonly ownerEmail: string;
  readonly createdAt: string;
  /** 내가 이 부서에서 갖는 권한 — 목록 조회 응답에 함께 온다 */
  readonly myRole: StaffRoomRole;
  /** 현재 멤버 수 */
  readonly memberCount: number;
  /** 내가 아직 안 읽은 글 수 (M2). 게시판이 없던 시절 부서는 0 */
  readonly unreadCount: number;
}

/** 부서 멤버 — 신원은 구글 로그인으로 확인한 지메일이 정본이다(§7). */
export interface StaffRoomMember {
  readonly id: string;
  readonly departmentId: string;
  /** 구글 로그인으로 확인된 지메일 — 이게 신원의 정본 */
  readonly email: string;
  /** 구글 프로필 이름. 못 받아오면 null 이고 화면은 지메일을 대신 보여준다 */
  readonly displayName: string | null;
  readonly role: StaffRoomRole;
  readonly joinedAt: string;
}

/** 초대장 — 링크와 코드는 초대장일 뿐 열쇠가 아니다(§7). */
export interface StaffRoomInvite {
  readonly id: string;
  readonly departmentId: string;
  /** 31자 알파벳 6자리 코드 (숫자 6자리가 아니다) */
  readonly code: StaffRoomInviteCode;
  /** 만료 시각. null 이면 만료 없음 */
  readonly expiresAt: string | null;
  /** 관리자가 해지한 시각. null 이면 살아 있음 */
  readonly revokedAt: string | null;
  /** 이 초대로 들어올 수 있는 최대 인원. null 이면 제한 없음 */
  readonly maxUses: number | null;
  /** 지금까지 이 초대로 들어온 인원 */
  readonly useCount: number;
  readonly createdBy: string;
  readonly createdAt: string;
}

/** 부서 만들기 입력 — 이름은 필수, 소개는 선택 */
export interface CreateStaffRoomDepartmentInput {
  readonly name: string;
  readonly description?: string;
}

/** 초대 발급 입력 */
export interface CreateStaffRoomInviteInput {
  readonly departmentId: string;
  /** 만료까지 남은 일수. null 이면 무기한 */
  readonly expiresInDays: number | null;
  /** 최대 사용 인원. null 이면 제한 없음 */
  readonly maxUses?: number | null;
}

/** 초대 만료 선택지 — 화면과 서버가 같은 값을 쓴다 */
export interface StaffRoomInviteExpiryOption {
  readonly label: string;
  readonly days: number | null;
}

/** 초대 만료 선택지 목록 (기본값은 7일) */
export const STAFFROOM_INVITE_EXPIRY_OPTIONS: readonly StaffRoomInviteExpiryOption[] = [
  { label: '7일', days: 7 },
  { label: '30일', days: 30 },
  { label: '무기한', days: null },
];

/** 부서 이름 최대 길이 */
export const STAFFROOM_NAME_MAX_LENGTH = 40;

/** 한 줄 소개 최대 길이 */
export const STAFFROOM_DESCRIPTION_MAX_LENGTH = 100;
