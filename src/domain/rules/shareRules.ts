import type { SchoolEvent, CategoryItem } from '@domain/entities/SchoolEvent';
import type {
  EventsShareFile,
  DuplicateInfo,
  CategoryMapping,
} from '@domain/entities/EventsShareFile';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 공유 파일 유효성 검사
 * 파싱된 JSON 데이터를 받아 EventsShareFile이면 반환, 아니면 null 반환
 */
export function validateShareFile(data: unknown): EventsShareFile | null {
  if (data === null || typeof data !== 'object') {
    return null;
  }

  const obj = data as Record<string, unknown>;

  // meta 검사
  if (obj['meta'] === null || typeof obj['meta'] !== 'object') {
    return null;
  }
  const meta = obj['meta'] as Record<string, unknown>;
  if (
    meta['type'] !== 'events' ||
    typeof meta['version'] !== 'string' ||
    typeof meta['createdAt'] !== 'string'
  ) {
    return null;
  }

  // categories 검사
  if (!Array.isArray(obj['categories'])) {
    return null;
  }
  for (const item of obj['categories'] as unknown[]) {
    if (item === null || typeof item !== 'object') {
      return null;
    }
    const cat = item as Record<string, unknown>;
    if (
      typeof cat['id'] !== 'string' ||
      typeof cat['name'] !== 'string' ||
      typeof cat['color'] !== 'string'
    ) {
      return null;
    }
  }

  // events 검사
  if (!Array.isArray(obj['events'])) {
    return null;
  }
  for (const item of obj['events'] as unknown[]) {
    if (item === null || typeof item !== 'object') {
      return null;
    }
    const ev = item as Record<string, unknown>;
    if (
      typeof ev['id'] !== 'string' ||
      typeof ev['title'] !== 'string' ||
      typeof ev['date'] !== 'string' ||
      !DATE_PATTERN.test(ev['date']) ||
      typeof ev['category'] !== 'string'
    ) {
      return null;
    }
  }

  return data as EventsShareFile;
}

/**
 * 중복 일정 감지
 * 같은 날짜 + 같은 제목(trim)인 항목을 찾아 DuplicateInfo 배열로 반환
 */
export function detectDuplicates(
  existing: readonly SchoolEvent[],
  incoming: readonly SchoolEvent[],
): readonly DuplicateInfo[] {
  const results: DuplicateInfo[] = [];

  for (const incomingEvent of incoming) {
    const incomingTitle = incomingEvent.title.trim();
    const incomingDate = incomingEvent.date;

    for (const existingEvent of existing) {
      if (
        existingEvent.date === incomingDate &&
        existingEvent.title.trim() === incomingTitle
      ) {
        results.push({
          incomingEvent,
          existingEvent,
          reason: 'same_date_title',
        });
        break;
      }
    }
  }

  return results;
}

/**
 * 카테고리 자동 매핑
 * 파일 카테고리를 내 카테고리와 이름으로 매칭
 */
export function autoMapCategories(
  myCategories: readonly CategoryItem[],
  fileCategories: readonly CategoryItem[],
): readonly CategoryMapping[] {
  return fileCategories.map((fileCat) => {
    const sourceName = fileCat.name.trim();
    const matched = myCategories.find(
      (myCat) => myCat.name.trim() === sourceName,
    );

    if (matched !== undefined) {
      return {
        sourceId: fileCat.id,
        sourceName: fileCat.name,
        sourceColor: fileCat.color,
        targetId: matched.id,
        targetName: matched.name,
        autoMatched: true,
      };
    }

    return {
      sourceId: fileCat.id,
      sourceName: fileCat.name,
      sourceColor: fileCat.color,
      targetId: null,
      targetName: fileCat.name,
      autoMatched: false,
    };
  });
}

/**
 * 날짜 범위로 일정 필터
 * YYYY-MM-DD 문자열 비교 (사전식 순서 == 날짜 순서)
 */
export function filterEventsByDateRange(
  events: readonly SchoolEvent[],
  startDate: string,
  endDate: string,
): readonly SchoolEvent[] {
  return events.filter(
    (event) => event.date >= startDate && event.date <= endDate,
  );
}

/**
 * 카테고리 ID 목록으로 일정 필터
 * categoryIds가 빈 배열이면 전체 반환
 */
export function filterEventsByCategories(
  events: readonly SchoolEvent[],
  categoryIds: readonly string[],
): readonly SchoolEvent[] {
  if (categoryIds.length === 0) {
    return events;
  }
  const idSet = new Set(categoryIds);
  return events.filter((event) => idSet.has(event.category));
}
