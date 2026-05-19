/**
 * 모바일 AttendanceCheckPage 여러 날 Bottom Sheet 회귀 메타테스트.
 *
 * - Bottom Sheet 진입점 + role="dialog" + safe-area-inset-bottom
 * - fan-out saveRecord 패턴
 * - 단일 날짜(오늘) 자동 저장 경로 회귀 0
 *
 * 환경: node + 정적 파일 grep
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve(__dirname, 'AttendanceCheckPage.tsx');
const source = readFileSync(SRC, 'utf-8');

describe('AttendanceCheckPage 여러 날 Bottom Sheet', () => {
  it('MultiDatePicker import', () => {
    expect(source).toContain(
      "import { MultiDatePicker } from '@adapters/components/common/MultiDatePicker';",
    );
  });

  it('multiDateSheetOpen + multiDateSet 상태', () => {
    expect(source).toContain('multiDateSheetOpen');
    expect(source).toContain('multiDateSet');
  });

  it('useBottomSheet 통합 — periodMenuOpen OR multiDateSheetOpen', () => {
    expect(source).toContain('useBottomSheet(periodMenuOpen || multiDateSheetOpen)');
  });

  it('헤더 "여러 날" 트리거 버튼', () => {
    expect(source).toContain('여러 날에 동일 출결 적용');
    expect(source).toContain('date_range');
  });

  it('Bottom Sheet role="dialog" + aria-modal', () => {
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain('aria-label="여러 날에 동일 출결 적용"');
  });

  it('safe-area-inset-bottom 보호', () => {
    expect(source).toContain("paddingBottom: 'env(safe-area-inset-bottom)'");
  });

  it('mobileSheet + inline MultiDatePicker', () => {
    expect(source).toMatch(/mode="multi"/);
    expect(source).toContain('mobileSheet');
    expect(source).toContain('multiValues={multiDateSet}');
    expect(source).toContain('maxCount={30}');
  });

  it('fan-out: saveRecord N번 호출 + 30일 가드', () => {
    expect(source).toContain('handleMultiDateSave');
    expect(source).toContain('Array.from(multiDateSet).sort()');
    expect(source).toContain('최대 30일');
    expect(source).toContain('await saveRecord');
  });

  it('진행률 표시', () => {
    expect(source).toContain('multiSaveProgress');
  });

  it('단일 날짜(오늘) 자동 저장 경로 회귀 0 — todayString + doSave 유지', () => {
    expect(source).toContain('date: todayString()');
    expect(source).toContain('await saveRecord(record)');
    expect(source).toContain('debounceRef');
  });
});
