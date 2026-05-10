/**
 * JsonInteractiveLessonsRepository — `IInteractiveLessonRepository` JSON 구현.
 *
 * IStoragePort 위에서 단일 파일(`interactiveSlidesLessons.json`) 영속.
 * 수업 템플릿 갯수는 교사 1인당 최대 수십 개 수준이므로 단일 파일이 충분.
 */

import type { IStoragePort } from '@domain/ports/IStoragePort';
import type {
  IInteractiveLessonRepository,
  InteractiveLessonsData,
} from '@domain/repositories/IInteractiveLessonRepository';

const FILE_NAME = 'interactiveSlidesLessons';

export class JsonInteractiveLessonsRepository
  implements IInteractiveLessonRepository
{
  constructor(private readonly storage: IStoragePort) {}

  loadAll(): Promise<InteractiveLessonsData | null> {
    return this.storage.read<InteractiveLessonsData>(FILE_NAME);
  }

  saveAll(data: InteractiveLessonsData): Promise<void> {
    return this.storage.write(FILE_NAME, data);
  }
}
