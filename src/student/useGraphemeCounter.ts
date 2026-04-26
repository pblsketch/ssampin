import { useMemo } from 'react';

/**
 * v2.1 신규 — IME-aware grapheme cluster 카운터 (Plan FR-B10 / Design v2.1 §5.9).
 *
 * `text.length`는 한글 자모 분리 / 이모지 surrogate pair / Variation Selector를
 * 별개 unit으로 카운트해 부정확. `Intl.Segmenter`로 grapheme cluster 단위 카운트.
 *
 * 폴백: `Intl.Segmenter` 미지원 환경 (구 Safari, Node.js < 18)에서는
 * `Array.from(text).length`로 코드포인트 단위 카운트 (이모지 surrogate pair는 보정,
 * 단 한글 자모 분리는 보정 못 함 — 차선).
 */

const SEGMENTER = typeof Intl !== 'undefined' && typeof (Intl as unknown as { Segmenter?: unknown }).Segmenter === 'function'
  ? new (Intl as unknown as { Segmenter: new (locale: string, options: { granularity: 'grapheme' }) => { segment(input: string): Iterable<{ segment: string }> } }).Segmenter('ko', { granularity: 'grapheme' })
  : null;

export function countGraphemes(text: string): number {
  if (typeof text !== 'string' || text.length === 0) return 0;
  if (SEGMENTER) {
    let count = 0;
    for (const _ of SEGMENTER.segment(text)) {
      void _;
      count++;
    }
    return count;
  }
  // Fallback: 코드포인트 단위 (한글 자모 분리는 보정 안 됨)
  return Array.from(text).length;
}

/**
 * 메모이즈된 grapheme count 훅.
 */
export function useGraphemeCounter(text: string): number {
  return useMemo(() => countGraphemes(text), [text]);
}
