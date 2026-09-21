/**
 * 도구 이름이 목록들 사이에서 갈라지지 않게 고정한다.
 *
 * 왜 있나: 쌤도구 목록은 세 군데다 — `ToolsGrid.tsx`(정본 카드), `toolRegistry.ts`(듀얼 모드),
 * `toolDefinitions.ts`(즐겨찾기·빠른 실행). 2026-09-21에 확인해 보니 앞의 둘은 '참여교실'인데
 * 즐겨찾기만 그보다 더 옛 이름인 '복합 유형 설문'으로 남아 있었다. 한 곳만 고치면 또 갈라진다.
 */
import { describe, expect, it } from 'vitest';
import { PARTICIPATION_TOOL_NAME } from '../participationBranding';
import { TOOL_DEFINITIONS } from '@adapters/constants/toolDefinitions';

describe('참여 활동 도구 이름', () => {
  it('즐겨찾기 목록이 같은 이름을 쓴다', () => {
    const entry = TOOL_DEFINITIONS.find((tool) => tool.id === 'tool-multi-survey');
    expect(entry?.name).toBe(PARTICIPATION_TOOL_NAME);
  });

  it('이름이 비어 있지 않다', () => {
    expect(PARTICIPATION_TOOL_NAME.trim().length).toBeGreaterThan(0);
  });
});
