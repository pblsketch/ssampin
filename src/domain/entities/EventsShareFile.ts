import type { SchoolEvent, CategoryItem } from './SchoolEvent';

/** 일정 공유 파일 메타데이터 */
export interface EventsShareMeta {
  readonly version: string;
  readonly type: 'events';
  readonly createdAt: string;
  readonly createdBy: string;
  readonly schoolName: string;
  readonly description: string;
}

/** 일정 공유 파일 (.ssampin) */
export interface EventsShareFile {
  readonly meta: EventsShareMeta;
  readonly categories: readonly CategoryItem[];
  readonly events: readonly SchoolEvent[];
}

/** 중복 감지 결과 */
export interface DuplicateInfo {
  readonly incomingEvent: SchoolEvent;
  readonly existingEvent: SchoolEvent;
  readonly reason: 'same_date_title';
}

/** 카테고리 매핑 */
export interface CategoryMapping {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly sourceColor: string;
  readonly targetId: string | null;
  readonly targetName: string;
  readonly autoMatched: boolean;
}

/** 가져오기 결과 */
export interface ImportResult {
  readonly imported: number;
  readonly skipped: number;
  readonly overwritten: number;
  readonly newCategories: number;
}

/** 내보내기 날짜 범위 타입 */
export type DateRangeType = 'all' | 'semester' | 'month' | 'custom';

/** 내보내기 옵션 */
export interface ExportOptions {
  readonly categoryIds: readonly string[];
  readonly dateRange: DateRangeType;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly description: string;
}

/** 중복 처리 전략 */
export type DuplicateStrategy = 'skip' | 'overwrite';
