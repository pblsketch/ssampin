import { describe, it, expect } from 'vitest';
import { matchSchool, type SchoolMatchCandidate } from '@domain/services/schoolMatch';

const HANUL_GANGNAM: SchoolMatchCandidate = {
  shlIdfCd: 'A1',
  name: '한울중학교',
  address: '서울특별시 강남구 도곡로 1',
};
const HANUL_NOWON: SchoolMatchCandidate = {
  shlIdfCd: 'B2',
  name: '한울중학교',
  address: '서울특별시 노원구 동일로 100',
};

describe('matchSchool — NEIS ↔ 학교알리미', () => {
  it('이름 유일 일치 → 확정', () => {
    const r = matchSchool({ neisName: '한울중학교', neisAddress: '서울특별시 강남구 도곡로 1' }, [
      HANUL_GANGNAM,
      { shlIdfCd: 'C3', name: '다른중학교', address: '부산광역시 …' },
    ]);
    expect(r.best?.shlIdfCd).toBe('A1');
    expect(r.ambiguous).toEqual([]);
  });

  it('공백 차이는 무시하고 일치시킨다(한울 중학교 ↔ 한울중학교)', () => {
    const r = matchSchool({ neisName: '한울 중학교', neisAddress: '서울특별시 강남구 도곡로 1' }, [
      HANUL_GANGNAM,
    ]);
    expect(r.best?.shlIdfCd).toBe('A1');
  });

  it('동명이교: 주소 앞 토큰(구)으로 가른다 [AC4]', () => {
    const r = matchSchool({ neisName: '한울중학교', neisAddress: '서울특별시 노원구 동일로 55' }, [
      HANUL_GANGNAM,
      HANUL_NOWON,
    ]);
    expect(r.best?.shlIdfCd).toBe('B2'); // 노원구 일치
    expect(r.ambiguous).toEqual([]);
  });

  it('동명이교인데 주소로도 못 가르면 모호(best=null, 후보 반환)', () => {
    // 두 후보 모두 시/도만 같고 구가 NEIS 주소와 다름 → 동점(1점)
    const r = matchSchool({ neisName: '한울중학교', neisAddress: '서울특별시 송파구 …' }, [
      HANUL_GANGNAM,
      HANUL_NOWON,
    ]);
    expect(r.best).toBeNull();
    expect(r.ambiguous.map((c) => c.shlIdfCd)).toEqual(['A1', 'B2']);
  });

  it('접미사 차이(한울중 ↔ 한울중학교)는 포함 폴백으로 매칭', () => {
    const r = matchSchool({ neisName: '한울중', neisAddress: '서울특별시 강남구 도곡로 1' }, [
      HANUL_GANGNAM,
    ]);
    expect(r.best?.shlIdfCd).toBe('A1');
  });

  it('일치 후보 없음 → best=null, 후보 없음', () => {
    const r = matchSchool({ neisName: '없는학교', neisAddress: '서울특별시 강남구' }, [
      HANUL_GANGNAM,
    ]);
    expect(r).toEqual({ best: null, ambiguous: [] });
  });

  it('빈 입력/빈 결과는 안전하게 null', () => {
    expect(matchSchool({ neisName: '', neisAddress: '' }, [HANUL_GANGNAM])).toEqual({
      best: null,
      ambiguous: [],
    });
    expect(matchSchool({ neisName: '한울중학교', neisAddress: '서울' }, [])).toEqual({
      best: null,
      ambiguous: [],
    });
  });

  it('시/도가 다르면 주소 점수 0 — 동명이교 동점이면 모호', () => {
    const busanHanul: SchoolMatchCandidate = {
      shlIdfCd: 'D4',
      name: '한울중학교',
      address: '부산광역시 해운대구 …',
    };
    const r = matchSchool({ neisName: '한울중학교', neisAddress: '대전광역시 서구 …' }, [
      HANUL_GANGNAM,
      busanHanul,
    ]);
    expect(r.best).toBeNull();
    expect(r.ambiguous).toHaveLength(2);
  });
});
