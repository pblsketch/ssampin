import type { TeachingClass, TeachingClassesData } from '@domain/entities/TeachingClass';
import type { ITeachingClassRepository } from '@domain/repositories/ITeachingClassRepository';

export class ManageTeachingClasses {
  constructor(private readonly repository: ITeachingClassRepository) {}

  async getAll(): Promise<readonly TeachingClass[]> {
    const data = await this.repository.getClasses();
    return data?.classes ?? [];
  }

  async add(cls: TeachingClass): Promise<void> {
    const data = await this.repository.getClasses();
    const classes = data?.classes ?? [];

    const updatedClasses: readonly TeachingClass[] = [...classes, cls];
    const updatedData: TeachingClassesData = { classes: updatedClasses };

    await this.repository.saveClasses(updatedData);
  }

  async update(cls: TeachingClass): Promise<void> {
    const data = await this.repository.getClasses();
    const classes = data?.classes ?? [];

    const updatedClasses: readonly TeachingClass[] = classes.map((c) =>
      c.id === cls.id ? cls : c,
    );
    const updatedData: TeachingClassesData = { classes: updatedClasses };

    await this.repository.saveClasses(updatedData);
  }

  /**
   * 여러 반을 한 번의 저장으로 갱신 (일괄 보관용).
   * 저장을 N회로 쪼개면 .backup.json 1세대 백업을 N번 덮어 유실 창이 커진다.
   * 목록에 없는 반은 저장 파일의 원본을 그대로 유지한다.
   */
  async updateMany(list: readonly TeachingClass[]): Promise<void> {
    if (list.length === 0) return;
    const data = await this.repository.getClasses();
    const classes = data?.classes ?? [];

    const byId = new Map(list.map((c) => [c.id, c] as const));
    const updatedClasses: readonly TeachingClass[] = classes.map((c) => byId.get(c.id) ?? c);

    await this.repository.saveClasses({ classes: updatedClasses });
  }

  /**
   * 활성 반 드래그 재정렬 — orderedIds에 있는 반만 order를 갱신하고,
   * 목록에 없는 반(보관된 반 등)은 원본 그대로 유지한다.
   * 배열을 orderedIds로 통째 재구성하면 미매칭 항목이 조용히 파일에서 사라진다 — 금지.
   */
  async reorder(orderedIds: readonly string[]): Promise<readonly TeachingClass[]> {
    const data = await this.repository.getClasses();
    const classes = data?.classes ?? [];

    const orderOf = new Map(orderedIds.map((id, index) => [id, index] as const));
    const now = new Date().toISOString();
    const updatedClasses: readonly TeachingClass[] = classes.map((c) => {
      const order = orderOf.get(c.id);
      if (order === undefined || c.order === order) return c;
      return { ...c, order, updatedAt: now };
    });

    await this.repository.saveClasses({ classes: updatedClasses });
    return updatedClasses;
  }

  async delete(id: string): Promise<void> {
    const data = await this.repository.getClasses();
    const classes = data?.classes ?? [];

    const updatedClasses: readonly TeachingClass[] = classes.filter((c) => c.id !== id);
    const updatedData: TeachingClassesData = { classes: updatedClasses };

    await this.repository.saveClasses(updatedData);
  }
}
