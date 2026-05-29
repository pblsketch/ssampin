import { describe, it, expect } from 'vitest';
import { Linter } from 'eslint';
// @ts-expect-error — JavaScript 모듈 (no .d.ts 제공). 본 룰은 .js로 의도적 작성.
import rule from './no-pii-in-logs.js';

/**
 * no-pii-in-logs ESLint Rule Test (Linter 기반, 의존성 외부 패키지 0)
 *
 * Acceptance: 'fires on console.log(student.phone) and passes on type-only imports'
 *
 * Fixtures: 5 known-good + 5 known-bad (Critic C#11 요구).
 */

const RULE_NAME = 'pii/no-pii-in-logs';

function lint(code: string, parser: 'js' | 'ts' = 'js'): Linter.LintMessage[] {
  const linter = new Linter();
  // ESLint v10 Linter 인스턴스에 룰 등록. flat config 형식으로 verify.
  return linter.verify(code, [
    {
      plugins: {
        pii: { rules: { 'no-pii-in-logs': rule as never } },
      },
      languageOptions:
        parser === 'ts'
          ? {
              parser: require('@typescript-eslint/parser'),
            }
          : {
              ecmaVersion: 2022,
              sourceType: 'module',
            },
      rules: { [RULE_NAME]: 'error' },
    },
  ]);
}

describe('no-pii-in-logs rule', () => {
  // ────────────── VALID (5) ──────────────
  it('GOOD-1: type-only import는 면제', () => {
    const msgs = lint(`import { something } from 'some-module'; void something;`);
    expect(msgs).toHaveLength(0);
  });

  it('GOOD-2: PII 미접근 일반 필드 로깅', () => {
    const msgs = lint(`const s = { id: 's1', name: 'a' }; console.log(s.id, s.name);`);
    expect(msgs).toHaveLength(0);
  });

  it('GOOD-3: 로거 아닌 함수 호출은 무시', () => {
    const msgs = lint(`function doSomething(_x){} const s = { phone: '010' }; doSomething(s.phone);`);
    expect(msgs).toHaveLength(0);
  });

  it('GOOD-4: PII 필드명과 같은 변수명이지만 MemberExpression 아님', () => {
    const msgs = lint(`const gender = 'M'; console.log(gender);`);
    expect(msgs).toHaveLength(0);
  });

  it('GOOD-5: 비-PII 필드(studentNumber)는 허용', () => {
    const msgs = lint(`const s = { studentNumber: 1 }; console.log(s.studentNumber);`);
    expect(msgs).toHaveLength(0);
  });

  // ────────────── INVALID (5) ──────────────
  it('BAD-1: console.log(s.gender)', () => {
    const msgs = lint(`const s = { gender: 'M' }; console.log(s.gender);`);
    expect(msgs.length).toBeGreaterThan(0);
    expect(msgs[0]?.ruleId).toBe(RULE_NAME);
  });

  it('BAD-2: console.warn(s.academicLevel)', () => {
    const msgs = lint(`const s = { academicLevel: 'A' }; console.warn(s.academicLevel);`);
    expect(msgs.length).toBeGreaterThan(0);
    expect(msgs[0]?.ruleId).toBe(RULE_NAME);
  });

  it('BAD-3: console.log(student.phone) — Critic C#11 명시 케이스', () => {
    const msgs = lint(`const student = { phone: '010-0000-0000' }; console.log(student.phone);`);
    expect(msgs.length).toBeGreaterThan(0);
    expect(msgs[0]?.ruleId).toBe(RULE_NAME);
  });

  it('BAD-4: logger.error(msg, s.parentPhone)', () => {
    const msgs = lint(
      `const s = { parentPhone: '010' }; const logger = { error(_a,_b){} }; logger.error('msg', s.parentPhone);`,
    );
    expect(msgs.length).toBeGreaterThan(0);
    expect(msgs[0]?.ruleId).toBe(RULE_NAME);
  });

  it('BAD-5: template literal 내부 PII 접근', () => {
    const msgs = lint("const s = { birthDate: '2010-01-01' }; console.info(`dob=${s.birthDate}`);");
    expect(msgs.length).toBeGreaterThan(0);
    expect(msgs[0]?.ruleId).toBe(RULE_NAME);
  });
});
