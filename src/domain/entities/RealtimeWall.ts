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
  /** 교사 로컬 좋아요 카운터. 학생에게 노출 금지(단계 5 fix 정책). */
  readonly likes?: number;
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
