import type { DetectedMergeField } from '@domain/valueObjects/MergeField';

export type FormFormat = 'hwpx' | 'pdf' | 'excel';

export interface FormTemplate {
  readonly id: string;
  readonly name: string;
  readonly format: FormFormat;
  readonly categoryId: string;
  /** 상대경로: "forms/{id}.{ext}" */
  readonly filePath: string;
  readonly fileSize: number;
  /** PDF 서식만 생성 */
  readonly thumbnailPath?: string;
  /** HWPX/Excel 첫 80자 발췌 */
  readonly textPreview?: string;
  readonly mergeFields: readonly DetectedMergeField[];
  readonly customFieldDefaults: Readonly<Record<string, string>>;
  readonly starred: boolean;
  readonly tags: readonly string[];
  /** 내장 서식은 삭제 불가 */
  readonly isBuiltin: boolean;
  /** ISO 8601 */
  readonly createdAt: string;
  readonly lastUsedAt?: string;
  readonly useCount: number;
}
