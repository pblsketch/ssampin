/**
 * ADR-133 — 퀴즈·설문·토론과 겹치는 옛 도구를 목록에서 내린다.
 *
 * 내리는 자리가 **네 군데**라 한 곳만 고치면 반쪽이 된다(실제로 그랬다 —
 * 쌤도구 목록에서는 사라졌는데 즐겨찾기 고르개·분할 화면 고르개·[정리하기]에는 남아 있었다).
 *
 * 동시에 **지우지는 않았다**는 것도 고정한다. 선생님이 그 도구로 만든 템플릿·지난 결과가
 * 그대로 있고, 이미 즐겨찾기에 담아 둔 분의 위젯이 어느 날 갑자기 비면 안 된다.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TOOLS } from './ToolsGrid';
import { DUAL_TOOL_LIST, isDualToolId } from './toolRegistry';
import { getToolDefinition, TOOL_DEFINITIONS } from '@adapters/constants/toolDefinitions';

/** 새 도구가 같은 일을 해서 내린 것들 */
const RETIRED = [
  'tool-poll',
  'tool-survey',
  'tool-wordcloud',
  'tool-valueline',
  'tool-traffic-discussion',
] as const;

/** 남긴 것 — 실시간 담벼락은 통합 대상이 아니다(오너 결정, 2026-09-22) */
const KEPT = ['tool-multi-survey', 'tool-realtime-wall', 'tool-classroom-agreement'] as const;

describe('ADR-133 겹치는 도구 정리', () => {
  it('쌤도구 목록에서 내린다', () => {
    const shown = TOOLS.filter((t) => !t.hidden).map((t) => t.id);
    for (const id of RETIRED) expect(shown).not.toContain(id);
  });

  it('실시간 담벼락과 퀴즈·설문·토론은 그대로 둔다', () => {
    const shown = TOOLS.filter((t) => !t.hidden).map((t) => t.id);
    for (const id of KEPT) expect(shown).toContain(id);
  });

  it('즐겨찾기 고르개에서 내린다', () => {
    const pickable = TOOL_DEFINITIONS.filter((t) => !t.hidden).map((t) => t.id);
    for (const id of RETIRED) expect(pickable).not.toContain(id);
    expect(pickable).toContain('tool-multi-survey');
  });

  it('이미 즐겨찾기에 담아 둔 도구는 계속 찾아진다 — 위젯이 갑자기 비면 안 된다', () => {
    for (const id of RETIRED) expect(getToolDefinition(id)).toBeDefined();
  });

  it('분할 화면 고르개에서 내린다', () => {
    const pickable = DUAL_TOOL_LIST.filter((t) => !t.hidden).map((t) => t.id);
    for (const id of RETIRED) expect(pickable).not.toContain(id);
    expect(pickable).toContain('tool-multi-survey');
  });

  it('이미 띄워 둔 분할 화면·별도 창은 계속 돈다', () => {
    for (const id of RETIRED) expect(isDualToolId(id)).toBe(true);
  });

  it('화면으로 가는 길은 지우지 않았다 — 만들어 둔 자료가 사라지지 않는다', () => {
    const appSource = readFileSync('src/App.tsx', 'utf8');
    for (const id of RETIRED) expect(appSource).toContain(`page === '${id}'`);
  });

  it('[정리하기]도 목록과 같은 바탕을 쓴다 — 거른 도구가 거기서 되살아나지 않게', () => {
    const gridSource = readFileSync('src/adapters/components/Tools/ToolsGrid.tsx', 'utf8');
    expect(gridSource).toContain('initialOrder={sortByOrder(catalogTools, toolsOrder)');
    // id 를 손으로 나열한 옛 방식으로 되돌아가지 않게 고정한다.
    expect(gridSource).not.toContain('const integrated = new Set');
  });
});
