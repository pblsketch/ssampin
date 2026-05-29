/**
 * RealtimeWallBoardNormalizer v2.0 마이그레이션 단위 테스트.
 *
 * Plan §4 β-Step2 / Delta v3.1 §2 Step 2 AC `normalizer-01` `normalizer-02` `tab-migration-01` 정합.
 *
 * 검증:
 *   - normalizer-01: v1.15 fixture → v2 expected fixture deep-equal
 *   - normalizer-02: idempotent (두 번 호출 시 동일)
 *   - tab-migration-01: posts.tabId 모두 'default' + default tab 1개 + boardSettings 보존
 *
 * 무손실 정책 (release-checklist E-1):
 *   - 기존 카드/좋아요/댓글/하트/색상/PDF/이미지 100% 보존
 *
 * 동작 = 파일 바이트 (CLAUDE.md P3) — fixture JSON 을 실제 로드하여 deep-equal.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  normalizeBoardForRealtimeWallV2,
  normalizePostForRealtimeWallV2,
  normalizeRealtimeWallBoardForV2,
  normalizeWallBoardForV2,
} from '../RealtimeWallBoardNormalizer';
import { DEFAULT_TAB_ID, type RealtimeWallTabConfig } from '@domain/entities/RealtimeWallTabConfig';
import type { RealtimeWallPost, WallBoard } from '@domain/entities/RealtimeWall';

const fixturesDir = path.resolve('tests/fixtures');

function readFixture<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), 'utf-8')) as T;
}

// ---- normalizer-01: fixture deep-equal ----

describe('normalizeWallBoardForV2 — v1.15.x → v2.0 fixture deep-equal', () => {
  it('v1.15 fixture 로드 → v2 expected 와 deep-equal', () => {
    const v115 = readFixture<WallBoard>('wall-board-v115-sample.json');
    const expected = readFixture<WallBoard>('wall-board-v2-expected.json');

    const normalized = normalizeWallBoardForV2(v115, { defaultTabTitle: '전체' });

    expect(normalized).toEqual(expected);
  });

  it('legacy 카드 모든 필드 무손실 (text/likes/comments/색상/pdf/teacherHearts 등)', () => {
    const v115 = readFixture<WallBoard>('wall-board-v115-sample.json');
    const normalized = normalizeWallBoardForV2(v115, { defaultTabTitle: '전체' });

    // post-002 (모든 필드 풀하우스) 비교
    const original = v115.posts.find((p) => p.id === 'post-002')!;
    const normalizedPost = normalized.posts.find((p) => p.id === 'post-002')!;

    expect(normalizedPost.text).toBe(original.text);
    expect(normalizedPost.likes).toBe(original.likes);
    expect(normalizedPost.likedBy).toEqual(original.likedBy);
    expect(normalizedPost.comments).toEqual(original.comments);
    expect(normalizedPost.teacherHearts).toBe(original.teacherHearts);
    expect(normalizedPost.color).toBe(original.color);
    expect(normalizedPost.pdfUrl).toBe(original.pdfUrl);
    expect(normalizedPost.pdfFilename).toBe(original.pdfFilename);
    expect(normalizedPost.edited).toBe(original.edited);
    expect(normalizedPost.ownerSessionToken).toBe(original.ownerSessionToken);
  });
});

// ---- normalizer-02: idempotent ----

describe('normalizeWallBoardForV2 — idempotent', () => {
  it('두 번 호출 시 동일 결과 (one === twice)', () => {
    const v115 = readFixture<WallBoard>('wall-board-v115-sample.json');

    const once = normalizeWallBoardForV2(v115, { defaultTabTitle: '전체' });
    const twice = normalizeWallBoardForV2(once, { defaultTabTitle: '전체' });

    expect(twice).toEqual(once);
  });

  it('이미 v2.0 정규화된 보드 → schemaVersion 그대로 (idempotent)', () => {
    const v115 = readFixture<WallBoard>('wall-board-v115-sample.json');
    const once = normalizeWallBoardForV2(v115, { defaultTabTitle: '전체' });
    expect(once.schemaVersion).toBe('2.0');

    const twice = normalizeWallBoardForV2(once, { defaultTabTitle: '전체' });
    expect(twice.schemaVersion).toBe('2.0');
  });

  it('tabs 가 이미 존재하는 보드 → 기존 tabs 보존 (default 탭 미주입)', () => {
    const v115 = readFixture<WallBoard>('wall-board-v115-sample.json');
    const customTabs = [
      { id: 'tab-x', title: '커스텀X', permission: 'all' as const, order: 0 },
      { id: 'tab-y', title: '커스텀Y', permission: 'teacher-only' as const, order: 1 },
    ];
    const boardWithTabs: WallBoard = { ...v115, tabs: customTabs };

    const normalized = normalizeWallBoardForV2(boardWithTabs, { defaultTabTitle: '전체' });

    expect(normalized.tabs).toEqual(customTabs);
  });
});

// ---- tab-migration-01: 핵심 마이그레이션 동작 ----

describe('normalizeWallBoardForV2 — tab-migration-01 (Delta v3.1 AC)', () => {
  it('posts[].tabId 모두 DEFAULT_TAB_ID 로 백필', () => {
    const v115 = readFixture<WallBoard>('wall-board-v115-sample.json');
    const normalized = normalizeWallBoardForV2(v115, { defaultTabTitle: '전체' });

    for (const post of normalized.posts) {
      expect(post.tabId).toBe(DEFAULT_TAB_ID);
      expect(post.tabId).toBe('default');
    }
  });

  it('tabs 미존재 → default 탭 1개 주입 (title: 전체, permission: all, order: 0)', () => {
    const v115 = readFixture<WallBoard>('wall-board-v115-sample.json');
    const normalized = normalizeWallBoardForV2(v115, { defaultTabTitle: '전체' });

    expect(normalized.tabs).toHaveLength(1);
    expect(normalized.tabs?.[0]).toEqual({
      id: DEFAULT_TAB_ID,
      title: '전체',
      permission: 'all',
      order: 0,
    });
  });

  it('boardSettings 무손실 보존 + v2.0 default 보강 (requirePin: true)', () => {
    // β-Step11 (G012-C) — schemaVersion 부재 보드는 신규 v2.0 보드로 간주.
    // 기존 settings 의 값은 100% 보존 + 누락된 v2.0 필드(requirePin) 만 default true 주입.
    // legacy 보드가 명시적으로 requirePin: false 를 적어둔 경우는 그 값을 존중 (이 fixture 는 없음).
    const v115 = readFixture<WallBoard>('wall-board-v115-sample.json');
    const normalized = normalizeWallBoardForV2(v115, { defaultTabTitle: '전체' });

    // 기존 필드 보존
    expect(normalized.settings?.version).toBe(1);
    expect(normalized.settings?.moderation).toBe('off');
    // v2.0 default 보강 (Plan §2.2 Step 11 / release-checklist E-2)
    expect(normalized.settings?.requirePin).toBe(true);
  });

  it('shortCode 보존 (legacy 알파벳 6자리 호환 유지)', () => {
    const v115 = readFixture<WallBoard>('wall-board-v115-sample.json');
    const normalized = normalizeWallBoardForV2(v115, { defaultTabTitle: '전체' });

    expect(normalized.shortCode).toBe('ABC234');
  });
});

// ---- options.defaultTabTitle 동작 ----

describe('normalizeWallBoardForV2 — defaultTabTitle 옵션', () => {
  it('미지정 시 DEFAULT_TAB_ID 자체를 fallback (도메인-안전, 어댑터 미주입 케이스)', () => {
    const v115 = readFixture<WallBoard>('wall-board-v115-sample.json');
    const normalized = normalizeWallBoardForV2(v115); // 옵션 미전달

    expect(normalized.tabs?.[0]?.title).toBe('default');
    expect(normalized.tabs?.[0]?.title).toBe(DEFAULT_TAB_ID);
  });

  it('"전체" 명시 시 한국어 라벨 적용 (어댑터 caller 전달 케이스)', () => {
    const v115 = readFixture<WallBoard>('wall-board-v115-sample.json');
    const normalized = normalizeWallBoardForV2(v115, { defaultTabTitle: '전체' });

    expect(normalized.tabs?.[0]?.title).toBe('전체');
  });
});

// ---- normalizePostForRealtimeWallV2 (단일 post) ----

describe('normalizePostForRealtimeWallV2 — 단일 post 백필', () => {
  it('tabId 미존재 → DEFAULT_TAB_ID 백필', () => {
    const v115 = readFixture<WallBoard>('wall-board-v115-sample.json');
    const post = v115.posts[0]!;
    expect(post.tabId).toBeUndefined();

    const normalized = normalizePostForRealtimeWallV2(post);
    expect(normalized.tabId).toBe(DEFAULT_TAB_ID);
  });

  it('tabId 이미 존재 → 그대로 (idempotent)', () => {
    const post: RealtimeWallPost = {
      id: 'p',
      nickname: 'x',
      text: 'y',
      status: 'approved',
      pinned: false,
      submittedAt: 0,
      kanban: { columnId: 'c1', order: 0 },
      freeform: { x: 0, y: 0, w: 100, h: 100, zIndex: 0 },
      tabId: 'tab-custom',
    };

    const normalized = normalizePostForRealtimeWallV2(post);
    expect(normalized).toBe(post); // 같은 참조 (no clone when idempotent)
    expect(normalized.tabId).toBe('tab-custom');
  });
});

// ---- RealtimeWallBoard (라이브) variant ----

describe('normalizeRealtimeWallBoardForV2 — 라이브 보드 (schemaVersion 미적용)', () => {
  it('schemaVersion 필드 부여 안함 (라이브 entity 에 해당 필드 없음)', () => {
    const liveBoard = {
      title: '라이브 보드',
      layoutMode: 'grid' as const,
      columns: [],
      posts: [],
    };

    const normalized = normalizeRealtimeWallBoardForV2(liveBoard, { defaultTabTitle: '전체' });

    expect(normalized.tabs).toHaveLength(1);
    expect('schemaVersion' in normalized).toBe(false);
  });
});

// ---- 제네릭 normalizeBoardForRealtimeWallV2 ----

describe('normalizeBoardForRealtimeWallV2 — 제네릭 헬퍼', () => {
  it('빈 보드 (posts 0, tabs undefined) → default 탭 주입 + posts 빈 배열 유지', () => {
    // 입력 타입에 tabs?:를 명시해 normalizer 의 출력 타입 좁힘이 tabs 를 포함하도록 함.
    const empty: {
      readonly posts: readonly RealtimeWallPost[];
      readonly tabs?: readonly RealtimeWallTabConfig[];
    } = { posts: [] };

    const normalized = normalizeBoardForRealtimeWallV2(empty, { defaultTabTitle: '전체' });

    expect(normalized.posts).toHaveLength(0);
    expect(normalized.tabs).toHaveLength(1);
    expect(normalized.tabs?.[0]?.title).toBe('전체');
  });

  it('tabs 빈 배열도 default 탭 주입 (0개를 1개로 정규화)', () => {
    const board: {
      readonly posts: readonly RealtimeWallPost[];
      readonly tabs?: readonly RealtimeWallTabConfig[];
    } = { posts: [], tabs: [] };

    const normalized = normalizeBoardForRealtimeWallV2(board, { defaultTabTitle: '전체' });

    expect(normalized.tabs).toHaveLength(1);
  });
});
