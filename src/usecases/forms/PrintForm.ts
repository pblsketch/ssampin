import type { IFormTemplateRepository } from '@domain/repositories/IFormTemplateRepository';
import type { IPrinterAdapter } from '@domain/ports/IFormPorts';
import { FormFileMissingError } from '@domain/errors/FormErrors';

export async function printForm(
  id: string,
  repo: IFormTemplateRepository,
  printer: IPrinterAdapter,
): Promise<void> {
  const template = await repo.get(id);
  if (!template) {
    throw new FormFileMissingError(id);
  }
  const bytes = await repo.readFile(id);
  await printer.print(bytes, template.format, template.name);
}
