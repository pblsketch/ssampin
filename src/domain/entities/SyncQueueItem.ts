import type { SchoolEvent } from './SchoolEvent';

/** 동기화 액션 타입 */
export type SyncAction = 'create' | 'update' | 'delete';

/** 오프라인 동기화 큐 아이템 */
export interface SyncQueueItem {
  readonly id: string;
  readonly action: SyncAction;
  readonly event: SchoolEvent;
  readonly googleCalendarId: string;
  readonly queuedAt: string;      // ISO 8601
  readonly retryCount: number;
  readonly lastError?: string;
}
