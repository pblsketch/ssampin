import { describe, it, expect } from 'vitest';
import { isEndBeforeStart, isOutsideSchoolYear } from '../termDateInput';

describe('isEndBeforeStart — 끝이 시작보다 앞서는 입력', () => {
  it('끝이 시작보다 앞서면 잘못된 입력이다', () => {
    expect(isEndBeforeStart('2026-09-01', '2026-08-01')).toBe(true);
  });

  it('같은 날은 잘못된 입력이 아니다 — 하루짜리 학기도 산술적으로는 성립한다', () => {
    expect(isEndBeforeStart('2026-12-31', '2026-12-31')).toBe(false);
  });

  it('정상 순서는 통과한다', () => {
    expect(isEndBeforeStart('2026-08-18', '2026-12-31')).toBe(false);
  });

  it('한쪽이 비어 있으면 판단하지 않는다 — 아직 안 넣은 것과 잘못 넣은 것은 다르다', () => {
    expect(isEndBeforeStart('', '2026-08-01')).toBe(false);
    expect(isEndBeforeStart('2026-09-01', '')).toBe(false);
    expect(isEndBeforeStart('', '')).toBe(false);
  });
});

describe('isOutsideSchoolYear — 학년도 범위 밖 날짜', () => {
  it('2026학년도는 2026-03-01부터 2027-02-28까지다', () => {
    expect(isOutsideSchoolYear('2026-03-01', 2026)).toBe(false);
    expect(isOutsideSchoolYear('2027-02-28', 2026)).toBe(false);
    expect(isOutsideSchoolYear('2026-02-28', 2026)).toBe(true);
    expect(isOutsideSchoolYear('2027-03-01', 2026)).toBe(true);
  });

  it('학기 끝에 흔한 날짜들을 잘못 잡지 않는다', () => {
    // 1학기 여름방학식·2학기 겨울방학식·2월 종업식 — 전부 그 학년도 안이다.
    expect(isOutsideSchoolYear('2026-07-18', 2026)).toBe(false);
    expect(isOutsideSchoolYear('2026-12-31', 2026)).toBe(false);
    expect(isOutsideSchoolYear('2027-02-15', 2026)).toBe(false);
  });

  it('빈 값은 잘못된 입력이 아니다', () => {
    expect(isOutsideSchoolYear('', 2026)).toBe(false);
  });
});
