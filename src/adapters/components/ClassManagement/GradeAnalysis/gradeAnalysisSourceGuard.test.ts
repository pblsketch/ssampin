/**
 * 성적 탭 소스 가드 테스트 (계획 §Phase 3).
 * UI 동작 대신, 회귀 방지를 위해 핵심 구조/문구/불변식이 소스에 존재하는지 검증한다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
}

const tab = read('./ClassAssessmentManagementTab.tsx');
const page = read('../ClassManagementPage.tsx');

describe('성적 탭 소스 가드', () => {
  it('수업 관리에 성적(assessment) 탭이 배선되어 있다', () => {
    expect(page).toContain("id: 'assessment'");
    expect(page).toContain('ClassAssessmentManagementTab');
    expect(page).toContain("activeTab === 'assessment'");
  });

  it('지필/수행 구분 + 산출 미리보기 + 추정/개인정보 안내가 있다', () => {
    expect(tab).toContain('정기시험(지필)');
    expect(tab).toContain('수행평가');
    expect(tab).toContain('산출 미리보기');
    expect(tab).toContain('추정값');
    expect(tab).toContain('이 PC에만 저장');
    expect(tab).toContain('과제형');
  });

  it('학생 점수 외부 전송 금지 — fetch/외부 URL 호출이 없다', () => {
    expect(tab).not.toMatch(/fetch\s*\(/);
    expect(tab).not.toContain('http');
  });
});
