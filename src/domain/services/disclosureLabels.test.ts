import { describe, it, expect } from 'vitest';
import { disclosureLabel, labelizeRow } from './disclosureLabels';

describe('disclosureLabel', () => {
  it('학교기본정보 SCHUL_NM → 학교명', () => {
    expect(disclosureLabel('0', 'SCHUL_NM')).toBe('학교명');
  });
  it('매핑 없는 컬럼은 ID 그대로(폴백)', () => {
    expect(disclosureLabel('0', '__NOPE__')).toBe('__NOPE__');
  });
  it('알 수 없는 apiType도 컬럼ID 폴백', () => {
    expect(disclosureLabel('999', 'ANY')).toBe('ANY');
  });
  it('학교급 접두어를 떼어 학교급 무관 라벨로 (고등학교에 "초등부" 오표기 방지)', () => {
    expect(disclosureLabel('62', 'COL_1')).toBe('1학년');
    expect(disclosureLabel('62', 'COL_7')).toBe('특수');
    expect(disclosureLabel('62', 'COL_8')).toBe('순회');
    expect(disclosureLabel('09', 'COL_S1')).toBe('1학년 학생수');
  });
});

describe('labelizeRow', () => {
  it('공통 메타·코드성·빈값·라벨없음 컬럼 제외 (실제 내용만)', () => {
    const row = {
      COL_1: '11', // 22 직위별: 교장(계) — 실제 내용
      SCHUL_NM: '개포중학교', // 공통 메타 → 제외
      ADRCD_NM: '서울특별시 강남구', // 공통 메타 → 제외
      SCHUL_CODE: 'S010000699', // 코드성 → 제외
      EMPTY_COL: '', // 빈값 → 제외
      __UNLABELED__: '값있음', // 라벨 없음 → 기본 제외
    };
    const pairs = labelizeRow('22', row);
    expect(pairs).toContainEqual({ label: '교장(계)', value: '11' });
    expect(pairs.some((p) => p.label === '학교명')).toBe(false);
    expect(pairs.some((p) => p.label === '지역')).toBe(false);
    expect(pairs.some((p) => p.value === 'S010000699')).toBe(false);
    expect(pairs.some((p) => p.label === 'EMPTY_COL')).toBe(false);
    expect(pairs.some((p) => p.label === '__UNLABELED__')).toBe(false);
  });
  it('includeUnlabeled=true면 라벨 없는 컬럼도 포함', () => {
    const pairs = labelizeRow('0', { __X__: '1' }, { includeUnlabeled: true });
    expect(pairs).toContainEqual({ label: '__X__', value: '1' });
  });
  it('hideZero=true면 순수 0 값은 숨기되 "N(M)"·실수치는 유지', () => {
    // 22(직위별 교원): 교장(계) COL_1, 교감(계) COL_2
    const row = { COL_1: '1', COL_2: '0', COL_8: '0명', COL_4: '47' };
    const pairs = labelizeRow('22', row, { hideZero: true });
    const labels = pairs.map((p) => p.label);
    expect(labels).toContain('교장(계)');
    expect(labels).toContain('일반교사(계)');
    expect(pairs.some((p) => p.value === '0')).toBe(false);
    expect(pairs.some((p) => p.value === '0명')).toBe(false);
  });
});
