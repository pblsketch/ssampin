/**
 * AttendanceMatrixView 회귀 메타테스트.
 *
 * - dismissable 안내 배너 정책 (Phase 3 §6.5)
 * - localStorage 키 `ssampin:attendance-matrix-multi-date-guide-dismissed` 회귀 차단
 *
 * 환경: node + 정적 파일 grep — 의존성 무거운 통합 테스트 회피
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve(__dirname, 'AttendanceMatrixView.tsx');
const source = readFileSync(SRC, 'utf-8');

describe('AttendanceMatrixView 안내 배너 회귀', () => {
  it('안내 배너 텍스트 노출', () => {
    expect(source).toContain('전체 교시 매트릭스는 한 번에 한 날짜만');
    expect(source).toContain('단일 교시');
  });

  it('localStorage 키 상수 유지', () => {
    expect(source).toContain("'ssampin:attendance-matrix-multi-date-guide-dismissed'");
  });

  it('dismiss 핸들러 + 안내 닫기 aria-label', () => {
    expect(source).toContain('dismissGuide');
    expect(source).toContain('"안내 닫기"');
  });

  it('AttendanceMatrixCore 래핑 유지 (회귀 0)', () => {
    expect(source).toContain('<AttendanceMatrixCore');
    expect(source).toContain('students={matrixStudents}');
    expect(source).toContain('onDateChange={onDateChange}');
  });
});
