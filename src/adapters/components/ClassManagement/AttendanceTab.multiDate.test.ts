/**
 * AttendanceTab 다중 날짜 모드 회귀 메타테스트.
 *
 * - MultiDatePicker 통합 + multi 모드 토글 + fan-out 저장 + 안내 배너
 * - 단일 모드 회귀 0 (기존 saveAttendanceRecord 단일 호출 경로 유지)
 *
 * 환경: node + 정적 파일 grep
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve(__dirname, 'AttendanceTab.tsx');
const source = readFileSync(SRC, 'utf-8');

describe('AttendanceTab 다중 날짜 모드', () => {
  it('MultiDatePicker import', () => {
    expect(source).toContain(
      "import { MultiDatePicker } from '@adapters/components/common/MultiDatePicker';",
    );
  });

  it('multiDateMode + multiDateSet 상태', () => {
    expect(source).toMatch(/multiDateMode.*useState\(false\)/);
    expect(source).toMatch(/multiDateSet.*ReadonlySet<string>.*new Set\(\)/);
  });

  it('단일 모드: MultiDatePicker mode="single"', () => {
    expect(source).toContain('mode="single"');
    expect(source).toContain('singleValue={date}');
    expect(source).toContain('onSingleChange={handleDateChange}');
  });

  it('다중 모드: MultiDatePicker mode="multi"', () => {
    expect(source).toContain('mode="multi"');
    expect(source).toContain('multiValues={multiDateSet}');
    expect(source).toContain('maxCount={30}');
  });

  it('"여러 날" 토글 버튼 + aria-pressed', () => {
    expect(source).toContain('여러 날');
    expect(source).toContain('aria-pressed={multiDateMode}');
  });

  it('fan-out 저장: forEach 패턴 + 30일 가드', () => {
    expect(source).toContain('Array.from(multiDateSet).sort()');
    expect(source).toContain('최대 30일');
    expect(source).toContain('일괄 저장');
  });

  it('진행률 추적 batchProgress', () => {
    expect(source).toMatch(/batchProgress.*current.*total/);
  });

  it('다중 모드 안내 배너 + 저장 버튼 라벨 동적', () => {
    expect(source).toContain('여러 날 일괄 등록 모드');
    expect(source).toMatch(/\$\{multiDateSet\.size\}일 일괄 저장/);
  });

  it('단일 모드 회귀 0: saveAttendanceRecord 기존 호출 경로 유지', () => {
    // 단일 날짜 저장 경로에서 saveAttendanceRecord 가 여전히 호출되어야 함
    expect(source).toContain('await saveAttendanceRecord(record)');
    // students payload 구조 유지
    expect(source).toContain('studentsPayload');
  });
});
