/**
 * 개인정보 탐지 공격 테스트 (UltraQA).
 *
 * 여기서 인덱스가 하나만 어긋나도 **엉뚱한 글자가 가려지거나, 가려야 할 게 남는다.**
 * 학생 이름이 든 쪽지를 다루므로 후자가 특히 위험하다.
 */
import { describe, it, expect } from 'vitest';
import { detectCoolPii, maskCoolPii, COOL_MASK } from '@domain/privacy/coolMessagePii';

describe('span 정합성 — 인덱스가 어긋나면 엉뚱한 글자가 가려진다', () => {
  const SAMPLES = [
    '김철수 학생 010-1234-5678 상담',
    '이영희 선생님께 전달 (a@b.com)',
    '990101-1234567 · 박민수 학부모님 · 031)123-4567',
    '김철수김철수 학생',
    '학생 학생 학생',
    '',
    '   ',
  ];

  it('모든 span이 원문 범위 안에 있고 text와 정확히 일치한다', () => {
    for (const s of SAMPLES) {
      for (const span of detectCoolPii(s, new Set(['김철수', '이영희']))) {
        expect(span.start).toBeGreaterThanOrEqual(0);
        expect(span.end).toBeLessThanOrEqual(s.length);
        expect(span.start).toBeLessThan(span.end);
        expect(s.slice(span.start, span.end)).toBe(span.text);
      }
    }
  });

  it('span끼리 절대 겹치지 않는다', () => {
    for (const s of SAMPLES) {
      const spans = detectCoolPii(s, new Set(['김철수', '이영희', '민수']));
      for (let i = 1; i < spans.length; i += 1) {
        expect(spans[i]!.start).toBeGreaterThanOrEqual(spans[i - 1]!.end);
      }
    }
  });

  it('가린 뒤에도 가리지 않은 글자는 그대로 남는다', () => {
    const out = maskCoolPii('김철수 학생 상담은 3층에서', undefined, new Set(['김철수']));
    expect(out).toContain('학생 상담은 3층에서');
    expect(out).not.toContain('김철수');
  });
});

describe('명렬 이름이 이상할 때', () => {
  it('★ 공백뿐인 이름이 명렬에 있어도 본문 공백을 가리지 않는다', () => {
    // 한글 사이 공백은 단어 경계 규칙에 우연히 막히지만, 영문·숫자 사이는 안 막힌다.
    // 두 경우를 모두 확인해야 진짜로 막혔는지 알 수 있다.
    expect(maskCoolPii('회의  안내  드립니다', undefined, new Set(['  ']))).toBe(
      '회의  안내  드립니다',
    );
    expect(maskCoolPii('AB  CD', undefined, new Set(['  ']))).toBe('AB  CD');
    expect(maskCoolPii('AB\t\tCD', undefined, new Set(['\t\t']))).toBe('AB\t\tCD');
  });

  it('정규식 특수문자가 든 이름도 안전하게 처리한다', () => {
    expect(() => detectCoolPii('a.c 안내', new Set(['a.c', '(', '[a-z]', '*']))).not.toThrow();
    // 'a.c'는 글자 그대로만 잡혀야 한다 — 정규식 '.'로 해석되면 'abc'도 잡힌다
    expect(maskCoolPii('abc 안내', undefined, new Set(['a.c']))).toBe('abc 안내');
  });

  it('같은 이름이 여러 번 나오면 전부 가린다', () => {
    const out = maskCoolPii('김철수, 김철수, 김철수', undefined, new Set(['김철수']));
    expect(out).toBe(`${COOL_MASK}, ${COOL_MASK}, ${COOL_MASK}`);
  });

  it('빈 명렬이어도 호칭 탐지는 그대로 동작한다', () => {
    expect(maskCoolPii('김철수 학생', undefined, new Set())).toBe(`${COOL_MASK} 학생`);
  });
});

describe('큰 입력', () => {
  it('긴 본문 + 명렬 100명이어도 끝난다', () => {
    const roster = new Set(
      Array.from({ length: 100 }, (_, i) => `학생${String(i).padStart(2, '0')}`),
    );
    const body = '안내드립니다. 김철수 학생 010-1234-5678. '.repeat(500);
    const spans = detectCoolPii(body, roster);
    expect(spans.length).toBeGreaterThan(0);
  });
});

describe('★ 자동으로 지우지 않는다 (핵심 계약)', () => {
  it('detect는 원문을 바꾸지 않는다', () => {
    const original = '김철수 학생 010-1234-5678';
    const copy = original;
    detectCoolPii(original, new Set(['김철수']));
    expect(original).toBe(copy);
  });

  it('mask는 새 문자열을 돌려줄 뿐 원본 변수는 그대로다', () => {
    const original = '김철수 학생';
    const masked = maskCoolPii(original, undefined, new Set(['김철수']));
    expect(original).toBe('김철수 학생');
    expect(masked).not.toBe(original);
  });
});
