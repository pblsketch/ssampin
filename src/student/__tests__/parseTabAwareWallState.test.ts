/**
 * β-Step8 — parseTabAwareWallState 단위 테스트.
 *
 * Plan §2.2 Step 8 / Spec §4.3 학생 SPA tab-aware filter.
 *
 * 검증:
 *   - tabs 부재 (legacy v1.15.x) → 단일 default 탭 합성 + 모든 카드 통과
 *   - tabs 있음 → activeTabId 정정 + posts.tabId 필터
 *   - canCompose = settings.studentInlineComposerEnabled & permission='all' & !studentFormLocked
 *   - permission='teacher-only' 는 BroadcastWallState 단에서 이미 제외 (assumption)
 *   - studentFormLocked=true → canCompose=false
 */
import { describe, expect, it } from 'vitest';
import { parseTabAwareWallState } from '../parseTabAwareWallState';
import { DEFAULT_TAB_ID } from '@domain/entities/RealtimeWallTabConfig';
import type { WallBoardSnapshotForStudent } from '@usecases/realtimeWall/BroadcastWallState';
import type { RealtimeWallColumn, RealtimeWallPost } from '@domain/entities/RealtimeWall';
import type { RealtimeWallTabConfig } from '@domain/entities/RealtimeWallTabConfig';
import type { RealtimeWallBoardSettings } from '@domain/entities/RealtimeWallBoardSettings';

const columns: readonly RealtimeWallColumn[] = [{ id: 'c1', title: 'A', order: 0 }];

function mkSettings(overrides: Partial<RealtimeWallBoardSettings> = {}): RealtimeWallBoardSettings {
  return { version: 1, moderation: 'off', ...overrides };
}

function mkPost(id: string, overrides: Partial<RealtimeWallPost> = {}): RealtimeWallPost {
  return {
    id,
    nickname: `n-${id}`,
    text: `t-${id}`,
    status: 'approved',
    pinned: false,
    submittedAt: Number(id),
    kanban: { columnId: 'c1', order: 0 },
    freeform: { x: 0, y: 0, w: 260, h: 180, zIndex: 0 },
    ...overrides,
  };
}

function mkBoard(
  overrides: Partial<WallBoardSnapshotForStudent> = {},
): WallBoardSnapshotForStudent {
  return {
    title: '테스트 보드',
    layoutMode: 'kanban',
    columns,
    posts: [],
    studentFormLocked: false,
    settings: mkSettings(),
    ...overrides,
  };
}

describe('parseTabAwareWallState', () => {
  describe('legacy v1.15.x 보드 (tabs 부재)', () => {
    it('단일 default 탭 합성 + defaultTabTitle 라벨 주입', () => {
      const board = mkBoard({ posts: [mkPost('1'), mkPost('2')] });
      const result = parseTabAwareWallState(board, { defaultTabTitle: '전체' });
      expect(result.visibleTabs).toHaveLength(1);
      expect(result.visibleTabs[0]).toEqual({
        id: DEFAULT_TAB_ID,
        title: '전체',
        permission: 'all',
        order: 0,
      });
      expect(result.activeTabId).toBe(DEFAULT_TAB_ID);
    });

    it('defaultTabTitle 미전달 시 도메인 식별자가 라벨로 fallback', () => {
      const board = mkBoard();
      const result = parseTabAwareWallState(board);
      expect(result.activeTab.title).toBe(DEFAULT_TAB_ID);
    });

    it('legacy 보드 모든 post 통과 (tabId 미존재 카드 포함)', () => {
      const board = mkBoard({
        posts: [mkPost('1'), mkPost('2'), mkPost('3', { tabId: 'something' })],
      });
      const result = parseTabAwareWallState(board);
      expect(result.postsForActiveTab).toHaveLength(3);
    });
  });

  describe('v2.0 보드 (tabs 있음)', () => {
    const tabA: RealtimeWallTabConfig = {
      id: 'tab-a',
      title: '탭 A',
      permission: 'all',
      order: 0,
    };
    const tabB: RealtimeWallTabConfig = {
      id: 'tab-b',
      title: '탭 B',
      permission: 'all',
      order: 1,
    };

    it('activeTabId 미지정 시 첫 visible 탭 사용', () => {
      const board = mkBoard({ tabs: [tabA, tabB] });
      const result = parseTabAwareWallState(board);
      expect(result.activeTabId).toBe('tab-a');
    });

    it('activeTabId 가 visibleTabs 에 있으면 그대로 사용', () => {
      const board = mkBoard({ tabs: [tabA, tabB] });
      const result = parseTabAwareWallState(board, { activeTabId: 'tab-b' });
      expect(result.activeTabId).toBe('tab-b');
    });

    it('activeTabId 가 visibleTabs 에 없으면 첫 탭으로 정정', () => {
      const board = mkBoard({ tabs: [tabA, tabB] });
      const result = parseTabAwareWallState(board, { activeTabId: 'tab-nonexistent' });
      expect(result.activeTabId).toBe('tab-a');
    });

    it('posts 필터: post.tabId === activeTabId 카드만 포함', () => {
      const board = mkBoard({
        tabs: [tabA, tabB],
        posts: [
          mkPost('1', { tabId: 'tab-a' }),
          mkPost('2', { tabId: 'tab-b' }),
          mkPost('3', { tabId: 'tab-a' }),
        ],
      });
      const result = parseTabAwareWallState(board, { activeTabId: 'tab-a' });
      expect(result.postsForActiveTab.map((p) => p.id)).toEqual(['1', '3']);
    });

    it('post.tabId 미존재 카드는 activeTabId===DEFAULT_TAB_ID 일 때만 표시', () => {
      const defaultTab: RealtimeWallTabConfig = {
        id: DEFAULT_TAB_ID,
        title: '전체',
        permission: 'all',
        order: 0,
      };
      const board = mkBoard({
        tabs: [defaultTab, tabA],
        posts: [
          mkPost('1'), // tabId 미존재 (legacy 카드)
          mkPost('2', { tabId: 'tab-a' }),
        ],
      });
      const defaultActive = parseTabAwareWallState(board, { activeTabId: DEFAULT_TAB_ID });
      expect(defaultActive.postsForActiveTab.map((p) => p.id)).toEqual(['1']);
      const tabAActive = parseTabAwareWallState(board, { activeTabId: 'tab-a' });
      expect(tabAActive.postsForActiveTab.map((p) => p.id)).toEqual(['2']);
    });
  });

  describe('canCompose', () => {
    const writeTab: RealtimeWallTabConfig = {
      id: 'tab-write',
      title: '쓰기',
      permission: 'all',
      order: 0,
    };
    const gatedTab: RealtimeWallTabConfig = {
      id: 'tab-gated',
      title: '제한',
      permission: 'role-gated',
      order: 1,
    };

    it('default (모든 조건 충족) → canCompose=true', () => {
      const board = mkBoard({ tabs: [writeTab] });
      const result = parseTabAwareWallState(board);
      expect(result.canCompose).toBe(true);
    });

    it('studentFormLocked=true → canCompose=false', () => {
      const board = mkBoard({ tabs: [writeTab], studentFormLocked: true });
      const result = parseTabAwareWallState(board);
      expect(result.canCompose).toBe(false);
    });

    it("activeTab.permission='role-gated' → canCompose=false (v2.1+ 미구현)", () => {
      const board = mkBoard({ tabs: [gatedTab] });
      const result = parseTabAwareWallState(board, { activeTabId: 'tab-gated' });
      expect(result.canCompose).toBe(false);
    });

    it('settings.studentInlineComposerEnabled=false 시 canCompose=false', () => {
      const settings = mkSettings() as RealtimeWallBoardSettings & {
        studentInlineComposerEnabled?: boolean;
      };
      settings.studentInlineComposerEnabled = false;
      const board = mkBoard({ tabs: [writeTab], settings });
      const result = parseTabAwareWallState(board);
      expect(result.canCompose).toBe(false);
    });

    it('settings.studentInlineComposerEnabled 미정의 시 기본 true (G012 이전 호환)', () => {
      const board = mkBoard({ tabs: [writeTab] });
      const result = parseTabAwareWallState(board);
      expect(result.canCompose).toBe(true);
    });
  });
});
