/**
 * 온라인 교무실 — 게시판 엔티티 (M2)
 *
 * 계획서: docs/01-plan/features/online-staffroom.plan.md §6 · §8-A · §9(M2)
 *
 * M2 범위는 **글과 댓글까지**다. 첨부파일은 오너 결정(2026-08-21)으로 M3 자료실과
 * 함께 만든다 — 남이 파일을 열게 해주는 부품(§3.4-나)이 M3 에 있어서, M2 에 넣으면
 * "올릴 수는 있는데 남이 못 여는" 상태가 되기 때문이다.
 *
 * domain 레이어이므로 외부 의존성을 import 하지 않는다.
 */

/**
 * 모듈 종류.
 *
 * M2 에서 실제로 만드는 건 `board` 하나뿐이다. 나머지는 계획서 §6 의 구성이고
 * M3~M4 에서 열린다. 지금 타입에 함께 적어 두는 이유는, 나중에 종류가 늘 때
 * 데이터베이스 제약을 다시 고치지 않기 위해서다.
 */
export type StaffRoomModuleKind = 'board' | 'archive' | 'discussion' | 'gallery' | 'minutes';

/** 부서 안의 모듈 하나 (M2 에서는 부서마다 게시판 1개) */
export interface StaffRoomModule {
  readonly id: string;
  readonly departmentId: string;
  readonly kind: StaffRoomModuleKind;
  /** 관리자가 붙인 이름. 이름 바꾸기는 M4 이므로 M2 에서는 기본값 "게시판" */
  readonly name: string;
  readonly position: number;
  /** 내가 아직 안 읽은 글 수 — 목록 응답에 함께 온다 */
  readonly unreadCount: number;
}

/**
 * 말머리(카테고리). 관리자가 부서마다 미리 정한다. (054)
 *
 * 자유 입력이 아니라 고른 목록인 이유는, 같은 뜻인데 `공지`·`공지사항`·`[공지]`
 * 가 섞이면 걸러 보기가 쓸모없어지기 때문이다.
 */
export interface StaffRoomCategory {
  readonly id: string;
  readonly departmentId: string;
  readonly name: string;
  readonly position: number;
}

/**
 * 글 목록 한 줄.
 *
 * **본문(body)이 없다.** 계획서 §3.5-다 — 목록을 통째로 받으면 교사 1,500명 기준
 * 월 전송량이 8.6GB 로 무료 등급을 넘는다. 제목·작성자·시각만 보내면 2.5KB 다.
 */
export interface StaffRoomPostSummary {
  readonly id: string;
  readonly moduleId: string;
  readonly title: string;
  readonly authorEmail: string;
  /** 작성자가 부서에서 쓰는 이름. 안 정했으면 null 이고 화면은 지메일을 보여준다 */
  readonly authorName: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** 필독 — 목록 맨 위에 붙박이로 뜨고, 이 글에만 사람별 읽음 기록이 쌓인다 */
  readonly isRequired: boolean;
  readonly commentCount: number;
  /** 내가 마지막으로 게시판을 본 시각 이후에 올라왔는가 */
  readonly isUnread: boolean;
  /** 이 글이 나를 불렀는가(@멘션) */
  readonly mentionsMe: boolean;
  /** 말머리. 안 붙였으면 null (054) */
  readonly categoryId: string | null;
  /** 해시태그. 저장값에는 `#` 가 없다 — 보여줄 때만 붙인다 (054) */
  readonly tags: readonly string[];
  /**
   * 붙은 파일 **개수만**. 목록에는 이름까지 싣지 않는다 — 전송량 때문이고
   * (계획서 §3.5-다 와 같은 결), 목록에서는 "첨부 있음" 이상을 보여주지 않는다.
   */
  readonly attachmentCount: number;
}

/**
 * 본문이 어떤 형식으로 쓰였는가. (마이그레이션 053 · ADR-069)
 *
 * - `plain`   — 맨글. 줄바꿈만 살리고 나머지 문자는 글자 그대로 보여준다.
 * - `lexical` — 서식 있는 글. 편집기가 만든 구조를 그대로 담는다.
 *
 * **표시가 없으면 화면이 저장된 글자를 어떻게 읽을지 판단할 수 없다** — 꾸밈이
 * 통째로 날아가거나, 저장된 구조가 글자로 보인다. 그래서 서식 편집기보다 이
 * 칸이 먼저 들어갔다.
 *
 * `markdown` 과 `html` 은 일부러 없다.
 *  - markdown 은 **글자색·글자크기를 적을 방법이 없어서** 뺐다(오너가 원한 화면에
 *    그 둘이 있다). 화면이 그릴 줄 모르는 형식을 허용값에 남기지 않는다.
 *  - html 은 교무실이 **남이 쓴 글을 내 화면에 펼치는 첫 기능**이라 뺐다. 앱에
 *    소독 도구가 없다. lexical 형식은 화면이 아는 종류의 조각만 골라 그리는
 *    구조라 소독 없이도 안전하다.
 */
export type StaffRoomBodyFormat = 'plain' | 'lexical';

export const DEFAULT_STAFFROOM_BODY_FORMAT: StaffRoomBodyFormat = 'plain';

/**
 * 글에 붙인 자료실 파일 (055).
 *
 * 파일 자체는 자료실에 있고 여기는 가리키기만 한다. `fileId` 가 null 이면
 * **자료실에서 지워진 것**이다 — 첨부 줄은 남겨서 "지워진 파일"로 알린다.
 * 조용히 사라지면 글이 고쳐진 줄 안다.
 */
export interface StaffRoomPostAttachment {
  readonly id: string;
  readonly fileId: string | null;
  readonly fileName: string;
}

/** 글 하나에 붙일 수 있는 파일 수 */
export const STAFFROOM_POST_MAX_ATTACHMENTS = 10;

/** 글 하나 (본문 포함) */
export interface StaffRoomPost extends StaffRoomPostSummary {
  readonly body: string;
  readonly bodyFormat: StaffRoomBodyFormat;
  /** 본문에서 불린 사람들의 지메일 */
  readonly mentionedEmails: readonly string[];
  /** 붙은 파일 — 글을 열 때만 이름까지 온다 */
  readonly attachments: readonly StaffRoomPostAttachment[];
}

/** 댓글 */
export interface StaffRoomComment {
  readonly id: string;
  readonly postId: string;
  readonly authorEmail: string;
  readonly authorName: string | null;
  readonly body: string;
  readonly bodyFormat: StaffRoomBodyFormat;
  readonly createdAt: string;
}

/** 필독 글의 읽음 현황 — 누가 봤고 누가 안 봤는지 */
export interface StaffRoomReadStatus {
  readonly read: readonly {
    readonly email: string;
    readonly name: string | null;
    readonly readAt: string;
  }[];
  readonly unread: readonly { readonly email: string; readonly name: string | null }[];
}

/** 임시저장 — 사람마다 게시판마다 한 벌 */
export interface StaffRoomDraft {
  readonly moduleId: string;
  readonly title: string;
  readonly body: string;
  /** 글과 함께 왕복해야 이어 쓸 때 서식이 풀리지 않는다 */
  readonly bodyFormat: StaffRoomBodyFormat;
  readonly updatedAt: string;
}

/** 글 쓰기 입력 */
export interface WriteStaffRoomPostInput {
  readonly moduleId: string;
  readonly title: string;
  readonly body: string;
  readonly bodyFormat: StaffRoomBodyFormat;
  readonly isRequired: boolean;
  readonly mentionedEmails: readonly string[];
  /** 말머리. 안 고르면 null */
  readonly categoryId: string | null;
  /** 해시태그. `#` 를 뗀 값으로 넘긴다 */
  readonly tags: readonly string[];
  /** 붙일 자료실 파일 id. 이 부서 것인지는 서버가 확인한다 */
  readonly fileIds: readonly string[];
}

/** 제목 최대 길이 */
export const STAFFROOM_POST_TITLE_MAX_LENGTH = 100;

/**
 * 본문 권고 상한.
 *
 * 계획서 §2 는 "길이로 막지 않는다"이므로 이건 **거부 기준이 아니라 안내 기준**이다.
 * 넘으면 화면이 "너무 길어요"라고 알려 주되 저장은 막지 않는다.
 */
export const STAFFROOM_POST_BODY_ADVISORY_LENGTH = 200_000;

/** 댓글 최대 길이 */
export const STAFFROOM_COMMENT_MAX_LENGTH = 2_000;

/** 부서에서 쓰는 표시 이름 최대 길이 */
export const STAFFROOM_DISPLAY_NAME_MAX_LENGTH = 20;
