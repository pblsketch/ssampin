import type { FormTemplate } from '@domain/entities/FormTemplate';
import {
  filterForms,
  sortForms,
  type FormFilterOptions,
  type FormSort,
} from '@domain/rules/formTemplateRules';

export function listForms(
  all: readonly FormTemplate[],
  filter: FormFilterOptions,
  sort: FormSort,
): readonly FormTemplate[] {
  return sortForms(filterForms(all, filter), sort);
}
