import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { PageId } from '@adapters/components/Layout/Sidebar';
import { getToolDefinition, TOOL_DEFINITIONS } from '@adapters/constants/toolDefinitions';
import { TOOLS } from './ToolsGrid';

describe('classroom agreement tool registration', () => {
  const pageId: PageId = 'tool-classroom-agreement';

  it('registers the tool in the grid and favorite-tool definitions', () => {
    const gridCard = TOOLS.find((tool) => tool.id === pageId);
    const favoriteDefinition = getToolDefinition(pageId);

    expect(gridCard).toMatchObject({
      id: pageId,
      name: '교실 약속 정하기',
    });
    expect(gridCard?.externalUrl).toBeUndefined();
    expect(gridCard?.description).not.toMatch(/AI|자동 생성|추천/);
    expect(favoriteDefinition).toMatchObject({
      id: pageId,
      name: '교실약속정하기',
    });
    expect(favoriteDefinition?.externalUrl).toBeUndefined();
    expect(TOOL_DEFINITIONS.map((tool) => tool.id)).toContain(pageId);
  });

  it('has a teacher app render branch for the registered PageId', () => {
    const appSource = readFileSync('src/App.tsx', 'utf8');

    expect(appSource).toContain("page === 'tool-classroom-agreement'");
    expect(appSource).toContain('ToolClassroomAgreement');
  });
});

describe('signature request tool registration', () => {
  const pageId: PageId = 'tool-signature-request';

  it('registers the tool in the grid and favorite-tool definitions', () => {
    const gridCard = TOOLS.find((tool) => tool.id === pageId);
    const favoriteDefinition = getToolDefinition(pageId);

    expect(gridCard).toMatchObject({
      id: pageId,
      name: '서명받기',
    });
    expect(gridCard?.externalUrl).toBeUndefined();
    expect(gridCard?.description).toContain('서명');
    expect(favoriteDefinition).toMatchObject({
      id: pageId,
      name: '서명받기',
    });
    expect(favoriteDefinition?.externalUrl).toBeUndefined();
    expect(TOOL_DEFINITIONS.map((tool) => tool.id)).toContain(pageId);
  });

  it('has a teacher app render branch for the registered PageId', () => {
    const appSource = readFileSync('src/App.tsx', 'utf8');

    expect(appSource).toContain("page === 'tool-signature-request'");
    expect(appSource).toContain('ToolSignatureRequest');
  });
});
