import { describe, it, expect } from 'vitest';
import { textQualityNotice } from './markdownConvertQuality';
import type { ParsedTextQuality, TextQualityReason } from '@domain/ports/IDocumentParserPort';

describe('textQualityNotice', () => {
  it('신호 없음(undefined) → null', () => {
    expect(textQualityNotice(undefined)).toBeNull();
  });

  it('needsReview=false → null (양호)', () => {
    expect(textQualityNotice({ needsReview: false })).toBeNull();
  });

  it('image_based → tone "scan"', () => {
    const notice = textQualityNotice({ needsReview: true, reason: 'image_based' });
    expect(notice).not.toBeNull();
    expect(notice?.tone).toBe('scan');
    expect(notice?.message.length).toBeGreaterThan(0);
  });

  it('깨짐 계열(high_pua/high_control/high_replacement/low_text) → tone "garbled"', () => {
    const reasons: TextQualityReason[] = [
      'low_text',
      'high_pua',
      'high_control',
      'high_replacement',
    ];
    for (const reason of reasons) {
      const notice = textQualityNotice({ needsReview: true, reason });
      expect(notice?.tone, reason).toBe('garbled');
      expect(notice?.message.length, reason).toBeGreaterThan(0);
    }
  });

  it('needsReview=true 인데 reason 없음 → 일반 폴백(garbled, non-null)', () => {
    const notice = textQualityNotice({ needsReview: true });
    expect(notice).not.toBeNull();
    expect(notice?.tone).toBe('garbled');
  });

  it('미지의 reason(런타임 비정상 값) → 폴백', () => {
    const weird = { needsReview: true, reason: 'something_else' } as unknown as ParsedTextQuality;
    const notice = textQualityNotice(weird);
    expect(notice).not.toBeNull();
    expect(notice?.tone).toBe('garbled');
  });
});
