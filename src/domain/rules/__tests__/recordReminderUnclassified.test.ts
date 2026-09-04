import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  appendUnclassifiedEvidence,
  resolvePromptText,
  unclassifiedEvidenceSuffix,
} from '@domain/rules/recordReminderRules';

describe('관찰 알림 — "미분류 근거 N건" 꼬리 문구', () => {
  it('건수가 있으면 꼬리를 붙인다', () => {
    expect(unclassifiedEvidenceSuffix(3)).toBe(' · 미분류 근거 3건');
  });

  it('★0건이면 문구를 건드리지 않는다', () => {
    const base = resolvePromptText(0, '서연');
    expect(appendUnclassifiedEvidence(base, 0)).toBe(base);
  });

  it('음수·NaN·Infinity 는 붙이지 않는다(계산 실패가 문구를 망치지 않게)', () => {
    expect(unclassifiedEvidenceSuffix(-1)).toBe('');
    expect(unclassifiedEvidenceSuffix(Number.NaN)).toBe('');
    expect(unclassifiedEvidenceSuffix(Number.POSITIVE_INFINITY)).toBe('');
  });

  it('소수는 내림해서 정수로 적는다', () => {
    expect(unclassifiedEvidenceSuffix(2.9)).toBe(' · 미분류 근거 2건');
  });

  it('원래 문구를 지우지 않고 뒤에만 붙인다', () => {
    const base = resolvePromptText(0, '서연');
    const got = appendUnclassifiedEvidence(base, 5);
    expect(got.startsWith(base)).toBe(true);
    expect(got).toContain('미분류 근거 5건');
  });

  it('★점수판이 되지 않는다 — 비율·순위·총점 표기가 없다', () => {
    const got = unclassifiedEvidenceSuffix(7);
    expect(got).not.toMatch(/%|\/|점|등|위\b/);
  });
});

describe('죽은 코드가 아니다 — 스케줄러가 실제로 부른다', () => {
  it('useReminderScheduler 가 appendUnclassifiedEvidence 를 부른다', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/adapters/hooks/useReminderScheduler.ts'),
      'utf-8',
    );
    expect(src).toContain('appendUnclassifiedEvidence');
    // 담임·수업반 두 경로 모두에 붙어야 한다(한쪽만 붙으면 조용히 반쪽이 된다).
    expect(src.split('appendUnclassifiedEvidence').length - 1).toBeGreaterThanOrEqual(3);
  });

  it('★선정 로직은 건드리지 않았다 — pickDueStudents 호출이 그대로다', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/adapters/hooks/useReminderScheduler.ts'),
      'utf-8',
    );
    // 미분류 건수가 후보 선정·필터에 쓰이면 "누구를 부를지"가 바뀐다(ADR-072 결정 6 위반).
    expect(src).not.toMatch(/pickDueStudents\([^)]*[Uu]nclassified/);
    expect(src).not.toMatch(/filter\([^)]*countUnclassified/);
  });
});
