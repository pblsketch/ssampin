export type RealtimeWallLayoutMode = 'kanban' | 'freeform' | 'grid' | 'stream';

export type RealtimeWallPostStatus = 'pending' | 'approved' | 'hidden';

/**
 * 학생이 제출한 linkUrl을 서버가 분류·해석한 결과.
 * 이미지 파일은 저장하지 않고 원격 URL만 보관 — 쌤핀 용량 정책.
 */
export type RealtimeWallLinkPreview =
  | {
      readonly kind: 'youtube';
      readonly videoId: string;
    }
  | {
      readonly kind: 'webpage';
      readonly ogTitle?: string;
      readonly ogDescription?: string;
      readonly ogImageUrl?: string;
    };

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
