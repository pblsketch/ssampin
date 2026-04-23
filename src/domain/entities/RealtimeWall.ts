export type RealtimeWallLayoutMode = 'kanban' | 'freeform' | 'grid' | 'stream';

export type RealtimeWallPostStatus = 'pending' | 'approved' | 'hidden';

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
