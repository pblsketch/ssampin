import type { FormFormat } from '@domain/entities/FormTemplate';

/** PDF 썸네일 생성기. format!=='pdf'면 null 반환. */
export interface IThumbnailer {
  generate(format: FormFormat, bytes: Uint8Array): Promise<Uint8Array | null>;
}

export interface PreviewMeta {
  readonly pageCount?: number;
  readonly sheetCount?: number;
}

export interface PreviewResult {
  readonly textPreview: string;
  readonly meta?: PreviewMeta;
}

/** HWPX/Excel/PDF에서 첫 페이지 텍스트 발췌 + 메타 추출 */
export interface IPreviewExtractor {
  extract(format: FormFormat, bytes: Uint8Array): Promise<PreviewResult>;
}

/** OS 프린트 대화상자 경유 인쇄 */
export interface IPrinterAdapter {
  print(bytes: Uint8Array, format: FormFormat, filename: string): Promise<void>;
}
