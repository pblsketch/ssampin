/**
 * F7a — data:read 손상 휴리스틱 정밀화 테스트 (QA-A RB1 구조 수정).
 * 유효한 빈 구조값(`[]`·`{}`)은 정상, 파스 실패·원시값 짧은 내용은 기존 치유 유지.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isCorruptShortDataFile } from './dataFileRules';

describe('isCorruptShortDataFile', () => {
  test('유효한 빈 구조값은 정상으로 취급한다(치유 안 함) — 전환 빈 값 리셋의 전제', () => {
    expect(isCorruptShortDataFile('[]')).toBe(false);
    expect(isCorruptShortDataFile('{}')).toBe(false);
    expect(isCorruptShortDataFile('[1]')).toBe(false);
    expect(isCorruptShortDataFile('[ ]')).toBe(false);
  });

  test('파스 실패 짧은 내용(절단 잔재)은 기존대로 손상 취급 → 백업 치유 유지', () => {
    expect(isCorruptShortDataFile('')).toBe(true);
    expect(isCorruptShortDataFile('{"')).toBe(true);
    expect(isCorruptShortDataFile('[{')).toBe(true);
    expect(isCorruptShortDataFile('x')).toBe(true);
  });

  test('짧은 원시값(숫자·문자열·null)은 손상 취급 — 데이터 파일 루트는 항상 구조값', () => {
    expect(isCorruptShortDataFile('0')).toBe(true);
    expect(isCorruptShortDataFile('null')).toBe(true);
    expect(isCorruptShortDataFile('"a"')).toBe(true);
    expect(isCorruptShortDataFile('true')).toBe(true);
  });

  test('5바이트 이상은 이 규칙의 대상이 아니다(항상 정상 — 뒤의 JSON.parse 검증이 담당)', () => {
    expect(isCorruptShortDataFile('{"a":1}')).toBe(false);
    expect(isCorruptShortDataFile('broken-but-long')).toBe(false);
  });

  test('main.ts data:read가 이 함수를 경유한다 (raw.length < 5 인라인 비교로 회귀 금지)', () => {
    const src = readFileSync(resolve(__dirname, 'main.ts'), 'utf-8');
    expect(src).toContain('isCorruptShortDataFile(raw)');
    expect(src).not.toMatch(/raw\.length < 5/);
  });
});
