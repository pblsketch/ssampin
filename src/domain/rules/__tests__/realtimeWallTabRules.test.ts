/**
 * v2.0 (β-Step3) — 탭 규칙 + Tab CRUD 단위 테스트.
 *
 * Plan §4 β-Step3 / Delta v3.1 §2 Step 3 AC:
 *   - tab-cap-01: 9번째 탭 추가 시 cap 강제
 *   - tab-cap-02: assertTabCountWithinCap 검증
 *   - tab-delete-orphan-01: 탭 삭제 시 orphan posts auto-move to DEFAULT_TAB_ID
 *   - tab-permission-01/02: 권한 토글 동작
 *
 * 회귀 보호: posts.filter X — hard delete 패턴 금지 (회귀 위험 #8).
 *
 * 동작 = 파일 바이트 (CLAUDE.md P3) — 실제 함수 호출 후 결과 deep-equal.
 */

import { describe, it, expect } from 'vitest';
import {
  assertTabCountWithinCap,
  REALTIME_WALL_MAX_TABS,
  addRealtimeWallTab,
  renameRealtimeWallTab,
  updateRealtimeWallTabPermission,
  deleteRealtimeWallTab,
} from '../realtimeWallRules';
import { DEFAULT_TAB_ID, type RealtimeWallTabConfig } from '@domain/entities/RealtimeWallTabConfig';
import type { RealtimeWallPost } from '@domain/entities/RealtimeWall';

// ---- factories ----

function makeTab(overrides: Partial<RealtimeWallTabConfig> = {}): RealtimeWallTabConfig {
  return {
    id: 'tab-1',
    title: '탭1',
    permission: 'all',
    order: 0,
    ...overrides,
  };
}

function makeDefaultTabs(): RealtimeWallTabConfig[] {
  return [
    {
      id: DEFAULT_TAB_ID,
      title: '전체',
      permission: 'all',
      order: 0,
    },
  ];
}

function makePost(
  overrides: Partial<RealtimeWallPost> & { tabId?: string } = {},
): RealtimeWallPost {
  return {
    id: 'p1',
    nickname: '학생A',
    text: '테스트',
    status: 'approved',
    pinned: false,
    submittedAt: 0,
    kanban: { columnId: 'c1', order: 0 },
    freeform: { x: 0, y: 0, w: 100, h: 100, zIndex: 0 },
    likes: 5,
    likedBy: ['s1', 's2'],
    comments: [],
    color: 'yellow',
    tabId: DEFAULT_TAB_ID,
    ...overrides,
  };
}

// ---- REALTIME_WALL_MAX_TABS ----

describe('REALTIME_WALL_MAX_TABS', () => {
  it('상수 값은 8 (Plan §3 OC Q5)', () => {
    expect(REALTIME_WALL_MAX_TABS).toBe(8);
  });
});

// ---- assertTabCountWithinCap (AC tab-cap-02) ----

describe('assertTabCountWithinCap', () => {
  it('빈 배열 → ok', () => {
    expect(assertTabCountWithinCap([])).toEqual({ ok: true });
  });

  it('8개(cap) → ok', () => {
    const tabs = Array.from({ length: 8 }, (_, i) =>
      makeTab({ id: `tab-${i + 1}`, title: `탭${i + 1}`, order: i }),
    );
    expect(assertTabCountWithinCap(tabs)).toEqual({ ok: true });
  });

  it('9개 → TAB_CAP_EXCEEDED 결과 (current/cap 보고)', () => {
    const tabs = Array.from({ length: 9 }, (_, i) =>
      makeTab({ id: `tab-${i + 1}`, title: `탭${i + 1}`, order: i }),
    );
    expect(assertTabCountWithinCap(tabs)).toEqual({
      ok: false,
      reason: 'TAB_CAP_EXCEEDED',
      current: 9,
      cap: 8,
    });
  });

  it('cap 옵션 override 가능 (테스트 결정성)', () => {
    const tabs = Array.from({ length: 3 }, (_, i) =>
      makeTab({ id: `tab-${i + 1}`, title: `탭${i + 1}`, order: i }),
    );
    expect(assertTabCountWithinCap(tabs, 2)).toEqual({
      ok: false,
      reason: 'TAB_CAP_EXCEEDED',
      current: 3,
      cap: 2,
    });
  });
});

// ---- addRealtimeWallTab (AC tab-cap-01) ----

describe('addRealtimeWallTab', () => {
  it('기본 탭 1개 + 새 탭 추가 → 2개 (tab-1 id 발급, order 0/1)', () => {
    const before = makeDefaultTabs();
    const after = addRealtimeWallTab(before, '새 탭');
    expect(after).toHaveLength(2);
    expect(after[1]).toEqual({
      id: 'tab-1',
      title: '새 탭',
      permission: 'all',
      order: 1,
    });
  });

  it('8번째 탭까지는 정상 추가', () => {
    let tabs: RealtimeWallTabConfig[] = makeDefaultTabs();
    for (let i = 1; i <= 7; i++) {
      tabs = addRealtimeWallTab(tabs, `탭${i}`);
    }
    expect(tabs).toHaveLength(8);
  });

  it('9번째 탭 추가 시 cap 강제 — 원본 그대로 반환 (AC tab-cap-01)', () => {
    let tabs: RealtimeWallTabConfig[] = makeDefaultTabs();
    for (let i = 1; i <= 7; i++) {
      tabs = addRealtimeWallTab(tabs, `탭${i}`);
    }
    expect(tabs).toHaveLength(8);
    const after = addRealtimeWallTab(tabs, '9번째');
    expect(after).toHaveLength(8); // cap 강제
    expect(after).toEqual(tabs); // 동일 내용
  });

  it('빈 제목 거부 → 원본 그대로', () => {
    const before = makeDefaultTabs();
    expect(addRealtimeWallTab(before, '')).toEqual(before);
    expect(addRealtimeWallTab(before, '   ')).toEqual(before);
  });

  it('permission 옵션 (teacher-only 명시) 적용', () => {
    const before = makeDefaultTabs();
    const after = addRealtimeWallTab(before, '교사용', 'teacher-only');
    expect(after[1]?.permission).toBe('teacher-only');
  });

  it('id 충돌 회피 (기존 tab-3 있으면 tab-4 발급)', () => {
    const before: RealtimeWallTabConfig[] = [
      makeDefaultTabs()[0]!,
      { id: 'tab-3', title: '기존 3', permission: 'all', order: 1 },
    ];
    const after = addRealtimeWallTab(before, '새 탭');
    expect(after[2]?.id).toBe('tab-4');
  });
});

// ---- renameRealtimeWallTab ----

describe('renameRealtimeWallTab', () => {
  it('기본 동작', () => {
    const before: RealtimeWallTabConfig[] = [
      makeDefaultTabs()[0]!,
      { id: 'tab-1', title: '원래', permission: 'all', order: 1 },
    ];
    const after = renameRealtimeWallTab(before, 'tab-1', '새 이름');
    expect(after[1]?.title).toBe('새 이름');
  });

  it('빈 제목 거부 → 원본 그대로', () => {
    const before: RealtimeWallTabConfig[] = [
      { id: 'tab-1', title: '원래', permission: 'all', order: 0 },
    ];
    expect(renameRealtimeWallTab(before, 'tab-1', '   ')).toEqual(before);
  });

  it('존재하지 않는 id → 원본 그대로', () => {
    const before: RealtimeWallTabConfig[] = makeDefaultTabs();
    expect(renameRealtimeWallTab(before, 'tab-999', '새')).toEqual(before);
  });
});

// ---- updateRealtimeWallTabPermission (AC tab-permission-01/02) ----

describe('updateRealtimeWallTabPermission', () => {
  it('all → teacher-only 변경', () => {
    const before: RealtimeWallTabConfig[] = [
      makeDefaultTabs()[0]!,
      { id: 'tab-1', title: '탭1', permission: 'all', order: 1 },
    ];
    const after = updateRealtimeWallTabPermission(before, 'tab-1', 'teacher-only');
    expect(after[1]?.permission).toBe('teacher-only');
  });

  it('teacher-only → all 토글', () => {
    const before: RealtimeWallTabConfig[] = [
      { id: 'tab-1', title: '탭1', permission: 'teacher-only', order: 0 },
    ];
    const after = updateRealtimeWallTabPermission(before, 'tab-1', 'all');
    expect(after[0]?.permission).toBe('all');
  });

  it('존재하지 않는 id → 원본 그대로', () => {
    const before: RealtimeWallTabConfig[] = makeDefaultTabs();
    expect(updateRealtimeWallTabPermission(before, 'tab-999', 'teacher-only')).toEqual(before);
  });
});

// ---- deleteRealtimeWallTab (AC tab-delete-orphan-01) ----

describe('deleteRealtimeWallTab', () => {
  it('DEFAULT_TAB_ID 삭제 거부 (release-checklist B-5)', () => {
    const tabs: RealtimeWallTabConfig[] = [
      makeDefaultTabs()[0]!,
      { id: 'tab-1', title: '탭1', permission: 'all', order: 1 },
    ];
    const posts: RealtimeWallPost[] = [makePost({ tabId: DEFAULT_TAB_ID })];
    const result = deleteRealtimeWallTab(tabs, posts, DEFAULT_TAB_ID);
    expect(result.tabs).toEqual(tabs); // 동일
    expect(result.posts).toEqual(posts);
  });

  it('존재하지 않는 id → 원본 그대로', () => {
    const tabs: RealtimeWallTabConfig[] = makeDefaultTabs();
    const posts: RealtimeWallPost[] = [makePost()];
    const result = deleteRealtimeWallTab(tabs, posts, 'tab-999');
    expect(result.tabs).toEqual(tabs);
    expect(result.posts).toEqual(posts);
  });

  it('일반 탭 삭제 → 해당 탭 카드 모두 DEFAULT_TAB_ID 로 auto-move (AC tab-delete-orphan-01)', () => {
    const tabs: RealtimeWallTabConfig[] = [
      makeDefaultTabs()[0]!,
      { id: 'tab-A', title: '탭A', permission: 'all', order: 1 },
      { id: 'tab-B', title: '탭B', permission: 'all', order: 2 },
    ];
    const posts: RealtimeWallPost[] = [
      makePost({ id: 'p-default', tabId: DEFAULT_TAB_ID }),
      makePost({ id: 'p-a-1', tabId: 'tab-A' }),
      makePost({ id: 'p-a-2', tabId: 'tab-A' }),
      makePost({ id: 'p-b', tabId: 'tab-B' }),
    ];

    const result = deleteRealtimeWallTab(tabs, posts, 'tab-A');

    // tabs: tab-A 사라짐, default + tab-B 남음 (order 재계산: 0, 1)
    expect(result.tabs).toHaveLength(2);
    expect(result.tabs[0]?.id).toBe(DEFAULT_TAB_ID);
    expect(result.tabs[0]?.order).toBe(0);
    expect(result.tabs[1]?.id).toBe('tab-B');
    expect(result.tabs[1]?.order).toBe(1);

    // posts: tab-A 카드들이 모두 DEFAULT_TAB_ID 로 이동, 다른 탭 카드 변경 X
    expect(result.posts).toHaveLength(4); // **삭제 안 됨** — auto-move
    expect(result.posts.find((p) => p.id === 'p-default')?.tabId).toBe(DEFAULT_TAB_ID);
    expect(result.posts.find((p) => p.id === 'p-a-1')?.tabId).toBe(DEFAULT_TAB_ID);
    expect(result.posts.find((p) => p.id === 'p-a-2')?.tabId).toBe(DEFAULT_TAB_ID);
    expect(result.posts.find((p) => p.id === 'p-b')?.tabId).toBe('tab-B');
  });

  it('orphan 카드 좋아요/댓글/색상 보존 (release-checklist B-4 — hard delete 금지)', () => {
    const tabs: RealtimeWallTabConfig[] = [
      makeDefaultTabs()[0]!,
      { id: 'tab-X', title: '탭X', permission: 'all', order: 1 },
    ];
    const posts: RealtimeWallPost[] = [
      makePost({
        id: 'orphan-1',
        tabId: 'tab-X',
        likes: 7,
        likedBy: ['s1', 's2', 's3', 's4', 's5', 's6', 's7'],
        color: 'pink',
        pinned: true,
        teacherHearts: 3,
      }),
    ];

    const result = deleteRealtimeWallTab(tabs, posts, 'tab-X');

    expect(result.posts).toHaveLength(1);
    const orphan = result.posts[0]!;
    expect(orphan.tabId).toBe(DEFAULT_TAB_ID);
    expect(orphan.likes).toBe(7);
    expect(orphan.likedBy).toEqual(['s1', 's2', 's3', 's4', 's5', 's6', 's7']);
    expect(orphan.color).toBe('pink');
    expect(orphan.pinned).toBe(true);
    expect(orphan.teacherHearts).toBe(3);
  });
});
