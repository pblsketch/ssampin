import type { IFormTemplateRepository } from '@domain/repositories/IFormTemplateRepository';
import { BuiltinFormProtectedError } from '@domain/errors/FormErrors';

export async function deleteForm(
  id: string,
  repo: IFormTemplateRepository,
): Promise<void> {
  const existing = await repo.get(id);
  if (existing?.isBuiltin) {
    throw new BuiltinFormProtectedError();
  }
  await repo.delete(id);
}
