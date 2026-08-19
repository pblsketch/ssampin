import type { ProgressEntry, CurriculumProgressData } from '@domain/entities/CurriculumProgress';
import type { ITeachingClassRepository } from '@domain/repositories/ITeachingClassRepository';

/**
 * 진도 기록 유스케이스.
 *
 * ⚠️ **저장은 반드시 `{ ...data, entries }` 형태로 한다** — 읽어 온 파일 루트(봉투)를 보존해야 한다.
 * 예전에는 `{ entries }`만 새로 만들어 저장해서, 같은 파일에 있는 형제 필드가 **다음 저장 한 번에
 * 조용히 사라졌다.** 진도는 사용자가 가장 자주 쓰는 저장 경로라(수업 한 번에 한 건씩), 형제 필드를
 * 쓰는 기능은 하루도 못 버티고 데이터를 잃는다.
 *
 * 이 규칙은 **새로 추가하는 메서드에도 그대로 적용된다.** 여기서 고친 습관이 새 코드에서 되살아나는
 * 것이 이 저장소의 전형적인 재발 경로다.
 *
 * 잠금 장치: `__tests__/curriculumProgressSiblingPreserve.test.ts`
 */
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
    const updatedData: CurriculumProgressData = { ...(data ?? {}), entries: updatedEntries };

    await this.repository.saveProgress(updatedData);
  }

  async update(entry: ProgressEntry): Promise<void> {
    const data = await this.repository.getProgress();
    const entries = data?.entries ?? [];

    const updatedEntries: readonly ProgressEntry[] = entries.map((e) =>
      e.id === entry.id ? entry : e,
    );
    const updatedData: CurriculumProgressData = { ...(data ?? {}), entries: updatedEntries };

    await this.repository.saveProgress(updatedData);
  }

  async delete(id: string): Promise<void> {
    const data = await this.repository.getProgress();
    const entries = data?.entries ?? [];

    const updatedEntries: readonly ProgressEntry[] = entries.filter((e) => e.id !== id);
    const updatedData: CurriculumProgressData = { ...(data ?? {}), entries: updatedEntries };

    await this.repository.saveProgress(updatedData);
  }

  async saveAll(entries: readonly ProgressEntry[], force = false): Promise<void> {
    // 루트 보존을 위해 force 여부와 무관하게 먼저 읽는다.
    // (예전에는 !force일 때만 읽어서, force 저장이 형제 필드를 통째로 날렸다.)
    const existing = await this.repository.getProgress();

    // 방어: 기존 데이터가 있는데 빈 배열로 덮어쓰려 하면 차단 (force로 의도적 삭제 허용)
    if (!force) {
      const existingCount = existing?.entries?.length ?? 0;
      if (existingCount > 0 && entries.length === 0) {
        console.warn(
          `[ManageProgress] 기존 진도 ${existingCount}건을 빈 배열로 덮어쓰기 시도 차단됨`,
        );
        return;
      }
    }

    const updatedData: CurriculumProgressData = { ...(existing ?? {}), entries };
    await this.repository.saveProgress(updatedData);
  }
}
