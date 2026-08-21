/**
 * 쿨메신저 쪽지 개인정보 탐지 테스트.
 *
 * 원본 `coolm-helper/tests/test_pii_detector.py` 전량 + 쌤핀에서 새로 막은 함정.
 */
import { describe, it, expect } from 'vitest';
import { detectCoolPii, maskCoolPii } from '@domain/privacy/coolMessagePii';

describe('전화번호', () => {
  it('휴대폰 번호를 가린다', () => {
    expect(maskCoolPii('연락처 010-1234-5678 입니다')).toBe('연락처 ○○○ 입니다');
  });

  it('★ 교무실 괄호 표기 031)123-4567도 잡는다', () => {
    const spans = detectCoolPii('교무실 031)123-4567');
    expect(spans[0]?.kind).toBe('phone');
    expect(spans[0]?.text).toBe('031)123-4567');
  });

  it('★ 일정 날짜를 전화번호로 오인하지 않는다', () => {
    expect(detectCoolPii('2026-07-21 회의')).toEqual([]);
  });
});

describe('주민등록번호', () => {
  it('전체 표기를 잡는다', () => {
    const spans = detectCoolPii('주민번호 990101-1234567');
    expect(spans[0]?.kind).toBe('rrn');
  });

  it('★ 일부만 가려진 990101-1******도 잡는다 (앞 7자리도 개인정보다)', () => {
    const spans = detectCoolPii('990101-1******');
    expect(spans[0]?.kind).toBe('rrn');
  });
});

describe('호칭으로 이름 찾기', () => {
  it('이름만 가리고 호칭은 남긴다', () => {
    expect(maskCoolPii('김철수 학생 상담')).toBe('○○○ 학생 상담');
  });

  it('조사가 붙어도 찾는다', () => {
    expect(maskCoolPii('박영수님께 전달')).toBe('○○○님께 전달');
  });

  it('★ "선생님들께"의 "선생"을 사람 이름으로 잡지 않는다', () => {
    expect(maskCoolPii('선생님들께 안내드립니다')).toBe('선생님들께 안내드립니다');
  });

  it('★ "학부모님 대상"의 "학부모"를 사람 이름으로 잡지 않는다', () => {
    expect(maskCoolPii('학부모님 대상 연수')).toBe('학부모님 대상 연수');
  });

  it('★ "위기학생"의 "위기"를 사람 이름으로 잡지 않는다', () => {
    expect(maskCoolPii('위기학생 명단 제출')).toBe('위기학생 명단 제출');
  });

  it('★ "전입학생"의 "전입"을 사람 이름으로 잡지 않는다', () => {
    expect(maskCoolPii('전입학생 안내')).toBe('전입학생 안내');
  });
});

describe('명렬 대조', () => {
  const ROSTER = new Set(['김철수', '이영희']);

  it('명렬에 있는 이름을 가린다 (호칭이 없어도)', () => {
    expect(maskCoolPii('김철수, 이영희 참석', undefined, ROSTER)).toBe('○○○, ○○○ 참석');
  });

  it('명렬과 호칭이 겹쳐도 한 번만 가린다', () => {
    expect(maskCoolPii('김철수 학생 학폭위', undefined, ROSTER)).toBe('○○○ 학생 학폭위');
  });

  it('★ 다른 낱말 속에 우연히 든 이름은 잡지 않는다 ("이수" vs "이수 기준")', () => {
    const roster = new Set(['이수']);
    expect(maskCoolPii('이수단위 기준 안내', undefined, roster)).toBe('이수단위 기준 안내');
  });

  it('한 글자 이름은 무시한다 (오탐이 너무 많다)', () => {
    expect(detectCoolPii('가 나 다', new Set(['가']))).toEqual([]);
  });
});

describe('실제 쪽지 형태 (원본 PRD 예시)', () => {
  const TEXT =
    '3학년 김철수 학생 학폭위 심의가 7월 21일(화) 14시에 열립니다. ' +
    '담당: 이영희 선생님(010-1234-5678)';

  it('이름·전화번호는 가리고 날짜와 용건은 남긴다', () => {
    const out = maskCoolPii(TEXT, undefined, new Set(['김철수']));
    expect(out).not.toContain('김철수');
    expect(out).not.toContain('이영희');
    expect(out).not.toContain('010-1234-5678');
    expect(out).toContain('학폭위');
    expect(out).toContain('7월 21일'); // ★ 날짜는 반드시 남아야 한다 — 이 기능의 존재 이유다
    expect(out).toContain('14시');
  });

  it('탐지만 하고 원문은 바꾸지 않는다 (형광펜이지 필터가 아니다)', () => {
    const spans = detectCoolPii(TEXT, new Set(['김철수']));
    expect(spans.length).toBeGreaterThan(0);
    // detect 는 위치만 돌려준다 — 지울지는 사용자가 정한다
    for (const s of spans) {
      expect(TEXT.slice(s.start, s.end)).toBe(s.text);
    }
  });

  it('구간이 서로 겹치지 않는다', () => {
    const spans = detectCoolPii(TEXT, new Set(['김철수']));
    for (let i = 1; i < spans.length; i += 1) {
      expect(spans[i]!.start).toBeGreaterThanOrEqual(spans[i - 1]!.end);
    }
  });
});
