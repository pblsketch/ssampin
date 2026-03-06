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
      c.id === cls.id ? cls : c
    );
    const updatedData: TeachingClassesData = { classes: updatedClasses };

    await this.repository.saveClasses(updatedData);
  }

  async delete(id: string): Promise<void> {
    const data = await this.repository.getClasses();
    const classes = data?.classes ?? [];

    const updatedClasses: readonly TeachingClass[] = classes.filter(
      (c) => c.id !== id
    );
    const updatedData: TeachingClassesData = { classes: updatedClasses };

    await this.repository.saveClasses(updatedData);
  }
}
