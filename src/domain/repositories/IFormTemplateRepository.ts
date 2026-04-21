import type { FormTemplate } from '@domain/entities/FormTemplate';
import type { FormCategory } from '@domain/entities/FormCategory';

export type FormTemplateUpdatePatch = Partial<
  Omit<FormTemplate, 'id' | 'isBuiltin' | 'createdAt'>
>;

export interface IFormTemplateRepository {
  list(): Promise<readonly FormTemplate[]>;
  get(id: string): Promise<FormTemplate | null>;
  create(
    template: FormTemplate,
    fileBytes: Uint8Array,
    thumbnail?: Uint8Array,
  ): Promise<void>;
  update(id: string, patch: FormTemplateUpdatePatch): Promise<void>;
  delete(id: string): Promise<void>;
  readFile(id: string): Promise<Uint8Array>;
  readThumbnail(id: string): Promise<Uint8Array | null>;
  listCategories(): Promise<readonly FormCategory[]>;
  upsertCategory(c: FormCategory): Promise<void>;
  deleteCategory(id: string): Promise<void>;
}
