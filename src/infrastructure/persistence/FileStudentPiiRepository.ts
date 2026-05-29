import type { IStudentPiiRepository } from '@domain/repositories/IStudentPiiRepository';
import type { IStudentPiiReader } from '@domain/repositories/IStudentPiiReader';
import type { StudentPiiOverlay } from '@domain/entities/StudentPiiOverlay';
import { AtomicJsonFileStore } from './AtomicJsonFileStore';

interface PiiOverlayFileV1 {
  readonly schemaVersion: 1;
  readonly overlays: readonly StudentPiiOverlay[];
}

/**
 * FileStudentPiiRepository — Decision 1 + Decision 10
 *
 * `${userData}/student-pii.json` 에 영구 저장. atomic write (Decision 4).
 *
 * - schemaVersion 1 (ABCDE 5-letter level). #PII-TRACK-1 (v1.12)에서 schemaVersion 2 (Quintile ordinal) 도입 예정.
 * - 메모리 캐시 + 디스크 동기화. `version()`은 mutation 카운터.
 * - IStudentPiiReader도 동시 구현 (동일 인스턴스 재사용 가능).
 *
 * 관련 ADR: docs/architecture/student-pii-adr-v1.2.md Decision 1, 4, 10
 */
export class FileStudentPiiRepository implements IStudentPiiRepository, IStudentPiiReader {
  private cache: Map<string, StudentPiiOverlay> = new Map();
  private loaded = false;
  private versionCounter = 0;
  private readonly store: AtomicJsonFileStore<PiiOverlayFileV1>;

  constructor(filePath: string) {
    this.store = new AtomicJsonFileStore<PiiOverlayFileV1>(filePath);
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    const data = await this.store.read();
    if (data && Array.isArray(data.overlays)) {
      for (const overlay of data.overlays) {
        this.cache.set(overlay.studentId, overlay);
      }
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    const payload: PiiOverlayFileV1 = {
      schemaVersion: 1,
      overlays: Array.from(this.cache.values()),
    };
    await this.store.write(payload);
  }

  async getAll(): Promise<readonly StudentPiiOverlay[]> {
    await this.ensureLoaded();
    return Array.from(this.cache.values());
  }

  async get(studentId: string): Promise<StudentPiiOverlay | null> {
    await this.ensureLoaded();
    return this.cache.get(studentId) ?? null;
  }

  async save(overlay: StudentPiiOverlay): Promise<void> {
    await this.ensureLoaded();
    this.cache.set(overlay.studentId, overlay);
    this.versionCounter++;
    await this.persist();
  }

  async delete(studentId: string): Promise<void> {
    await this.ensureLoaded();
    if (this.cache.delete(studentId)) {
      this.versionCounter++;
      await this.persist();
    }
  }

  async saveAll(overlays: readonly StudentPiiOverlay[]): Promise<void> {
    this.cache = new Map(overlays.map((o) => [o.studentId, o]));
    this.loaded = true;
    this.versionCounter++;
    await this.persist();
  }

  async dispose(): Promise<void> {
    // 영구 저장 모드는 dispose 시 별도 동작 없음 (디스크에 이미 보존).
  }

  version(): number {
    return this.versionCounter;
  }
}
