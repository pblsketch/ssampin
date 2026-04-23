export type RealtimeBulletinLayoutMode = 'kanban' | 'freeform';

export type RealtimeBulletinPostStatus = 'pending' | 'approved' | 'hidden';

export interface RealtimeBulletinColumn {
  readonly id: string;
  readonly title: string;
  readonly order: number;
}

export interface RealtimeBulletinKanbanPosition {
  readonly columnId: string;
  readonly order: number;
}

export interface RealtimeBulletinFreeformPosition {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly zIndex: number;
}

export interface RealtimeBulletinPost {
  readonly id: string;
  readonly nickname: string;
  readonly text: string;
  readonly linkUrl?: string;
  readonly status: RealtimeBulletinPostStatus;
  readonly pinned: boolean;
  readonly submittedAt: number;
  readonly kanban: RealtimeBulletinKanbanPosition;
  readonly freeform: RealtimeBulletinFreeformPosition;
}

export interface RealtimeBulletinBoard {
  readonly title: string;
  readonly layoutMode: RealtimeBulletinLayoutMode;
  readonly columns: readonly RealtimeBulletinColumn[];
  readonly posts: readonly RealtimeBulletinPost[];
}
