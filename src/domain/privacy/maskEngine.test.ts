import { describe, it, expect } from 'vitest';
import { applyMask, restore } from './maskEngine';
import { detectPatterns } from './maskRules';
import type { MaskConfig, PatternConfig } from './types';

const ALL_PATTERNS: PatternConfig = {
  phone: true,
  rrn: true,
  email: true,
  birth: true,
  address: true,
};
const NO_PATTERNS: PatternConfig = {
  phone: false,
  rrn: false,
  email: false,
  birth: false,
  address: false,
};

function cfg(over?: Partial<MaskConfig>): MaskConfig {
  return { patterns: ALL_PATTERNS, keywordGroups: [], ...over };
}

describe('maskEngine — 자동 패턴', () => {
  it('전화번호를 가리고 복원한다', () => {
    const src = '연락처는 010-1234-5678 입니다';
    const { masked, mappings } = applyMask(src, cfg());
    expect(masked).toContain('［전화1］');
    expect(masked).not.toContain('010-1234-5678');
    expect(restore(masked, mappings)).toBe(src);
  });

  it('하이픈 없는 휴대폰 번호도 가린다', () => {
    const { masked } = applyMask('01012345678', cfg());
    expect(masked).toBe('［전화1］');
  });

  it('주민등록번호를 고신뢰로 가린다', () => {
    const { masked, mappings } = applyMask('주민번호 900101-1234567', cfg());
    expect(masked).toContain('［주민번호1］');
    expect(restore(masked, mappings)).toBe('주민번호 900101-1234567');
  });

  it('이메일을 가린다', () => {
    const { masked } = applyMask('메일 hong.gd@school.ac.kr 로', cfg());
    expect(masked).toBe('메일 ［이메일1］ 로');
  });

  it('생년월일(YYYY-MM-DD)을 가리고 복원한다', () => {
    const src = '생년월일: 2010-03-15';
    const { masked, mappings } = applyMask(src, cfg());
    expect(masked).toContain('［생년월일1］');
    expect(masked).not.toContain('2010-03-15');
    expect(restore(masked, mappings)).toBe(src);
  });

  it('생년월일 6자리(YYMMDD)도 가린다', () => {
    const { masked } = applyMask('생년월일 100315', cfg());
    expect(masked).toBe('생년월일 ［생년월일1］');
  });

  it('월/일이 유효하지 않은 6자리 숫자는 생년월일로 오탐하지 않는다', () => {
    // 34월은 존재하지 않음 → 매칭 안 됨
    const { masked } = applyMask('코드 123456', cfg());
    expect(masked).toBe('코드 123456');
  });

  it('주소는 저신뢰(low)이며 시/도부터 건물·동·호까지 가린다', () => {
    const addr = detectPatterns('서울특별시 강남구 테헤란로 123 행복아파트 101동 1502호', {
      ...NO_PATTERNS,
      address: true,
    });
    expect(addr.some((s) => s.kind === 'address' && s.confidence === 'low')).toBe(true);

    const { masked } = applyMask(
      '주소: 서울특별시 강남구 테헤란로 123 행복아파트 101동 1502호',
      cfg(),
    );
    expect(masked).toContain('［주소1］');
    expect(masked).not.toContain('강남구');
    expect(masked).not.toContain('행복아파트');
  });

  it('주민번호 안의 6자리 생년월일은 이중 마스킹되지 않는다(주민번호 우선)', () => {
    const { mappings } = applyMask('900101-1234567', cfg());
    expect(mappings).toHaveLength(1);
    expect(mappings[0]?.kind).toBe('rrn');
  });
});

describe('maskEngine — 키워드(조사 포함 매칭)', () => {
  it('조사가 붙은 형태도 가린다', () => {
    const src = '김민수가 발표했고 김민수에게 전달했다';
    const config = cfg({
      patterns: NO_PATTERNS,
      keywordGroups: [{ label: '이름', values: ['김민수'] }],
    });
    const { masked, mappings } = applyMask(src, config);
    expect(masked).toBe('［이름1］가 발표했고 ［이름1］에게 전달했다');
    expect(restore(masked, mappings)).toBe(src);
  });

  it('같은 원문은 같은 별칭을 재사용한다', () => {
    const config = cfg({
      patterns: NO_PATTERNS,
      keywordGroups: [{ label: '이름', values: ['김철수'] }],
    });
    const { masked, mappings } = applyMask('김철수와 김철수', config);
    expect(masked).toBe('［이름1］와 ［이름1］');
    expect(mappings).toHaveLength(1);
  });

  it('1글자 키워드는 과잉매칭 방지로 무시한다', () => {
    const config = cfg({
      patterns: NO_PATTERNS,
      keywordGroups: [{ label: '이름', values: ['이', '이순신'] }],
    });
    const { masked } = applyMask('이 사람과 이순신', config);
    expect(masked).toBe('이 사람과 ［이름1］');
  });

  it('라벨별로 다른 접두사를 쓴다', () => {
    const config = cfg({
      patterns: NO_PATTERNS,
      keywordGroups: [
        { label: '이름', values: ['홍길동'] },
        { label: '학교', values: ['행복중학교'] },
      ],
    });
    const { masked } = applyMask('홍길동은 행복중학교 학생', config);
    expect(masked).toBe('［이름1］은 ［학교1］ 학생');
  });
});

describe('maskEngine — 복합 라운드트립', () => {
  it('이름+전화 복합도 원문으로 복원된다', () => {
    const src = '김민수(010-1234-5678) 학부모 면담';
    const config = cfg({ keywordGroups: [{ label: '이름', values: ['김민수'] }] });
    const { masked, mappings } = applyMask(src, config);
    expect(masked).not.toContain('김민수');
    expect(masked).not.toContain('010-1234-5678');
    expect(restore(masked, mappings)).toBe(src);
  });

  it('가릴 것이 없으면 원문 그대로 둔다', () => {
    const src = '오늘 날씨가 좋습니다';
    const { masked, mappings } = applyMask(src, cfg());
    expect(masked).toBe(src);
    expect(mappings).toHaveLength(0);
  });
});
