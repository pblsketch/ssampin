import { describe, expect, test } from 'vitest';
import { canonicalizeCombo, isSafeGlobalCombo } from './keyNormalize';

describe('단축키 조합 정규화', () => {
  test('Ctrl/Cmd 별칭과 입력 순서를 같은 조합으로 본다', () => {
    expect(canonicalizeCombo('ctrl+alt+t')).toBe('mod+alt+t');
    expect(canonicalizeCombo('Alt+Cmd+T')).toBe('mod+alt+t');
  });

  test('일반 문자와 Shift 단독 조합은 글로벌 단축키로 허용하지 않는다', () => {
    expect(isSafeGlobalCombo('a')).toBe(false);
    expect(isSafeGlobalCombo('shift+a')).toBe(false);
    expect(isSafeGlobalCombo('mod+a')).toBe(true);
    expect(isSafeGlobalCombo('alt+a')).toBe(true);
  });
});
