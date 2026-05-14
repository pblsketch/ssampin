/**
 * 학생 HTML 페이지 `[hidden] { display: none !important; }` 회귀 차단.
 *
 * 4개 도구의 학생 페이지(liveSurveyHTML, liveMultiSurveyHTML, liveVoteHTML,
 * liveWordCloudHTML)는 모두 `.state-view { display: flex }` + HTML `hidden`
 * 속성 조합으로 단일 상태만 노출한다. 그러나 `[hidden] { display: none !important; }`
 * 규칙이 없으면 CSS의 `display: flex`가 HTML `hidden` 속성을 덮어 모든 상태가
 * 동시에 누적 표시되는 시각적 버그가 발생한다. (2026-05-14 사용자 신고로 발견)
 *
 * 본 테스트는 4 파일 모두 해당 규칙을 포함하고 있는지 grep으로 보장해 회귀를 차단한다.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');

const STUDENT_HTML_FILES = [
  'electron/ipc/liveSurveyHTML.ts',
  'electron/ipc/liveMultiSurveyHTML.ts',
  'electron/ipc/liveVoteHTML.ts',
  'electron/ipc/liveWordCloudHTML.ts',
];

describe('regression: student HTML pages [hidden] override rule', () => {
  for (const file of STUDENT_HTML_FILES) {
    it(`${file} must contain [hidden] { display: none !important; }`, () => {
      const src = readFileSync(resolve(ROOT, file), 'utf-8');
      // CSS 규칙 검증 — 공백/세미콜론 허용
      expect(src).toMatch(/\[hidden\]\s*\{\s*display\s*:\s*none\s*!important\s*;?\s*\}/);
    });
  }
});
