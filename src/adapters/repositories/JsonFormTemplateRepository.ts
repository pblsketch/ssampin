import type { FormTemplate } from '@domain/entities/FormTemplate';
import { BUILTIN_CATEGORIES, type FormCategory } from '@domain/entities/FormCategory';
import type {
  IFormTemplateRepository,
  FormTemplateUpdatePatch,
} from '@domain/repositories/IFormTemplateRepository';
import type { IStoragePort } from '@domain/ports/IStoragePort';
import {
  BuiltinFormProtectedError,
  CategoryInUseError,
  FormFileMissingError,
} from '@domain/errors/FormErrors';

const FORMS_KEY = 'forms';
const CATEGORIES_KEY = 'form-categories';

export class JsonFormTemplateRepository implements IFormTemplateRepository {
  constructor(private readonly storage: IStoragePort) {}

  async list(): Promise<readonly FormTemplate[]> {
    const data = await this.storage.read<FormTemplate[]>(FORMS_KEY);
    return data ?? [];
  }

  async get(id: string): Promise<FormTemplate | null> {
    const all = await this.list();
    return all.find((f) => f.id === id) ?? null;
  }

  async create(
    template: FormTemplate,
    fileBytes: Uint8Array,
    thumbnail?: Uint8Array,
  ): Promise<void> {
    await this.storage.writeBinary(template.filePath, fileBytes);
    if (thumbnail && template.thumbnailPath) {
      await this.storage.writeBinary(template.thumbnailPath, thumbnail);
    }
    const all = await this.list();
    // 같은 id가 있으면 교체 (업서트), 없으면 append
    const filtered = all.filter((f) => f.id !== template.id);
    await this.storage.write<FormTemplate[]>(FORMS_KEY, [...filtered, template]);
  }

  async update(id: string, patch: FormTemplateUpdatePatch): Promise<void> {
    const all = await this.list();
    const idx = all.findIndex((f) => f.id === id);
    if (idx === -1) return;
    const current = all[idx]!;
    const next: FormTemplate = { ...current, ...patch };
    const copy = [...all];
    copy[idx] = next;
    await this.storage.write<FormTemplate[]>(FORMS_KEY, copy);
  }

  async delete(id: string): Promise<void> {
    const all = await this.list();
    const target = all.find((f) => f.id === id);
    if (!target) return;
    if (target.isBuiltin) {
      throw new BuiltinFormProtectedError();
    }
    await this.storage.removeBinary(target.filePath);
    if (target.thumbnailPath) {
      await this.storage.removeBinary(target.thumbnailPath);
    }
    const next = all.filter((f) => f.id !== id);
    await this.storage.write<FormTemplate[]>(FORMS_KEY, next);
  }

  async readFile(id: string): Promise<Uint8Array> {
    const template = await this.get(id);
    if (!template) {
      throw new FormFileMissingError(id);
    }
    const bytes = await this.storage.readBinary(template.filePath);
    if (!bytes) {
      throw new FormFileMissingError(id);
    }
    return bytes;
  }

  async readThumbnail(id: string): Promise<Uint8Array | null> {
    const template = await this.get(id);
    if (!template || !template.thumbnailPath) return null;
    return await this.storage.readBinary(template.thumbnailPath);
  }

  async listCategories(): Promise<readonly FormCategory[]> {
    const user = (await this.storage.read<FormCategory[]>(CATEGORIES_KEY)) ?? [];
    const builtinIds = new Set(BUILTIN_CATEGORIES.map((c) => c.id));
    // 내장 id와 충돌하는 사용자 카테고리는 무시 (내장 보호)
    const safeUser = user.filter((c) => !builtinIds.has(c.id));
    return [...BUILTIN_CATEGORIES, ...safeUser];
  }

  async upsertCategory(c: FormCategory): Promise<void> {
    const builtinIds = new Set(BUILTIN_CATEGORIES.map((x) => x.id));
    if (builtinIds.has(c.id)) {
      // 내장 덮어쓰기 금지 — no-op
      return;
    }
    const user = (await this.storage.read<FormCategory[]>(CATEGORIES_KEY)) ?? [];
    const filtered = user.filter((x) => x.id !== c.id);
    await this.storage.write<FormCategory[]>(CATEGORIES_KEY, [...filtered, c]);
  }

  async deleteCategory(id: string): Promise<void> {
    const builtinIds = new Set(BUILTIN_CATEGORIES.map((c) => c.id));
    if (builtinIds.has(id)) {
      throw new BuiltinFormProtectedError();
    }
    const forms = await this.list();
    const inUse = forms.filter((f) => f.categoryId === id).length;
    if (inUse > 0) {
      throw new CategoryInUseError(inUse);
    }
    const user = (await this.storage.read<FormCategory[]>(CATEGORIES_KEY)) ?? [];
    const next = user.filter((c) => c.id !== id);
    await this.storage.write<FormCategory[]>(CATEGORIES_KEY, next);
  }
}
