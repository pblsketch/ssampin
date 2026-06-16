import { describe, it, expect } from 'vitest';
import { identifySchoolForDisclosure, isSameSchoolName } from './schoolIdentify';

describe('identifySchoolForDisclosure', () => {
  it('서울 강남구 중학교 → 코드 도출', () => {
    const r = identifySchoolForDisclosure({
      address: '서울특별시 강남구 선릉로 9',
      schoolLevel: 'middle',
      schoolName: '개포중학교',
    });
    expect(r).not.toBeNull();
    expect(r!.sidoCode).toBe('11');
    expect(r!.schulKndCode).toBe('03');
    expect(r!.schoolName).toBe('개포중학교');
    expect(r!.sggList).toEqual([{ name: '강남구', code: '11680' }]);
  });

  it('경기 성남시 분당구 → 분당구 단일 해석(2-depth)', () => {
    const r = identifySchoolForDisclosure({
      address: '경기도 성남시 분당구 불정로 90',
      schoolLevel: 'high',
      schoolName: '○○고등학교',
    });
    expect(r).not.toBeNull();
    expect(r!.schulKndCode).toBe('04');
    expect(r!.sggList).toEqual([{ name: '성남시 분당구', code: '41135' }]);
  });

  it('custom 학교급은 null', () => {
    expect(
      identifySchoolForDisclosure({ address: '서울특별시 강남구', schoolLevel: 'custom', schoolName: 'X' }),
    ).toBeNull();
  });

  it('주소 토큰 부족 시 null', () => {
    expect(
      identifySchoolForDisclosure({ address: '서울특별시', schoolLevel: 'middle', schoolName: 'X' }),
    ).toBeNull();
  });

  it('학교명 비면 null', () => {
    expect(
      identifySchoolForDisclosure({ address: '서울특별시 강남구', schoolLevel: 'middle', schoolName: '  ' }),
    ).toBeNull();
  });
});

describe('isSameSchoolName', () => {
  it('공백 무시 비교', () => {
    expect(isSameSchoolName('개포 중학교', '개포중학교')).toBe(true);
    expect(isSameSchoolName('개포중', '개포중학교')).toBe(false);
  });
});
