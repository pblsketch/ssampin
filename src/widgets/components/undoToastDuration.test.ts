/**
 * G007-micro-edit-undo: AC8 정적 분석 테스트
 *
 * DashboardTodo, DashboardMemo, DDayCounter 의 모든 useToastStore.getState().show(...)
 * 호출이 durationMs=5000 을 명시적으로 전달하는지 검증한다.
 *
 * 기본값(3000ms)에 의존하면 Undo 토스트가 5초 안에 닫혀 AC8 위반이 발생한다.
 */

import { readFileSync } from 'fs';
import { describe, it, expect } from 'vitest';

const FILES = [
  'src/adapters/components/Dashboard/DashboardTodo.tsx',
  'src/adapters/components/Dashboard/DashboardMemo.tsx',
  'src/widgets/items/DDayCounter.tsx',
] as const;

/**
 * lint 가 `useToastStore.getState().show(...)` 호출을 자동 포맷으로 멀티라인 처리할 수 있으므로
 * trigger 는 regex 로 — `.getState()` 와 `.show(` 사이에 공백/줄바꿈/`.` 허용.
 */
const TRIGGER_RE = /\.getState\s*\(\s*\)\s*\.\s*show\s*\(/g;

/**
 * 소스 문자열에서 `.getState().show(` (멀티라인 포함) 로 시작하는 호출 블록을 모두 추출한다.
 * 괄호 균형을 추적해 멀티라인 호출도 안전하게 캡처한다.
 */
function extractToastShowCalls(source: string): string[] {
  const calls: string[] = [];
  TRIGGER_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TRIGGER_RE.exec(source)) !== null) {
    const start = match.index;
    const openParen = start + match[0].length - 1; // 마지막 '(' 위치
    let depth = 0;
    let end = openParen;
    while (end < source.length) {
      if (source[end] === '(') depth++;
      else if (source[end] === ')') {
        depth--;
        if (depth === 0) {
          end++;
          break;
        }
      }
      end++;
    }
    calls.push(source.slice(start, end));
    TRIGGER_RE.lastIndex = end;
  }
  return calls;
}

/**
 * 호출 문자열에 마지막 인자로 5000 이 명시되어 있는지 확인한다.
 * 인라인: getState().show(..., 5000)
 * 멀티라인: 마지막 인자 줄에 5000 이 있고 그 뒤에 선택적 쉼표 + 줄바꿈 + 닫기 괄호
 */
function has5000(call: string): boolean {
  // 인라인 패턴
  if (/,\s*5000\s*\)$/.test(call.trim())) return true;
  // 멀티라인 패턴: 5000 다음에 선택적 쉼표, 공백/줄바꿈, 닫기 괄호
  if (/\b5000\s*,?\s*[\r\n]\s*\)$/.test(call.trim())) return true;
  return false;
}

describe('G007-micro-edit-undo: Undo 토스트 durationMs=5000 정적 검증', () => {
  for (const relPath of FILES) {
    describe(relPath, () => {
      const source = readFileSync(relPath, 'utf-8');
      const toastCalls = extractToastShowCalls(source);

      it('useToastStore.getState().show 호출이 1개 이상 존재한다', () => {
        expect(toastCalls.length).toBeGreaterThanOrEqual(1);
      });

      it('모든 .show() 호출에 durationMs=5000 이 명시되어 있다', () => {
        for (const call of toastCalls) {
          expect(has5000(call), `다음 호출에 5000 이 없습니다:\n${call}`).toBe(true);
        }
      });
    });
  }
});
