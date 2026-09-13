/**
 * AI 서사 초안 답 파서(ADR-103 §5-5).
 *
 * 여기서 지키는 것:
 *  - 꾸밈이 붙어도 읽는다(글머리표·번호·전각 구분자·굵게).
 *  - **모르는 값은 조용히 버린다** — 잘못 놓는 것보다 덜 놓는 게 낫다.
 *  - 자리 이름은 화면 말로 와도 **저장값 4종**으로 되돌린다(파서가 모르는 낱말을 들여보내지 않는다).
 *  - 평가 자리는 하나뿐이다.
 *  - 이유 문장은 별칭을 실명으로 되돌리고 200자에서 자른다.
 */
import { describe, expect, it } from 'vitest';

import {
  NARRATIVE_SUGGEST_NONE_WORD,
  moduleFromWord,
  parseNarrativeSuggestion,
  roleFromWord,
} from '@domain/rules/narrativeSuggestionParser';
import { NARRATIVE_NOTE_MAX } from '@domain/entities/InquiryThread';

const NUMBERED = ['e1', 'e2', 'e3'];

const parse = (answer: string, frame: 'inquiry' | 'life' = 'inquiry') =>
  parseNarrativeSuggestion(answer, { frame, numbered: NUMBERED });

it('장면 이유와 관계 이음말을 분리하고 첫 장면에는 이음말을 붙이지 않는다', () => {
  const result = parse(
    '동기 | 동기·질문 | 1 | 질문 기록 | 앞이 없음\n과정 | 자료 비교 | 2 | 기준을 비교한 기록 | 질문을 비교로 확인함',
  );
  expect(result.scenes).toHaveLength(2);
  expect(result.scenes[0]?.leadIn).toBeUndefined();
  expect(result.scenes[1]?.note).toBe('기준을 비교한 기록');
  expect(result.scenes[1]?.leadIn).toBe('질문을 비교로 확인함');
});

describe('roleFromWord', () => {
  it('탐구 틀 이름을 저장값으로 읽는다', () => {
    expect(roleFromWord('inquiry', '동기·질문')).toBe('motive');
    expect(roleFromWord('inquiry', '과정')).toBe('process');
    expect(roleFromWord('inquiry', '결과')).toBe('result');
    expect(roleFromWord('inquiry', '평가')).toBe('evaluation');
  });

  it('★생활 틀 화면 이름도 저장값 4종으로 옮긴다 — 낱말이 그대로 저장되지 않는다', () => {
    expect(roleFromWord('life', '특성')).toBe('motive');
    expect(roleFromWord('life', '장면')).toBe('process');
    expect(roleFromWord('life', '성장')).toBe('result');
    expect(roleFromWord('life', '평가')).toBe('evaluation');
  });

  it('모르는 낱말은 null 이다', () => {
    expect(roleFromWord('inquiry', '아무말')).toBeNull();
    expect(roleFromWord('inquiry', '  ')).toBeNull();
  });
});

describe('moduleFromWord', () => {
  it('그 자리에 있는 카테고리만 받는다', () => {
    expect(moduleFromWord('inquiry', 'motive', '첫 수행의 특징')).toBe('firstAttempt');
    // 「첫 수행의 특징」은 동기 자리다 — 과정 자리에서는 받지 않는다.
    expect(moduleFromWord('inquiry', 'process', '첫 수행의 특징')).toBeNull();
  });

  it('생활 틀 신설 카테고리도 그 자리에서 받는다', () => {
    expect(moduleFromWord('life', 'motive', '학습 태도')).toBe('learningAttitude');
    expect(moduleFromWord('life', 'result', '변화')).toBe('changeOverTime');
    expect(moduleFromWord('life', 'motive', '변화')).toBeNull();
  });
});

describe('parseNarrativeSuggestion', () => {
  it('기본형을 읽는다', () => {
    const r = parse(
      [
        '평가 | 교사 판단 |  | 마무리 판단은 선생님이 씁니다',
        '동기·질문 | 첫 수행의 특징 | 1 | 쿠폰 문구에 대한 물음에서 시작했습니다',
        '과정 | 받은 의견·자기 점검 | 2,3 | 의견을 받아 고쳤습니다',
      ].join('\n'),
    );
    expect(r.failure).toBeNull();
    expect(r.scenes).toHaveLength(3);
    expect(r.scenes[0]).toMatchObject({ role: 'evaluation', moduleId: 'teacherJudgement' });
    expect(r.scenes[1]).toMatchObject({ role: 'motive', moduleId: 'firstAttempt' });
    expect(r.scenes[1]?.evidenceIds).toEqual(['e1']);
    expect(r.scenes[2]?.evidenceIds).toEqual(['e2', 'e3']);
    expect(r.scenes[2]?.note).toBe('의견을 받아 고쳤습니다');
  });

  it('★꾸밈이 붙어도 읽는다 — 글머리표·번호·전각 구분자·굵게', () => {
    const r = parse(
      [
        '- **평가** ｜ 교사 판단 ｜ ｜ 마무리',
        '2) 동기·질문 │ 첫 수행의 특징 │ １ │ 물음에서 시작',
      ].join('\n'),
    );
    expect(r.failure).toBeNull();
    expect(r.scenes).toHaveLength(2);
    expect(r.scenes[1]?.evidenceIds).toEqual(['e1']);
  });

  it('★평가는 하나뿐이다 — 둘째부터 버린다', () => {
    const r = parse(
      ['평가 | 교사 판단 | | 하나', '동기 | | 1 | 둘', '평가 | 교사 판단 | | 셋'].join('\n'),
    );
    expect(r.scenes.filter((sc) => sc.role === 'evaluation')).toHaveLength(1);
  });

  it('하나의 자료를 여러 장면이 참조하되 같은 장면 안에서만 중복을 제거한다', () => {
    const r = parse(['동기 | | 1 | 앞', '과정 | | 1,2 | 뒤'].join('\n'));
    expect(r.scenes[0]?.evidenceIds).toEqual(['e1']);
    expect(r.scenes[1]?.evidenceIds).toEqual(['e1', 'e2']);
  });

  it('★범위 밖 번호는 조용히 버린다', () => {
    const r = parse(['동기 | | 1,99 | 앞'].join('\n'));
    expect(r.scenes[0]?.evidenceIds).toEqual(['e1']);
  });

  it('★그 자리에 없는 카테고리는 자리만 남기고 버린다', () => {
    const r = parse('동기 | 달라진 수행 | 1 | 이유');
    expect(r.scenes[0]?.role).toBe('motive');
    expect(r.scenes[0]?.moduleId).toBeUndefined();
  });

  it('카테고리 칸을 아예 안 쓴 답도 번호를 찾는다', () => {
    const r = parse('동기 | 1,2 | 이유만 남았다');
    expect(r.scenes[0]?.evidenceIds).toEqual(['e1', 'e2']);
  });

  it('이음말 줄을 따로 읽는다', () => {
    const r = parse(['동기 | | 1 | 이유', '이음 | 기초에서 심화로 넘어갑니다'].join('\n'));
    expect(r.linkNote).toBe('기초에서 심화로 넘어갑니다');
  });

  it('이유가 상한을 넘으면 자른다 — 요청서로 다시 나가는 글이다', () => {
    const long = '가'.repeat(NARRATIVE_NOTE_MAX + 50);
    const r = parse(`동기 | | 1 | ${long}`);
    expect(r.scenes[0]?.note).toHaveLength(NARRATIVE_NOTE_MAX);
  });

  it('별칭을 실명으로 되돌린다', () => {
    const r = parseNarrativeSuggestion('동기 | | 1 | ［이름1］이 물었습니다', {
      frame: 'inquiry',
      numbered: NUMBERED,
      mappings: [{ alias: '［이름1］', original: '김지훈', kind: 'keyword' }],
    });
    expect(r.scenes[0]?.note).toContain('김지훈');
  });
});

describe('★깨진 입력 5종', () => {
  it('빈 답', () => {
    expect(parse('').failure).toBe('empty-answer');
    expect(parse('   ').failure).toBe('empty-answer');
  });

  it('없음 + 이유', () => {
    const r = parse(`${NARRATIVE_SUGGEST_NONE_WORD} | 기록이 한 활동으로 이어지지 않습니다`);
    expect(r.failure).toBe('none');
    expect(r.reason).toBe('기록이 한 활동으로 이어지지 않습니다');
    expect(r.scenes).toHaveLength(0);
  });

  it('형식이 아예 없다', () => {
    expect(parse('네, 알겠습니다. 다음과 같이 정리했습니다.').failure).toBe('no-format');
  });

  it('모양은 맞는데 번호가 전부 범위 밖', () => {
    const r = parse(['동기 | | 88 | 이유', '과정 | | 99 | 이유'].join('\n'));
    expect(r.failure).toBe('no-valid-scenes');
    expect(r.scenes).toHaveLength(0);
  });

  it('자리 이름을 하나도 못 알아본다', () => {
    const r = parse(['첫째 | 뭐 | 1 | 이유', '둘째 | 뭐 | 2 | 이유'].join('\n'));
    expect(r.scenes).toHaveLength(0);
    expect(r.failure).toBe('no-format');
  });
});

describe('비워 둔 번호 칸 (ADR-109 — 평가 자리는 비워 두라고 시킨다)', () => {
  it('★평가 번호 칸이 비어 있으면 근거 없이 읽고, 이유는 넷째 칸에서 읽는다', () => {
    const r = parse(
      [
        '평가 | 교사 판단 |  | 종합 판단 기록이 없습니다',
        '동기 | 동기·질문 | 1 | 물음에서 시작',
      ].join('\n'),
    );
    expect(r.failure).toBeNull();
    expect(r.scenes[0]).toMatchObject({
      role: 'evaluation',
      moduleId: 'teacherJudgement',
      evidenceIds: [],
      note: '종합 판단 기록이 없습니다',
    });
  });

  it('카테고리를 건너뛰고 번호를 둘째 칸에 쓴 줄은 예전처럼 읽는다', () => {
    const r = parse('동기 | 1,2 | 물음에서 시작');
    expect(r.scenes[0]).toMatchObject({
      role: 'motive',
      evidenceIds: ['e1', 'e2'],
      note: '물음에서 시작',
    });
  });

  it('번호 칸 없이 세 칸만 쓴 줄은 셋째를 이유로 읽는다', () => {
    const r = parse(
      ['평가 | 교사 판단 | 기록이 없습니다', '동기 | 동기·질문 | 1 | 시작'].join('\n'),
    );
    expect(r.scenes[0]).toMatchObject({
      role: 'evaluation',
      evidenceIds: [],
      note: '기록이 없습니다',
    });
  });
});
