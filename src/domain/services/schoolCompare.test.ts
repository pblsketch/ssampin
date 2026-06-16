import { describe, it, expect } from 'vitest';
import { buildSchoolComparison } from './schoolCompare';

const rows = [
  {
    SCHUL_NM: '대청중학교',
    COL_S_SUM: '800',
    COL_C_SUM: '30',
    COL_SUM: '26.7',
    TEACH_CNT: '50',
    TEACH_CAL: '16.0',
  },
  {
    SCHUL_NM: '개포중학교',
    COL_S_SUM: '1,090',
    COL_C_SUM: '37',
    COL_SUM: '29.5',
    TEACH_CNT: '63',
    TEACH_CAL: '17.3',
  },
  { SCHUL_NM: '', COL_S_SUM: '0' }, // 빈 학교명 → 제외
];

describe('buildSchoolComparison', () => {
  it('우리 학교 표시 + 콤마 포함 숫자 파싱 + 학생수 내림차순', () => {
    const r = buildSchoolComparison(rows, '개포중학교');
    expect(r).toHaveLength(2);
    expect(r[0]!.schoolName).toBe('개포중학교'); // 1090 > 800
    expect(r[0]!.isOurs).toBe(true);
    expect(r[0]!.studentsTotal).toBe(1090);
    expect(r[0]!.studentsPerClass).toBe(29.5);
    expect(r[1]!.schoolName).toBe('대청중학교');
    expect(r[1]!.isOurs).toBe(false);
  });

  it('숫자가 아닌 값은 null', () => {
    const r = buildSchoolComparison([{ SCHUL_NM: 'A', COL_S_SUM: '-' }], 'A');
    expect(r[0]!.studentsTotal).toBeNull();
  });
});
