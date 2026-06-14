/**
 * 사용자 지정 키워드 탐지(순수 함수).
 *
 * 한국어 조사 대응을 위해 정확 일치가 아니라 '포함(부분 문자열)' 매칭을 한다.
 * 예: 키워드 "김민수" → 본문 "김민수가", "김민수에게" 도 탐지.
 *
 * 과잉 매칭 방지: 2글자 미만 키워드는 무시한다("이", "그" 등 흔한 1글자).
 */
import type { DetectedSpan, KeywordGroup } from './types';

const MIN_KEYWORD_LENGTH = 2;

/** 키워드 그룹들을 본문에서 모두 찾아 구간 목록을 반환한다. */
export function detectKeywords(text: string, groups: readonly KeywordGroup[]): DetectedSpan[] {
  const spans: DetectedSpan[] = [];
  for (const group of groups) {
    // 중복 제거 + 공백 정리 + 2글자 미만 제외 + 긴 키워드 우선(부분 포함 충돌 시 긴 쪽 우선 선택되도록)
    const values = [...new Set(group.values.map((v) => v.trim()))]
      .filter((v) => v.length >= MIN_KEYWORD_LENGTH)
      .sort((a, b) => b.length - a.length);
    for (const value of values) {
      let from = 0;
      for (;;) {
        const idx = text.indexOf(value, from);
        if (idx === -1) break;
        spans.push({
          start: idx,
          end: idx + value.length,
          text: value,
          kind: 'keyword',
          confidence: 'high',
          label: group.label,
        });
        from = idx + value.length;
      }
    }
  }
  return spans;
}
