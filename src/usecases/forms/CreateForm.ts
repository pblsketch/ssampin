import type { FormTemplate, FormFormat } from '@domain/entities/FormTemplate';
import type { IFormTemplateRepository } from '@domain/repositories/IFormTemplateRepository';
import type { IThumbnailer, IPreviewExtractor } from '@domain/ports/IFormPorts';

export interface CreateFormInput {
  readonly name: string;
  readonly format: FormFormat;
  readonly categoryId: string;
  readonly tags: readonly string[];
  readonly fileBytes: Uint8Array;
}

export interface CreateFormDeps {
  readonly repo: IFormTemplateRepository;
  readonly thumbnailer: IThumbnailer;
  readonly previewExtractor: IPreviewExtractor;
  readonly idGen: () => string;
  readonly now: () => Date;
}

function extOf(format: FormFormat): string {
  switch (format) {
    case 'hwpx': return 'hwpx';
    case 'pdf':  return 'pdf';
    case 'excel': return 'xlsx';
  }
}

export async function createForm(
  input: CreateFormInput,
  deps: CreateFormDeps,
): Promise<FormTemplate> {
  const id = deps.idGen();
  const createdAt = deps.now().toISOString();

  const preview = await deps.previewExtractor.extract(input.format, input.fileBytes);

  // PDF만 썸네일 생성 (IThumbnailer 계약상 그 외는 null)
  const thumbnail = input.format === 'pdf'
    ? await deps.thumbnailer.generate(input.format, input.fileBytes)
    : null;

  const ext = extOf(input.format);
  const filePath = `forms/${id}.${ext}`;

  const template: FormTemplate = {
    id,
    name: input.name,
    format: input.format,
    categoryId: input.categoryId,
    filePath,
    fileSize: input.fileBytes.byteLength,
    thumbnailPath: thumbnail ? `forms/thumbs/${id}.png` : undefined,
    textPreview: preview.textPreview || undefined,
    mergeFields: [],
    customFieldDefaults: {},
    starred: false,
    tags: input.tags,
    isBuiltin: false,
    createdAt,
    useCount: 0,
  };

  await deps.repo.create(template, input.fileBytes, thumbnail ?? undefined);
  return template;
}
