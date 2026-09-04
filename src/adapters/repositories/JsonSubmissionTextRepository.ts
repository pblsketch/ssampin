import type { IStoragePort } from '@domain/ports/IStoragePort';
import type {
  ISubmissionTextRepository,
  SubmissionTextsData,
} from '@domain/repositories/ISubmissionTextRepository';

/**
 * 제출 파일 본문 캐시 저장소 — `submission-texts.json`.
 *
 * 동기화(syncRegistry)에 등록하지 않는다: 파생 자료라 언제든 다시 만들 수 있고,
 * 학생이 쓴 원문을 기기 사이로 실어 나르는 것은 별개의 결정이기 때문이다.
 */
export class JsonSubmissionTextRepository implements ISubmissionTextRepository {
  constructor(private readonly storage: IStoragePort) {}

  getSubmissionTexts(): Promise<SubmissionTextsData | null> {
    return this.storage.read<SubmissionTextsData>('submission-texts');
  }

  saveSubmissionTexts(data: SubmissionTextsData): Promise<void> {
    return this.storage.write('submission-texts', data);
  }
}
