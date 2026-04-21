import type { FormTemplate } from '@domain/entities/FormTemplate';
import type { IFormTemplateRepository } from '@domain/repositories/IFormTemplateRepository';

/** 사용자 수정 가능 필드만 허용 — 타입 레벨에서 다른 필드 차단. */
export type UpdateFormPatch = Partial<Pick<FormTemplate, 'name' | 'categoryId' | 'tags' | 'starred'>>;

export async function updateForm(
  id: string,
  patch: UpdateFormPatch,
  repo: IFormTemplateRepository,
): Promise<void> {
  await repo.update(id, patch);
}
