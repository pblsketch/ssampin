import { describe, it, expect } from 'vitest';
import { TOOL_GROUPS, ALL_TOOLS, findTool, searchTools } from '@mobile/pages/more/toolCatalog';

describe('toolCatalog', () => {
  it('도구 14종이 모두 있고 중복이 없다', () => {
    expect(ALL_TOOLS).toHaveLength(14);
    const ids = ALL_TOOLS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('모든 도구 id 가 tool- 접두사를 쓴다 (App.tsx 의 moreSub 키와 같은 형식)', () => {
    for (const t of ALL_TOOLS) {
      expect(t.id, `${t.name} 의 id 형식`).toMatch(/^tool-[a-z-]+$/);
    }
  });

  it('그룹이 비어 있지 않다', () => {
    for (const g of TOOL_GROUPS) {
      expect(g.tools.length, `${g.title} 그룹`).toBeGreaterThan(0);
    }
  });

  it('findTool 로 id 조회가 된다', () => {
    expect(findTool('tool-timer')?.name).toBe('타이머');
    expect(findTool('없는도구')).toBeUndefined();
  });

  describe('searchTools', () => {
    it('빈 검색어는 null — "검색 중이 아님"과 "결과 없음"은 다르다', () => {
      expect(searchTools('')).toBeNull();
      expect(searchTools('   ')).toBeNull();
    });

    it('앞 글자 몇 개로 찾는다', () => {
      const r = searchTools('타');
      expect(r?.map((t) => t.name)).toContain('타이머');
    });

    it('별칭으로도 찾는다 (다르게 부르는 말)', () => {
      expect(searchTools('루브릭')?.map((t) => t.name)).toContain('수행평가 채점');
      expect(searchTools('점수배분')?.map((t) => t.name)).toContain('배점 계산기');
      expect(searchTools('뽑기')?.map((t) => t.name)).toContain('랜덤뽑기');
    });

    it('설명으로도 찾는다', () => {
      expect(searchTools('모둠')?.length).toBeGreaterThan(0);
    });

    it('없는 말은 빈 배열 (null 아님)', () => {
      const r = searchTools('존재하지않는도구이름');
      expect(r).not.toBeNull();
      expect(r).toHaveLength(0);
    });

    it('대소문자를 가리지 않는다', () => {
      expect(searchTools('qr')?.map((t) => t.name)).toContain('QR코드');
      expect(searchTools('QR')?.map((t) => t.name)).toContain('QR코드');
    });
  });
});
