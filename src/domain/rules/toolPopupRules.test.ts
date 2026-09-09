import { describe, it, expect } from 'vitest';
import { POPUP_TOOL_IDS } from '../entities/ToolPopup';
import {
  TOOL_POPUP_MODE,
  TOOL_POPUP_WINDOW_SPECS,
  buildToolPopupQuery,
  isPopupToolId,
  parseToolPopupQuery,
  resolveToolPopupSpec,
} from './toolPopupRules';

describe('toolPopupRules — 허용목록', () => {
  it('지원하는 9종을 통과시킨다', () => {
    expect(POPUP_TOOL_IDS).toHaveLength(9);
    for (const id of POPUP_TOOL_IDS) {
      expect(isPopupToolId(id)).toBe(true);
    }
  });

  it('허용목록 밖 도구·외부 URL·비문자열을 거절한다', () => {
    expect(isPopupToolId('tool-seat-picker')).toBe(false);
    expect(isPopupToolId('tool-chalkboard')).toBe(false);
    expect(isPopupToolId('https://example.com')).toBe(false);
    expect(isPopupToolId('')).toBe(false);
    expect(isPopupToolId(null)).toBe(false);
    expect(isPopupToolId(42)).toBe(false);
    expect(isPopupToolId({ toString: () => 'tool-timer' })).toBe(false);
  });
});

describe('toolPopupRules — 창 사양', () => {
  it('9종 모두 기본·최소 크기를 가진다', () => {
    for (const id of POPUP_TOOL_IDS) {
      const spec = resolveToolPopupSpec(id);
      expect(spec.width).toBeGreaterThan(0);
      expect(spec.height).toBeGreaterThan(0);
      expect(spec.minWidth).toBeLessThanOrEqual(spec.width);
      expect(spec.minHeight).toBeLessThanOrEqual(spec.height);
    }
  });

  it('최소 크기가 조작 가능한 하한(가로 320·세로 420) 아래로 내려가지 않는다', () => {
    for (const id of POPUP_TOOL_IDS) {
      const spec = TOOL_POPUP_WINDOW_SPECS[id];
      expect(spec.minWidth).toBeGreaterThanOrEqual(320);
      expect(spec.minHeight).toBeGreaterThanOrEqual(420);
    }
  });
});

describe('toolPopupRules — 창 주소', () => {
  it('조립한 주소를 다시 읽으면 같은 값이 나온다', () => {
    const query = buildToolPopupQuery({ toolId: 'tool-timer', handoffId: 'h1' });
    expect(query).toContain(`mode=${TOOL_POPUP_MODE}`);
    expect(parseToolPopupQuery(query)).toEqual({ toolId: 'tool-timer', handoffId: 'h1' });
  });

  it('스냅샷 없이 열면 handoffId 가 null 이다', () => {
    const query = buildToolPopupQuery({ toolId: 'tool-dice', handoffId: null });
    expect(query).not.toContain('handoff');
    expect(parseToolPopupQuery(query)).toEqual({ toolId: 'tool-dice', handoffId: null });
  });

  it('mode 가 다르거나 도구가 허용목록 밖이면 null', () => {
    expect(parseToolPopupQuery('mode=widget&tool=tool-timer')).toBeNull();
    expect(parseToolPopupQuery(`mode=${TOOL_POPUP_MODE}&tool=tool-seat-picker`)).toBeNull();
    expect(parseToolPopupQuery(`mode=${TOOL_POPUP_MODE}`)).toBeNull();
    expect(parseToolPopupQuery('')).toBeNull();
  });

  it('앞에 ? 가 붙은 검색 문자열도 그대로 읽는다', () => {
    expect(parseToolPopupQuery(`?mode=${TOOL_POPUP_MODE}&tool=tool-coin`)).toEqual({
      toolId: 'tool-coin',
      handoffId: null,
    });
  });
});
