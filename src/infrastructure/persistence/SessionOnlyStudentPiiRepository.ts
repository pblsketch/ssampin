import type { IStudentPiiRepository } from '@domain/repositories/IStudentPiiRepository';
import type { IStudentPiiReader } from '@domain/repositories/IStudentPiiReader';
import type { StudentPiiOverlay } from '@domain/entities/StudentPiiOverlay';

/**
 * SessionOnlyStudentPiiRepository — Decision 10
 *
 * In-memory, 영속화 안 함. `RecordConsent('session-only')` 선택 시 DI 팩토리가 swap한다.
 *
 * `dispose()` 시 모든 데이터 즉시 소실. 앱 종료(전체 모듈 GC) 시 데이터 자동 소실.
 *
 * 관련 ADR: docs/architecture/student-pii-adr-v1.2.md Decision 10
 */
export class SessionOnlyStudentPiiRepository
  implements IStudentPiiRepository, IStudentPiiReader
{
  private cache: Map<string, StudentPiiOverlay> = new Map();
  private versionCounter = 0;
  private disposed = false;

  async getAll(): Promise<readonly StudentPiiOverlay[]> {
    if (this.disposed) return [];
    return Array.from(this.cache.values());
  }

  async get(studentId: string): Promise<StudentPiiOverlay | null> {
    if (this.disposed) return null;
    return this.cache.get(studentId) ?? null;
  }

  async save(overlay: StudentPiiOverlay): Promise<void> {
    if (this.disposed) throw new Error('SessionOnlyStudentPiiRepository: disposed');
    this.cache.set(overlay.studentId, overlay);
    this.versionCounter++;
  }

  async delete(studentId: string): Promise<void> {
    if (this.disposed) return;
    if (this.cache.delete(studentId)) this.versionCounter++;
  }

  async saveAll(overlays: readonly StudentPiiOverlay[]): Promise<void> {
    if (this.disposed) throw new Error('SessionOnlyStudentPiiRepository: disposed');
    this.cache = new Map(overlays.map((o) => [o.studentId, o]));
    this.versionCounter++;
  }

  async dispose(): Promise<void> {
    this.cache.clear();
    this.disposed = true;
  }

  version(): number {
    return this.versionCounter;
  }
}
