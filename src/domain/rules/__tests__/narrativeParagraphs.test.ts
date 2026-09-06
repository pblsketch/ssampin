/**
 * 형광펜 표식 파서 — 모델이 형식을 살짝 어겨도 읽고, 모르는 말은 지우지 않는다(ADR-085 §7-2).
 */
import { describe, it, expect } from 'vitest';
import {
  alignRoleMarksInline,
  hasAnyRole,
  parseNarrativeParagraphs,
  roleMarksOf,
  sameNarrativeBody,
  splitParagraphs,
  stripNarrativeMarks,
} from '../narrativeParagraphs';

describe('parseNarrativeParagraphs', () => {
  it('표식이 없으면 전부 role null 이고 본문 그대로다', () => {
    const out = parseNarrativeParagraphs('첫 문단.\n\n둘째 문단.');
    expect(out).toEqual([
      { role: null, text: '첫 문단.' },
      { role: null, text: '둘째 문단.' },
    ]);
    expect(hasAnyRole(out)).toBe(false);
  });

  it('정본 표식 4종을 읽고 본문에서 뗀다', () => {
    const out = parseNarrativeParagraphs(
      '[동기] 왜 그런지 물었다.\n\n[과정] 자료를 모았다.\n\n[결과] 답을 찾았다.\n\n[평가] 끈기가 돋보인다.',
    );
    expect(out.map((p) => p.role)).toEqual(['motive', 'process', 'result', 'evaluation']);
    expect(out.map((p) => p.text)).toEqual([
      '왜 그런지 물었다.',
      '자료를 모았다.',
      '답을 찾았다.',
      '끈기가 돋보인다.',
    ]);
  });

  it('일부 문단에만 표식이 있으면 나머지는 null', () => {
    const out = parseNarrativeParagraphs('[동기] 물었다.\n\n그냥 문단.');
    expect(out.map((p) => p.role)).toEqual(['motive', null]);
  });

  it('괄호 변형(【】·()·〔〕·<>)과 콜론·"동기·질문" 같은 낱말 변형을 받는다', () => {
    const out = parseNarrativeParagraphs(
      '【동기·질문】 물었다.\n\n(과정): 모았다.\n\n〔결과〕찾았다.\n\n<교사 평가> 돋보인다.',
    );
    expect(out.map((p) => p.role)).toEqual(['motive', 'process', 'result', 'evaluation']);
    expect(out.map((p) => p.text)).toEqual(['물었다.', '모았다.', '찾았다.', '돋보인다.']);
  });

  it('한 문단에 표식이 두 번이면 첫 것이 역할이고 둘 다 뗀다', () => {
    const out = parseNarrativeParagraphs('[동기] [과정] 겹친 문단.');
    expect(out).toEqual([{ role: 'motive', text: '겹친 문단.' }]);
  });

  it('모르는 낱말의 대괄호는 표식이 아니다 — 본문에 남긴다', () => {
    const out = parseNarrativeParagraphs('[서론] 이 글은…');
    expect(out).toEqual([{ role: null, text: '[서론] 이 글은…' }]);
  });

  it('본문 중간의 괄호는 건드리지 않는다', () => {
    const out = parseNarrativeParagraphs('[과정] 실험(결과)을 정리했다.');
    expect(out).toEqual([{ role: 'process', text: '실험(결과)을 정리했다.' }]);
  });

  it('빈 줄이 없으면 줄바꿈 단위로 문단을 나눈다', () => {
    const out = parseNarrativeParagraphs('[동기] 하나\n[결과] 둘');
    expect(out.map((p) => p.role)).toEqual(['motive', 'result']);
  });

  it('CRLF·앞뒤 공백을 견딘다', () => {
    expect(splitParagraphs('  a\r\n\r\nb  \r\n')).toEqual(['a', 'b']);
  });
});

describe('stripNarrativeMarks / roleMarksOf', () => {
  it('저장용 본문에는 [동기] 류 문자열이 0건이고 ★줄바꿈도 0건이다(생기부는 한 덩어리 글)', () => {
    const s = stripNarrativeMarks('[동기] 하나.\n\n[평가] 둘.');
    expect(s).toBe('하나. 둘.');
    expect(s).not.toMatch(/\[(동기|과정|결과|평가)\]/);
    expect(s).not.toContain('\n');
  });

  it('표식은 순서를 지키며 역할 없는 문단도 null 로 남긴다', () => {
    const marks = roleMarksOf(parseNarrativeParagraphs('[동기] 하나.\n\n둘.\n\n[결과] 셋.'));
    expect(marks.map((m) => m.role)).toEqual(['motive', null, 'result']);
  });
});

describe('sameNarrativeBody — [다시 표시] 검문', () => {
  it('문장이 그대로면 통과, 한 글자라도 바뀌면 거부', () => {
    const ok = parseNarrativeParagraphs('[동기] 하나.\n\n[결과] 둘.');
    expect(sameNarrativeBody('하나.\n\n둘.', ok)).toBe(true);
    const changed = parseNarrativeParagraphs('[동기] 하나.\n\n[결과] 둘을 고쳤다.');
    expect(sameNarrativeBody('하나.\n\n둘.', changed)).toBe(false);
  });

  it('★한 덩어리 원문 ↔ 문단으로 온 답이 같은 글이면 통과한다(문단 수로 견주지 않는다)', () => {
    // 저장 본문은 줄바꿈이 없고 모델은 문단으로 답한다 — 문단 수를 견주면 [다시 표시]가 늘 실패한다.
    const answer = parseNarrativeParagraphs('[동기] 하나.\n\n[결과] 둘.');
    expect(sameNarrativeBody('하나. 둘.', answer)).toBe(true);
  });
});

describe('alignRoleMarksInline — 한 덩어리 글의 인라인 형광펜', () => {
  const marks = roleMarksOf(parseNarrativeParagraphs('[동기] 하나.\n\n[과정] 둘.\n\n[결과] 셋.'));

  it('이어 붙인 글에서 구간이 순서대로 exact 로 잡힌다', () => {
    const out = alignRoleMarksInline('하나. 둘. 셋.', marks).filter((s) => s.role !== null);
    expect(out.map((s) => [s.text, s.role, s.match])).toEqual([
      ['하나.', 'motive', 'exact'],
      ['둘.', 'process', 'exact'],
      ['셋.', 'result', 'exact'],
    ]);
  });

  it('한 구간을 고치면 그 자리만 stale 이고 나머지는 exact 다', () => {
    const out = alignRoleMarksInline('하나. 둘을 고쳤다. 셋.', marks);
    const colored = out.filter((s) => s.role !== null);
    expect(colored.map((s) => [s.role, s.match])).toEqual([
      ['motive', 'exact'],
      ['process', 'stale'],
      ['result', 'exact'],
    ]);
    // 원문의 모든 글자가 구간에 그대로 남는다(거울 레이어가 글자를 잃으면 색이 밀린다).
    expect(out.map((s) => s.text).join('')).toBe('하나. 둘을 고쳤다. 셋.');
  });

  it('★줄바꿈이 든 옛 초안에서도 같은 결과가 나온다', () => {
    const out = alignRoleMarksInline('하나.\n\n둘.\n\n셋.', marks).filter((s) => s.role !== null);
    expect(out.map((s) => [s.text, s.match])).toEqual([
      ['하나.', 'exact'],
      ['둘.', 'exact'],
      ['셋.', 'exact'],
    ]);
  });

  it('표식이 없으면 색 없는 한 구간이고, 원문은 그대로다', () => {
    expect(alignRoleMarksInline('하나. 둘.', undefined)).toEqual([
      { text: '하나. 둘.', role: null, match: null },
    ]);
  });
});
