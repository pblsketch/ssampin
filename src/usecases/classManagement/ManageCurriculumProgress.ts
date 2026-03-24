import type { ProgressEntry, CurriculumProgressData } from '@domain/entities/CurriculumProgress';
import type { ITeachingClassRepository } from '@domain/repositories/ITeachingClassRepository';

export class ManageCurriculumProgress {
  constructor(private readonly repository: ITeachingClassRepository) {}

  async getAll(): Promise<readonly ProgressEntry[]> {
    const data = await this.repository.getProgress();
    return data?.entries ?? [];
  }

  async getByClass(classId: string): Promise<readonly ProgressEntry[]> {
    const entries = await this.getAll();
    return entries.filter((e) => e.classId === classId);
  }

  async add(entry: ProgressEntry): Promise<void> {
    const data = await this.repository.getProgress();
    const entries = data?.entries ?? [];

    const updatedEntries: readonly ProgressEntry[] = [...entries, entry];
    const updatedData: CurriculumProgressData = { entries: updatedEntries };

    await this.repository.saveProgress(updatedData);
  }

  async update(entry: ProgressEntry): Promise<void> {
    const data = await this.repository.getProgress();
    const entries = data?.entries ?? [];

    const updatedEntries: readonly ProgressEntry[] = entries.map((e) =>
      e.id === entry.id ? entry : e
    );
    const updatedData: CurriculumProgressData = { entries: updatedEntries };

    await this.repository.saveProgress(updatedData);
  }

  async delete(id: string): Promise<void> {
    const data = await this.repository.getProgress();
    const entries = data?.entries ?? [];

    const updatedEntries: readonly ProgressEntry[] = entries.filter(
      (e) => e.id !== id
    );
    const updatedData: CurriculumProgressData = { entries: updatedEntries };

    await this.repository.saveProgress(updatedData);
  }

  async saveAll(entries: readonly ProgressEntry[], force = false): Promise<void> {
    // 방어: 기존 데이터가 있는데 빈 배열로 덮어쓰려 하면 차단 (force로 의도적 삭제 허용)
    if (!force) {
      const existing = await this.repository.getProgress();
      const existingCount = existing?.entries?.length ?? 0;
      if (existingCount > 0 && entries.length === 0) {
        console.warn(
          `[ManageProgress] 기존 진도 ${existingCount}건을 빈 배열로 덮어쓰기 시도 차단됨`,
        );
        return;
      }
    }

    const updatedData: CurriculumProgressData = { entries };
    await this.repository.saveProgress(updatedData);
  }
}
