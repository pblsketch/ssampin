import type { IEventsRepository } from '@domain/repositories/IEventsRepository';
import type { SchoolEvent, CategoryItem } from '@domain/entities/SchoolEvent';
import type {
  EventsShareFile,
  CategoryMapping,
  ImportResult,
  DuplicateStrategy,
} from '@domain/entities/EventsShareFile';
import { detectDuplicates } from '@domain/rules/shareRules';
import { generateUUID } from '@infrastructure/utils/uuid';

export class ImportEvents {
  constructor(private readonly eventsRepository: IEventsRepository) {}

  async execute(
    shareFile: EventsShareFile,
    mappings: readonly CategoryMapping[],
    duplicateStrategy: DuplicateStrategy,
  ): Promise<ImportResult> {
    const data = await this.eventsRepository.getEvents();
    const existingEvents: SchoolEvent[] = [...(data?.events ?? [])];
    const existingCategories: CategoryItem[] = data?.categories?.length ? [...data.categories] : [];

    // 1. Create new categories for unmapped, build ID mapping
    let newCategoriesCount = 0;
    const categoryIdMap = new Map<string, string>();

    for (const mapping of mappings) {
      if (mapping.targetId !== null) {
        categoryIdMap.set(mapping.sourceId, mapping.targetId);
      } else {
        const newCat: CategoryItem = {
          id: generateUUID(),
          name: mapping.targetName || mapping.sourceName,
          color: mapping.sourceColor,
        };
        existingCategories.push(newCat);
        categoryIdMap.set(mapping.sourceId, newCat.id);
        newCategoriesCount++;
      }
    }

    // 2. Remap incoming events' category IDs and assign new IDs
    const remappedEvents: SchoolEvent[] = shareFile.events.map((e) => ({
      ...e,
      id: generateUUID(),
      category: categoryIdMap.get(e.category) ?? e.category,
    }));

    // 3. Detect duplicates (based on date + title, category-independent)
    const duplicates = detectDuplicates(existingEvents, remappedEvents);
    const duplicateSet = new Set(
      duplicates.map((d) => `${d.incomingEvent.date}|${d.incomingEvent.title.trim()}`),
    );

    let imported = 0;
    let skipped = 0;
    let overwritten = 0;

    for (const event of remappedEvents) {
      const key = `${event.date}|${event.title.trim()}`;
      const isDuplicate = duplicateSet.has(key);

      if (isDuplicate) {
        if (duplicateStrategy === 'skip') {
          skipped++;
        } else {
          // overwrite: remove existing, add incoming
          const dupInfo = duplicates.find(
            (d) =>
              d.incomingEvent.date === event.date &&
              d.incomingEvent.title.trim() === event.title.trim(),
          );
          if (dupInfo) {
            const existIdx = existingEvents.findIndex(
              (e) => e.id === dupInfo.existingEvent.id,
            );
            if (existIdx >= 0) {
              existingEvents.splice(existIdx, 1);
            }
          }
          existingEvents.push(event);
          overwritten++;
        }
      } else {
        existingEvents.push(event);
        imported++;
      }
    }

    // 4. Save
    await this.eventsRepository.saveEvents({
      events: existingEvents,
      categories: existingCategories,
    });

    return { imported, skipped, overwritten, newCategories: newCategoriesCount };
  }
}
