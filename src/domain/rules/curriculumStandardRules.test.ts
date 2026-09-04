import { describe, expect, it } from 'vitest';
import type { CurriculumStandard } from '../data/curriculumStandards.types';
import {
  domainsOf,
  firstYearOf2022Revision,
  gradeBandsFor,
  indexByCode,
  inferClassGrade,
  isRevision2022Applied,
  looksLikeStandardCode,
  narrowStandards,
  normalizeStandardCode,
  searchStandards,
  standardKeywords,
  standardsForCodes,
  subjectMatches,
} from './curriculumStandardRules';

function std(p: Partial<CurriculumStandard> & { code: string }): CurriculumStandard {
  return {
    text: '',
    keywords: [],
    subject: '수학',
    subjectGroup: '수학',
    domain: '변화와 관계',
    gradeBand: '7-9',
    schoolLevel: 'middle',
    ...p,
  };
}

const SAMPLE: readonly CurriculumStandard[] = [
  std({
    code: '[9수02-15]',
    text: '일차함수의 개념을 이해하고, 그 그래프를 그릴 수 있다.',
    keywords: ['일차함수', '그래프'],
  }),
  std({ code: '[9수01-01]', domain: '수와 연산', keywords: ['소인수분해'] }),
  std({
    code: '[9국01-01]',
    subject: '국어',
    subjectGroup: '국어',
    domain: '듣기·말하기',
    keywords: ['대화'],
  }),
  std({
    code: '[10공수1-02-07]',
    subject: '공통수학1',
    gradeBand: '10',
    schoolLevel: 'high',
    keywords: ['방정식'],
  }),
  std({
    code: '[12경수01-01]',
    subject: '경제 수학',
    gradeBand: '10-12',
    schoolLevel: 'high',
    keywords: ['통계', '경제지표'],
  }),
  std({
    code: '[4수01-01]',
    gradeBand: '3-4',
    schoolLevel: 'elementary',
    keywords: ['자릿값'],
  }),
];

describe('2022 개정 적용 학년 판정', () => {
  // 교육부 고시 제2022-33호 부칙: 2024 초1·2 / 2025 초3·4·중1·고1 / 2026 초5·6·중2·고2 / 2027 중3·고3
  it('고시 부칙의 시행 일정을 그대로 따른다', () => {
    expect(firstYearOf2022Revision('elementary', 1)).toBe(2024);
    expect(firstYearOf2022Revision('elementary', 2)).toBe(2024);
    expect(firstYearOf2022Revision('elementary', 3)).toBe(2025);
    expect(firstYearOf2022Revision('elementary', 4)).toBe(2025);
    expect(firstYearOf2022Revision('elementary', 5)).toBe(2026);
    expect(firstYearOf2022Revision('elementary', 6)).toBe(2026);
    expect(firstYearOf2022Revision('middle', 1)).toBe(2025);
    expect(firstYearOf2022Revision('middle', 2)).toBe(2026);
    expect(firstYearOf2022Revision('middle', 3)).toBe(2027);
    expect(firstYearOf2022Revision('high', 1)).toBe(2025);
    expect(firstYearOf2022Revision('high', 3)).toBe(2027);
  });

  it('2026학년도에 중3·고3만 2015 개정으로 남는다 — 이 기능의 존재 이유다', () => {
    expect(isRevision2022Applied('middle', 3, 2026)).toBe(false);
    expect(isRevision2022Applied('high', 3, 2026)).toBe(false);
    expect(isRevision2022Applied('middle', 2, 2026)).toBe(true);
    expect(isRevision2022Applied('high', 1, 2026)).toBe(true);
    // 초등은 2026학년도에 전 학년이 적용된다
    expect(isRevision2022Applied('elementary', 6, 2026)).toBe(true);
  });

  it('2027학년도에는 전 학년이 2022 개정이다', () => {
    expect(isRevision2022Applied('middle', 3, 2027)).toBe(true);
    expect(isRevision2022Applied('high', 3, 2027)).toBe(true);
  });

  it('학년을 모르면 목록을 막지 않는다', () => {
    expect(isRevision2022Applied('high', null, 2026)).toBe(true);
    expect(isRevision2022Applied('high', undefined, 2026)).toBe(true);
  });

  it('있을 수 없는 학년에는 판정을 만들어 내지 않는다', () => {
    expect(firstYearOf2022Revision('elementary', 7)).toBeNull();
    expect(firstYearOf2022Revision('middle', 4)).toBeNull();
    expect(firstYearOf2022Revision('high', 0)).toBeNull();
  });
});

describe('학년군', () => {
  it('고교는 공통(10)과 선택(10-12)을 함께 준다 — 고2가 공통국어2를 가르치는 일이 있다', () => {
    expect(gradeBandsFor('high', 2)).toEqual(['10', '10-12']);
  });

  it('초등은 학년에 따라 갈린다', () => {
    expect(gradeBandsFor('elementary', 1)).toEqual(['1-2']);
    expect(gradeBandsFor('elementary', 4)).toEqual(['3-4']);
    expect(gradeBandsFor('elementary', 6)).toEqual(['5-6']);
  });
});

describe('과목 맞추기', () => {
  it('수업반 이름이 자유 문자열이어도 같은 과목을 찾아낸다', () => {
    expect(subjectMatches('수학', '수학')).toBe(true);
    expect(subjectMatches('공통수학1', '공통수학1')).toBe(true);
    expect(subjectMatches('수학', '공통수학1')).toBe(true);
  });

  it('가운뎃점 모양이 달라도 같게 본다', () => {
    expect(subjectMatches('기술·가정', '기술⋅가정')).toBe(true);
  });

  it('괄호 안 설명은 무시한다', () => {
    expect(subjectMatches('과학(3반)', '과학')).toBe(true);
  });

  it('한 글자짜리가 아무 데나 걸리지 않는다', () => {
    expect(subjectMatches('수', '수학')).toBe(false);
  });

  it('다른 과목은 안 걸린다', () => {
    expect(subjectMatches('국어', '수학')).toBe(false);
  });
});

describe('목록 좁히기', () => {
  it('학교급으로 세게 거른다', () => {
    const got = narrowStandards(SAMPLE, { schoolLevel: 'elementary' });
    expect(got.map((s) => s.code)).toEqual(['[4수01-01]']);
  });

  it('과목이 맞으면 그것만 남긴다', () => {
    const got = narrowStandards(SAMPLE, { schoolLevel: 'middle', subject: '국어' });
    expect(got.map((s) => s.code)).toEqual(['[9국01-01]']);
  });

  it('과목 이름이 특이해 하나도 안 맞으면 막지 않고 전부 준다', () => {
    const got = narrowStandards(SAMPLE, { schoolLevel: 'middle', subject: '창의융합탐구' });
    expect(got).toHaveLength(3);
  });

  it('학년군은 지우지 않고 앞으로 올리기만 한다', () => {
    // 고1 → 공통(10)이 앞, 선택(10-12)이 뒤. 둘 다 남아 있어야 한다.
    const got = narrowStandards(SAMPLE, { schoolLevel: 'high', grade: 1 });
    expect(got).toHaveLength(2);
    expect(got[0]?.code).toBe('[10공수1-02-07]');
  });
});

describe('찾기', () => {
  it('원문·키워드·영역 어디에 있어도 찾는다', () => {
    expect(searchStandards(SAMPLE, '일차함수').map((s) => s.code)).toEqual(['[9수02-15]']);
    expect(searchStandards(SAMPLE, '수와 연산').map((s) => s.code)).toEqual(['[9수01-01]']);
    expect(searchStandards(SAMPLE, '경제지표').map((s) => s.code)).toEqual(['[12경수01-01]']);
  });

  it('코드로도 찾는다', () => {
    expect(searchStandards(SAMPLE, '9수02').map((s) => s.code)).toEqual(['[9수02-15]']);
  });

  it('빈 검색어는 목록을 그대로 준다', () => {
    expect(searchStandards(SAMPLE, '   ')).toHaveLength(SAMPLE.length);
  });

  it('부분 문자열 검사라 뜻이 같아도 말이 다르면 못 찾는다 — 찾기는 보조다', () => {
    expect(searchStandards(SAMPLE, '그래프 그리기')).toHaveLength(0);
  });
});

describe('영역 목록', () => {
  it('중복 없이 등장 순서대로 준다', () => {
    expect(domainsOf(SAMPLE)).toEqual(['변화와 관계', '수와 연산', '듣기·말하기']);
  });
});

describe('코드 다루기', () => {
  it('대괄호·공백이 있든 없든 같은 코드로 본다', () => {
    expect(normalizeStandardCode('[9수02-15]')).toBe('9수02-15');
    expect(normalizeStandardCode(' 9수02-15 ')).toBe('9수02-15');
  });

  it('성취기준 코드 모양을 알아본다', () => {
    expect(looksLikeStandardCode('[9수02-15]')).toBe(true);
    expect(looksLikeStandardCode('9수02-15')).toBe(true);
    expect(looksLikeStandardCode('[12경수01-01]')).toBe(true);
    expect(looksLikeStandardCode('[10공수1-02-07]')).toBe(true);
    expect(looksLikeStandardCode('그냥 적은 말')).toBe(false);
    expect(looksLikeStandardCode('')).toBe(false);
  });

  it('코드로 성취기준을 찾고, 없는 코드는 건너뛴다', () => {
    const index = indexByCode(SAMPLE);
    const got = standardsForCodes(index, ['9수02-15', '[없는코드01-01]']);
    expect(got.map((s) => s.code)).toEqual(['[9수02-15]']);
  });
});

describe('키워드만 내보내기', () => {
  const index = indexByCode(SAMPLE);

  it('연결된 성취기준의 키워드를 중복 없이 모은다', () => {
    expect(standardKeywords(index, ['[9수02-15]', '[9수01-01]'])).toEqual([
      '일차함수',
      '그래프',
      '소인수분해',
    ]);
  });

  it('코드가 없으면 빈 배열이다', () => {
    expect(standardKeywords(index, undefined)).toEqual([]);
    expect(standardKeywords(index, [])).toEqual([]);
  });

  it('🚨 원문은 절대 새어 나가지 않는다 — 키워드만 나간다', () => {
    // 이 검사가 이 기능의 핵심 약속이다. 원문을 AI 근거에 실으면 모델이 그대로 베껴 써서
    // "성취기준 복사형" 세특이 나온다(오너 결정 2026-09-04).
    const out = standardKeywords(index, ['[9수02-15]']);
    const joined = out.join(' ');
    expect(joined).not.toContain('이해하고');
    expect(joined).not.toContain('그릴 수 있다');
    expect(joined).not.toContain('개념을');
    expect(out).toEqual(['일차함수', '그래프']);
  });
});

describe('수업반 학년 알아내기', () => {
  it('명단에 적힌 학년을 가장 믿는다', () => {
    expect(inferClassGrade('심화반', [2, 2, 3])).toBe(2);
  });

  it('여러 학년이 섞이면 가장 많은 학년으로 본다', () => {
    expect(inferClassGrade('선택A', [1, 3, 3, 3, 2])).toBe(3);
  });

  it('명단에 학년이 없으면 반 이름에서 읽는다', () => {
    expect(inferClassGrade('2-5', [])).toBe(2);
    expect(inferClassGrade('3학년 1반', [])).toBe(3);
  });

  it('명단이 반 이름을 이긴다 — 이름은 관행일 뿐이다', () => {
    expect(inferClassGrade('2-5', [3, 3])).toBe(3);
  });

  it('알 수 없으면 null 이다 — 학년으로 좁히지 않는다는 뜻', () => {
    expect(inferClassGrade('방과후 논술', [])).toBeNull();
    expect(inferClassGrade('', [undefined])).toBeNull();
  });

  it('학년일 수 없는 숫자는 학년으로 읽지 않는다', () => {
    expect(inferClassGrade('9-1', [])).toBeNull();
  });
});
