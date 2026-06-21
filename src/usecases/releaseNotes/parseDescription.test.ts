import { describe, it, expect } from 'vitest';
import { parseDescription, parseInlineMarks } from './parseDescription';

describe('parseDescription', () => {
  // TC-1: 4슬롯 정상 — paragraph·bulletList·paragraph·paragraph 순서
  it('TC-1: 4슬롯 정상 파싱', () => {
    const input = [
      '위젯이 진짜 바탕화면 작업판처럼 깔립니다.',
      '· 빈 공간 클릭·휠·드래그 모두 위젯으로\n· 가장자리 8방향 자유 리사이즈\n· Ctrl+1~4 레이아웃 즉석 전환',
      '[설정 > 위젯 > 바탕화면 아이콘 아래 모드] 토글로 켜세요.',
      '시간표를 늘 곁에 두고 수업하시는 분들께 어울려요.',
    ].join('\n\n');

    const result = parseDescription(input);
    expect(result).toHaveLength(4);
    expect(result[0]?.type).toBe('paragraph');
    expect(result[1]?.type).toBe('bulletList');
    expect(result[2]?.type).toBe('paragraph');
    expect(result[3]?.type).toBe('paragraph');

    const second = result[1];
    if (second && second.type === 'bulletList') {
      expect(second.items).toHaveLength(3);
      expect(second.items[0]?.level).toBe(1);
    }
  });

  // TC-2: 단일 문단 폴백 — \n\n 없음 (v2.0.3 이전 데이터)
  it('TC-2: 구버전 단일 문단 폴백', () => {
    const input = 'Windows 설정 → 위젯 → [바탕화면 아이콘 아래 모드]를 켜면 작업판이 됩니다.';
    const result = parseDescription(input);
    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe('paragraph');
  });

  // TC-3: 종속 불릿 level=2 (◦)
  it('TC-3: 종속 불릿 level=2 파싱', () => {
    const input = ['리드 텍스트.', '· 1단계 불릿\n  ◦ 종속 불릿 A\n  ◦ 종속 불릿 B'].join('\n\n');
    const result = parseDescription(input);
    const second = result[1];
    expect(second?.type).toBe('bulletList');

    if (second && second.type === 'bulletList') {
      expect(second.items[0]?.level).toBe(1);
      expect(second.items[1]?.level).toBe(2);
      expect(second.items[2]?.level).toBe(2);
    }
  });

  // TC-4: 빈 description → 빈 배열
  it('TC-4: 빈/공백/null/undefined → 빈 배열', () => {
    expect(parseDescription('')).toEqual([]);
    expect(parseDescription('   ')).toEqual([]);
    expect(parseDescription(null)).toEqual([]);
    expect(parseDescription(undefined)).toEqual([]);
  });

  // TC-5: **bold** 인라인 마크 처리
  it('TC-5: bold 마크 InlineNode 변환', () => {
    const input = '위젯이 **진짜 바탕화면 작업판**처럼 깔립니다.';
    const result = parseDescription(input);
    const first = result[0];
    expect(first?.type).toBe('paragraph');

    if (first && first.type === 'paragraph') {
      const nodes = first.content;
      expect(nodes).toHaveLength(3);
      expect(nodes[0]).toEqual({ kind: 'text', value: '위젯이 ' });
      expect(nodes[1]).toEqual({ kind: 'bold', value: '진짜 바탕화면 작업판' });
      expect(nodes[2]).toEqual({ kind: 'text', value: '처럼 깔립니다.' });
    }
  });

  // TC-6: em-dash 보존
  it('TC-6: em-dash(—) 포함 텍스트 원형 보존', () => {
    const input = ['Drive 동기화 — 평소 자동 sync용으로 사용하세요.', '· 백업 센터와 보완적'].join(
      '\n\n',
    );
    const result = parseDescription(input);
    const first = result[0];

    if (first && first.type === 'paragraph') {
      const fullText = first.content.map((n: { value: string }) => n.value).join('');
      expect(fullText).toContain('—');
    }
  });
});

describe('parseInlineMarks', () => {
  it('bold 없는 텍스트는 단일 text 노드', () => {
    expect(parseInlineMarks('단순 텍스트')).toEqual([{ kind: 'text', value: '단순 텍스트' }]);
  });

  it('빈 문자열은 빈 text 노드 1개', () => {
    expect(parseInlineMarks('')).toEqual([{ kind: 'text', value: '' }]);
  });

  it('연속된 bold도 정상 파싱', () => {
    const result = parseInlineMarks('**A** 일반 **B**');
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ kind: 'bold', value: 'A' });
    expect(result[1]).toEqual({ kind: 'text', value: ' 일반 ' });
    expect(result[2]).toEqual({ kind: 'bold', value: 'B' });
  });

  it('마크다운 링크를 link 노드로 파싱', () => {
    const result = parseInlineMarks(
      '자세한 안내: [안내 페이지](https://www.ssampin.com/ai-bridge)',
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ kind: 'text', value: '자세한 안내: ' });
    expect(result[1]).toEqual({
      kind: 'link',
      value: '안내 페이지',
      href: 'https://www.ssampin.com/ai-bridge',
    });
  });

  it('링크 URL은 닫는 괄호에서 끊기고 뒤 괄호는 텍스트로 보존', () => {
    const result = parseInlineMarks('(안내: [링크](https://ssampin.com/ai-bridge))');
    expect(result[0]).toEqual({ kind: 'text', value: '(안내: ' });
    expect(result[1]).toEqual({
      kind: 'link',
      value: '링크',
      href: 'https://ssampin.com/ai-bridge',
    });
    expect(result[2]).toEqual({ kind: 'text', value: ')' });
  });

  it('bold와 링크가 섞여도 등장 순서대로 파싱', () => {
    const result = parseInlineMarks('**굵게** 그리고 [링크](https://ssampin.com) 끝');
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ kind: 'bold', value: '굵게' });
    expect(result[1]).toEqual({ kind: 'text', value: ' 그리고 ' });
    expect(result[2]).toEqual({ kind: 'link', value: '링크', href: 'https://ssampin.com' });
    expect(result[3]).toEqual({ kind: 'text', value: ' 끝' });
  });
});
