/**
 * 마스킹/복원 유스케이스 — domain 순수 함수(maskEngine)를 감싼다.
 */
import { applyMask, restore } from '@domain/privacy/maskEngine';
import type { MaskConfig, MaskMapping, MaskResult } from '@domain/privacy/types';

export class MaskMarkdown {
  /** 마크다운에서 개인정보를 가린다. */
  apply(markdown: string, config: MaskConfig): MaskResult {
    return applyMask(markdown, config);
  }

  /** 가린 텍스트(또는 AI 결과)를 매핑으로 실명 복원한다. */
  restore(text: string, mappings: readonly MaskMapping[]): string {
    return restore(text, mappings);
  }
}
