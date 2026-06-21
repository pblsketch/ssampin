import { describe, it, expect } from 'vitest';
import {
  neisByteLength,
  resolveAreaLimit,
  isAreaLimitVerified,
  isAuthorAllowedForArea,
  areasForContext,
  isRecordArea,
  homeroomStudentRef,
  teachingStudentRef,
  RECORD_AREA_LABELS,
} from '../RecordDraft';

describe('neisByteLength (브릿지 미러)', () => {
  it('한글 3B / 영문·숫자·공백·개행 1B', () => {
    expect(neisByteLength('')).toBe(0);
    expect(neisByteLength('abc')).toBe(3);
    expect(neisByteLength('가')).toBe(3);
    expect(neisByteLength('가나다')).toBe(9);
    expect(neisByteLength('가a1 \n')).toBe(3 + 1 + 1 + 1 + 1);
  });
  it('이모지(서로게이트 페어)는 1 코드포인트=3B', () => {
    expect(neisByteLength('😀')).toBe(3);
  });
});

describe('resolveAreaLimit / AREAS_BY_LEVEL', () => {
  it('진로 2,100 / 그 외 1,500 (고·중)', () => {
    expect(resolveAreaLimit('career', 'high')).toBe(2100);
    expect(resolveAreaLimit('career', 'middle')).toBe(2100);
    expect(resolveAreaLimit('autonomy', 'high')).toBe(1500);
    expect(resolveAreaLimit('subject', 'middle')).toBe(1500);
  });
  it('초등 subjectDev 존재 + 한도 미확인', () => {
    expect(resolveAreaLimit('subjectDev', 'elementary')).toBe(1500);
    expect(isAreaLimitVerified('subjectDev', 'elementary')).toBe(false);
    expect(isAreaLimitVerified('career', 'high')).toBe(true);
  });
  it('unknown level/area 는 throw', () => {
    expect(() => resolveAreaLimit('subject', 'elementary')).toThrow();
    expect(() => resolveAreaLimit('individualSubject', 'elementary')).toThrow();
  });
});

describe('작성주체 결속 / 영역집합', () => {
  it('isAuthorAllowedForArea', () => {
    expect(isAuthorAllowedForArea('career', 'high', 'homeroom')).toBe(true);
    expect(isAuthorAllowedForArea('career', 'high', 'teaching')).toBe(false);
    expect(isAuthorAllowedForArea('subject', 'high', 'teaching')).toBe(true);
    expect(isAuthorAllowedForArea('subjectDev', 'elementary', 'homeroom')).toBe(true);
    expect(isAuthorAllowedForArea('subjectDev', 'elementary', 'teaching')).toBe(true);
  });
  it('areasForContext — 담임/교과 분리, 초등 분기', () => {
    expect(areasForContext('high', 'homeroom')).toEqual(['autonomy', 'career', 'behavior']);
    expect(areasForContext('high', 'teaching')).toEqual(['subject', 'individualSubject', 'club']);
    const elem = areasForContext('elementary', 'homeroom');
    expect(elem).toContain('subjectDev');
    expect(elem).not.toContain('subject');
  });
});

describe('studentRef 헬퍼 (브릿지 identity 미러)', () => {
  it('담임=Student.id, 수업반=tc:{classId}:{studentKey}', () => {
    expect(homeroomStudentRef('stu-1')).toBe('stu-1');
    expect(teachingStudentRef('c1', '3-2-5')).toBe('tc:c1:3-2-5');
  });
});

describe('isRecordArea / 라벨', () => {
  it('7 영역 + subjectDev 라벨', () => {
    expect(isRecordArea('subjectDev')).toBe(true);
    expect(isRecordArea('nope')).toBe(false);
    expect(RECORD_AREA_LABELS.career).toBe('진로활동');
    expect(RECORD_AREA_LABELS.subjectDev).toBe('교과학습발달상황');
  });
});
