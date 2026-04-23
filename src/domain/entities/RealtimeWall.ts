export type RealtimeWallLayoutMode = 'kanban' | 'freeform' | 'grid' | 'stream';

export type RealtimeWallPostStatus = 'pending' | 'approved' | 'hidden';

/**
 * OG 메타 공통 필드. Main 프로세스 fetch IPC 응답과 webpage variant가 공유.
 * 이미지는 원격 URL만 보관 — 쌤핀 용량 정책.
 */
export interface RealtimeWallLinkPreviewOgMeta {
  readonly ogTitle?: string;
  readonly ogDescription?: string;
  readonly ogImageUrl?: string;
}

/**
 * 학생이 제출한 linkUrl을 서버가 분류·해석한 결과.
 */
export type RealtimeWallLinkPreview =
  | {
      readonly kind: 'youtube';
      readonly videoId: string;
    }
  | ({
      readonly kind: 'webpage';
    } & RealtimeWallLinkPreviewOgMeta);

export interface RealtimeWallColumn {
  readonly id: string;
  readonly title: string;
  readonly order: number;
}

export interface RealtimeWallKanbanPosition {
  readonly columnId: string;
  readonly order: number;
}

export interface RealtimeWallFreeformPosition {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly zIndex: number;
}

export interface RealtimeWallPost {
  readonly id: string;
  readonly nickname: string;
  readonly text: string;
  readonly linkUrl?: string;
  /** Main 프로세스의 OG fetch 완료 후 upsert. 실패 시 undefined 유지. */
  readonly linkPreview?: RealtimeWallLinkPreview;
  readonly status: RealtimeWallPostStatus;
  readonly pinned: boolean;
  /** 교사 로컬 하트 카운터. 학생에게 노출 금지(단계 5 fix 정책). */
  readonly teacherHearts?: number;
  readonly submittedAt: number;
  readonly kanban: RealtimeWallKanbanPosition;
  readonly freeform: RealtimeWallFreeformPosition;
}

export interface RealtimeWallBoard {
  readonly title: string;
  readonly layoutMode: RealtimeWallLayoutMode;
  readonly columns: readonly RealtimeWallColumn[];
  readonly posts: readonly RealtimeWallPost[];
}

// ============================================================
// v1.13 — 영속 담벼락 (WallBoard)
// Design §1.1 / §3 참조
// ============================================================

/** 영속 보드 식별자. 저장소 경로에 사용되므로 생성 시 sanitize. */
export type WallBoardId = string & { readonly __brand: 'WallBoardId' };

/**
 * 승인 정책 (v1.13.0은 manual/auto만 구현, filter는 v1.13.2 예정 스텁).
 *
 * - `manual`: 학생 제출 → pending 대기열, 교사가 개별 승인.
 * - `auto`  : 학생 제출 → 즉시 approved (빠른 대규모 수합용).
 * - `filter`: 키워드 필터 기반 자동 승인 (준비 중, v1.13.0은 pending 폴백).
 */
export type WallApprovalMode = 'manual' | 'auto' | 'filter';

/**
 * 썸네일 mini-preview용 경량 post snapshot.
 *
 * 목록 화면의 `WallBoardThumbnail` 렌더에 쓰인다. 본 값은 `WallBoardMeta`에
 * 인라인 포함되어 목록 로드 시 추가 fetch 없이 썸네일을 그릴 수 있게 한다.
 * Design §3.5.1a.
 */
export interface WallPreviewPost {
  readonly id: string;
  readonly nickname: string;
  /** 원본 text를 100자로 truncate한 값 (과도한 index 크기 방지) */
  readonly text: string;
  readonly kanban?: RealtimeWallKanbanPosition;
  readonly freeform?: RealtimeWallFreeformPosition;
}

/**
 * 보드 목록 화면용 경량 메타.
 *
 * 전체 `WallBoard` 로드 없이 카드 렌더에 필요한 정보만 담는다.
 * `listAllMeta()` 한 번으로 모든 보드 카드를 빠르게 그릴 수 있도록 설계.
 */
export interface WallBoardMeta {
  readonly id: WallBoardId;
  readonly title: string;
  readonly description?: string;
  readonly layoutMode: RealtimeWallLayoutMode;
  readonly approvalMode: WallApprovalMode;
  readonly postCount: number;
  readonly approvedCount: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  /** 마지막 라이브 세션 종료 시각. 재열기 시 "N일 전 수업" 표시용. */
  readonly lastSessionAt?: number;
  /** 보관 처리된 보드. 삭제 아님, 목록에서 별도 섹션. */
  readonly archived?: boolean;
  /** 학생 접속용 고정 short-code (Design §1.1 Open Question #2 확정). */
  readonly shortCode?: string;
  /** 썸네일용 상위 6개 approved post snapshot. Design §3.5.1a. */
  readonly previewPosts: readonly WallPreviewPost[];
}

/**
 * 영속 담벼락 인스턴스. 교사가 학기 내내 재사용하는 단위.
 *
 * 라이브 세션은 WallBoard 위에 0..N회 실행되며, 각 세션의 학생 제출이
 * posts에 누적된다. `shortCode`는 보드 최초 라이브 세션 시 Supabase 쪽에서
 * 발급해 여기 보관 → 재열기 시 재사용 (교사가 학기 내내 동일 코드로 학생
 * 공지 가능).
 *
 * Design §1.1.
 */
export interface WallBoard {
  readonly id: WallBoardId;
  readonly title: string;
  readonly description?: string;
  readonly layoutMode: RealtimeWallLayoutMode;
  readonly columns: readonly RealtimeWallColumn[];
  readonly approvalMode: WallApprovalMode;
  readonly posts: readonly RealtimeWallPost[];
  readonly createdAt: number;
  readonly updatedAt: number;
  /** 마지막 라이브 세션 종료 시각. 재열기 시 "N일 전 수업"을 표시용. */
  readonly lastSessionAt?: number;
  /** 보관 처리된 보드는 목록에서 별도 섹션. 삭제 아님. */
  readonly archived?: boolean;
  /**
   * 학생 접속용 고정 short-code. 보드 생성 시 `generateWallShortCode`로
   * 발급되어 불변 유지. 다음 라이브 세션 시 재사용.
   *
   * 만료 정책: `archived=true` 또는 명시적 "코드 재발급" 메뉴 선택 시 만료.
   */
  readonly shortCode?: string;
}
