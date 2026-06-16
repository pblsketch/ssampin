import { describe, it, expect } from 'vitest';
import { resolveSido, resolveSggList, SCHOOL_KIND, SCHOOL_KIND_REV, API_TYPES } from './schoolinfoCodes';

describe('resolveSido', () => {
  it('정식 명칭을 그대로 해석', () => {
    expect(resolveSido('서울특별시')).toEqual({ name: '서울특별시', code: '11' });
  });
  it('약칭(서울)을 정식 명칭으로', () => {
    expect(resolveSido('서울')).toEqual({ name: '서울특별시', code: '11' });
  });
  it('구 명칭(강원도)을 신 명칭으로', () => {
    expect(resolveSido('강원도')?.name).toBe('강원특별자치도');
  });
  it('알 수 없는 시도는 null', () => {
    expect(resolveSido('없는시도')).toBeNull();
  });
  it('빈 입력은 null', () => {
    expect(resolveSido('   ')).toBeNull();
  });
});

describe('resolveSggList', () => {
  it('정확한 자치구(강남구)', () => {
    expect(resolveSggList('서울특별시', '강남구')).toEqual([{ name: '강남구', code: '11680' }]);
  });
  it('약칭(강남 → 강남구)', () => {
    expect(resolveSggList('서울특별시', '강남')).toEqual([{ name: '강남구', code: '11680' }]);
  });
  it('자치구를 가진 시(성남시)는 하위 구를 합산', () => {
    const r = resolveSggList('경기도', '성남시');
    expect(r.length).toBeGreaterThan(1);
    expect(r.some((x) => x.name === '성남시 분당구')).toBe(true);
  });
  it('없는 시군구는 빈 배열', () => {
    expect(resolveSggList('서울특별시', '없는구')).toEqual([]);
  });
  it('없는 시도는 빈 배열', () => {
    expect(resolveSggList('없는시도', '강남구')).toEqual([]);
  });
});

describe('SCHOOL_KIND', () => {
  it('중학교 코드 03', () => {
    expect(SCHOOL_KIND.중학교).toBe('03');
  });
  it('역매핑 03 → 중학교', () => {
    expect(SCHOOL_KIND_REV['03']).toBe('중학교');
  });
});

describe('API_TYPES', () => {
  it('주요 공시 항목명 매핑', () => {
    expect(API_TYPES['09']).toContain('학생수');
    expect(API_TYPES['56']).toContain('동아리');
    expect(API_TYPES['61']).toContain('상담');
  });
});
