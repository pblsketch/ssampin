/**
 * β-Step6 — InlineComposeCard use case 단위 테스트.
 *
 * Plan §2.2 Step 6 / Spec L188 (InlineComposer UI state).
 *
 * 검증:
 *   - 빈 텍스트 → text-empty
 *   - 1001자 초과 → text-overflow
 *   - 잘못된 색상 → invalid-color
 *   - 정상 입력 → ok + normalized (trim + color default 'white')
 *   - tabId 통과 그대로 (보드-level 검증은 호출자 책임)
 *   - fontSize 도메인 미포함 — request 인터페이스에 fontSize 필드 부재 검증
 */
import { describe, expect, it } from 'vitest';
import {
  validateInlineCompose,
  INLINE_COMPOSER_DEFAULT_FONT_SIZE,
  INLINE_COMPOSER_FONT_SIZES,
} from '../InlineComposeCard';
import { REALTIME_WALL_MAX_TEXT_LENGTH_V2 } from '@domain/rules/realtimeWallRules';

describe('validateInlineCompose', () => {
  describe('text invariants', () => {
    it('빈 텍스트는 text-empty 반환', () => {
      const result = validateInlineCompose({ text: '' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('text-empty');
    });

    it('공백/줄바꿈 만으로 구성된 텍스트도 text-empty', () => {
      const result = validateInlineCompose({ text: '   \n\t  ' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('text-empty');
    });

    it(`${REALTIME_WALL_MAX_TEXT_LENGTH_V2 + 1}자는 text-overflow`, () => {
      const overflow = 'a'.repeat(REALTIME_WALL_MAX_TEXT_LENGTH_V2 + 1);
      const result = validateInlineCompose({ text: overflow });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('text-overflow');
    });

    it(`정확히 ${REALTIME_WALL_MAX_TEXT_LENGTH_V2}자는 통과 (경계값)`, () => {
      const max = 'a'.repeat(REALTIME_WALL_MAX_TEXT_LENGTH_V2);
      const result = validateInlineCompose({ text: max });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.text.length).toBe(REALTIME_WALL_MAX_TEXT_LENGTH_V2);
    });

    it('정상 입력 trim 적용', () => {
      const result = validateInlineCompose({ text: '  hello\n  ' });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.text).toBe('hello');
    });
  });

  describe('color invariants', () => {
    it('color 미지정 시 white 로 보정', () => {
      const result = validateInlineCompose({ text: '내용' });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.color).toBe('white');
    });

    it('8색 enum 통과', () => {
      const result = validateInlineCompose({ text: '내용', color: 'pink' });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.color).toBe('pink');
    });

    it('잘못된 색상 reject', () => {
      // 타입 시스템 우회로 invalid 값 주입 (런타임 가드 검증)
      const result = validateInlineCompose({
        text: '내용',
        color: 'rainbow' as never,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('invalid-color');
    });
  });

  describe('tabId pass-through', () => {
    it('tabId 미지정 시 normalized 에서 tabId 키 없음 (exactOptionalPropertyTypes)', () => {
      const result = validateInlineCompose({ text: '내용' });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.tabId).toBeUndefined();
    });

    it('tabId 지정 시 그대로 전달', () => {
      const result = validateInlineCompose({ text: '내용', tabId: 'tab-1' });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.tabId).toBe('tab-1');
    });

    it('DEFAULT_TAB_ID 와 동일한 값 사용 시 통과 (호출자 책임 영역 검증 X)', () => {
      const result = validateInlineCompose({ text: '내용', tabId: 'default' });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.tabId).toBe('default');
    });
  });
});

describe('INLINE_COMPOSER UI state constants', () => {
  it('폰트크기 3종 enum 정확', () => {
    expect(INLINE_COMPOSER_FONT_SIZES).toEqual(['small', 'medium', 'large']);
  });

  it('기본 폰트크기는 medium', () => {
    expect(INLINE_COMPOSER_DEFAULT_FONT_SIZE).toBe('medium');
  });
});
