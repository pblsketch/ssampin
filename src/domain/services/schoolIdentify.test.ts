import { describe, it, expect } from 'vitest';
import {
  identifySchoolForDisclosure,
  identifyFromAddressKind,
  isSameSchoolName,
} from './schoolIdentify';

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
      identifySchoolForDisclosure({
        address: '서울특별시 강남구',
        schoolLevel: 'custom',
        schoolName: 'X',
      }),
    ).toBeNull();
  });

  it('주소 토큰 부족 시 null', () => {
    expect(
      identifySchoolForDisclosure({
        address: '서울특별시',
        schoolLevel: 'middle',
        schoolName: 'X',
      }),
    ).toBeNull();
  });

  it('학교명 비면 null', () => {
    expect(
      identifySchoolForDisclosure({
        address: '서울특별시 강남구',
        schoolLevel: 'middle',
        schoolName: '  ',
      }),
    ).toBeNull();
  });
});

describe('identifyFromAddressKind (다른 학교 검색)', () => {
  it('주소 + 학교급명 + 학교명 → 코드 도출', () => {
    const r = identifyFromAddressKind({
      address: '충청남도 아산시 온천대로 1413',
      kindName: '고등학교',
      schoolName: '온양여자고등학교',
    });
    expect(r).not.toBeNull();
    expect(r!.schulKndCode).toBe('04');
    expect(r!.sggList).toEqual([{ name: '아산시', code: '44200' }]);
    expect(r!.schoolName).toBe('온양여자고등학교');
  });
  it('알 수 없는 학교급명은 null', () => {
    expect(
      identifyFromAddressKind({
        address: '서울특별시 강남구',
        kindName: '대학교',
        schoolName: 'X',
      }),
    ).toBeNull();
  });
  it('주소 파싱 실패 시 null', () => {
    expect(
      identifyFromAddressKind({ address: '서울특별시', kindName: '중학교', schoolName: 'X' }),
    ).toBeNull();
  });
});

describe('isSameSchoolName', () => {
  it('공백 무시 비교', () => {
    expect(isSameSchoolName('개포 중학교', '개포중학교')).toBe(true);
    expect(isSameSchoolName('개포중', '개포중학교')).toBe(false);
  });
  it('괄호 지역 부가정보 무시 (설정 학교명 ↔ 공시 SCHUL_NM)', () => {
    expect(isSameSchoolName('온양여자고등학교', '온양여자고등학교 (충청남도 아산시)')).toBe(true);
  });
});
