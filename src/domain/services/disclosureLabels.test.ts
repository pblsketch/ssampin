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
});

describe('labelizeRow', () => {
  it('라벨 매핑된 컬럼만 [라벨,값] 쌍으로, 코드성/빈값 제외', () => {
    const row = {
      SCHUL_NM: '개포중학교',
      SCHUL_CODE: 'S010000699', // 코드성 → 제외
      EMPTY_COL: '', // 빈값 → 제외
      __UNLABELED__: '값있음', // 라벨 없음 → 기본 제외
    };
    const pairs = labelizeRow('0', row);
    expect(pairs).toContainEqual({ label: '학교명', value: '개포중학교' });
    expect(pairs.some((p) => p.value === 'S010000699')).toBe(false);
    expect(pairs.some((p) => p.label === 'EMPTY_COL')).toBe(false);
    expect(pairs.some((p) => p.label === '__UNLABELED__')).toBe(false);
  });
  it('includeUnlabeled=true면 라벨 없는 컬럼도 포함', () => {
    const pairs = labelizeRow('0', { __X__: '1' }, { includeUnlabeled: true });
    expect(pairs).toContainEqual({ label: '__X__', value: '1' });
  });
});
