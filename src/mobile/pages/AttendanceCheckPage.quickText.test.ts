/**
 * 모바일 AttendanceCheckPage 텍스트 빠른 입력 회귀 메타테스트.
 *
 * - 파서 공유(parseAttendanceQuickText) + 모바일 전용 교시 생략 옵션(requirePeriod:false)
 * - 담임 출결 전용 트리거(수업 출결 비노출)
 * - 적용은 기존 상태맵 경유(setStudentStatuses 등) + scheduleSave — 신규 저장 경로 금지
 * - Bottom Sheet 접근성(role/aria) + safe-area
 *
 * 환경: node + 정적 파일 grep (AttendanceCheckPage.multiDate.test.ts와 동일 관례)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve(__dirname, 'AttendanceCheckPage.tsx');
const source = readFileSync(SRC, 'utf-8');

describe('AttendanceCheckPage 텍스트 빠른 입력', () => {
  it('도메인 파서 공유 — parseAttendanceQuickText import', () => {
    expect(source).toContain(
      "import { parseAttendanceQuickText } from '@domain/rules/attendanceQuickText';",
    );
  });

  it('모바일은 교시 생략 허용 — requirePeriod: false', () => {
    expect(source).toContain('requirePeriod: false');
  });

  it('헤더 "텍스트" 트리거는 담임 출결 전용', () => {
    expect(source).toContain("{type === 'homeroom' && (");
    expect(source).toContain('aria-label="텍스트로 출결 입력"');
    expect(source).toContain('edit_note');
  });

  it('적용은 기존 상태맵 + 디바운스 저장 경유 (신규 저장 경로 0)', () => {
    expect(source).toContain('const applyText = ');
    expect(source).toContain('setStudentStatuses(nextStatuses)');
    expect(source).toContain('setStudentReasons(nextReasons)');
    expect(source).toContain('setStudentMemos(nextMemos)');
    // applyText 본문이 scheduleSave를 호출한다 (saveRecord 직접 호출 금지)
    const applyBody = source.slice(source.indexOf('const applyText = '));
    const applyEnd = applyBody.indexOf('};');
    expect(applyBody.slice(0, applyEnd)).toContain('scheduleSave()');
    expect(applyBody.slice(0, applyEnd)).not.toContain('saveRecord(');
  });

  it('미리보기는 모바일 전용 재조립(교시 미노출) + 오류 행 표기', () => {
    expect(source).toContain('previewLabel');
    expect(source).toContain('${line.lineNo}행: ${line.error}');
  });

  it('Bottom Sheet 접근성 + safe-area', () => {
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain("paddingBottom: 'env(safe-area-inset-bottom)'");
  });
});
