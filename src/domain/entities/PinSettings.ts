export type ProtectedFeatureKey =
  | 'timetable'
  | 'seating'
  | 'schedule'
  | 'studentRecords'
  | 'meal'
  | 'memo'
  | 'note'
  | 'todo'
  | 'classManagement'
  | 'bookmarks';

export interface ProtectedFeatures {
  readonly timetable: boolean;
  readonly seating: boolean;
  readonly schedule: boolean;
  readonly studentRecords: boolean;
  readonly meal: boolean;
  readonly memo: boolean;
  readonly note: boolean;
  readonly todo: boolean;
  readonly classManagement: boolean;
  readonly bookmarks: boolean;
}

export interface PinSettings {
  readonly enabled: boolean;
  readonly pinHash: string | null;
  readonly protectedFeatures: ProtectedFeatures;
  readonly autoLockMinutes: number; // 0이면 매번 PIN 입력
}
