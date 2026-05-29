/**
 * v2.0 (β-Step4) — MigrateWallBoardToV2 use case 단위 테스트.
 *
 * Plan §4 β-Step4 / Delta v3.1 §2 Step 4.
 *
 * 검증:
 *   - 미마이그레이션 보드 → migrated=true + schemaVersion='2.0' + tabs/tabId 백필
 *   - 이미 v2.0 보드 → migrated=false (idempotent fast-path)
 *   - 무손실 (기존 모든 필드 보존)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { migrateWallBoardToV2 } from '../MigrateWallBoardToV2';
import { DEFAULT_TAB_ID } from '@domain/entities/RealtimeWallTabConfig';
import type { WallBoard } from '@domain/entities/RealtimeWall';

const fixturesDir = path.resolve('tests/fixtures');

function readFixture<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), 'utf-8')) as T;
}

describe('migrateWallBoardToV2', () => {
  it('v1.15 보드 → migrated=true + schemaVersion="2.0" + tabs/tabId 백필', () => {
    const v115 = readFixture<WallBoard>('wall-board-v115-sample.json');
    expect(v115.schemaVersion).toBeUndefined();
    expect(v115.tabs).toBeUndefined();

    const result = migrateWallBoardToV2(v115, { defaultTabTitle: '전체' });

    expect(result.migrated).toBe(true);
    expect(result.board.schemaVersion).toBe('2.0');
    expect(result.board.tabs).toHaveLength(1);
    expect(result.board.tabs?.[0]?.id).toBe(DEFAULT_TAB_ID);
    expect(result.board.tabs?.[0]?.title).toBe('전체');
    for (const post of result.board.posts) {
      expect(post.tabId).toBe(DEFAULT_TAB_ID);
    }
  });

  it('이미 v2.0 보드 → migrated=false (idempotent fast-path)', () => {
    const v2 = readFixture<WallBoard>('wall-board-v2-expected.json');
    expect(v2.schemaVersion).toBe('2.0');

    const result = migrateWallBoardToV2(v2, { defaultTabTitle: '전체' });

    expect(result.migrated).toBe(false);
    expect(result.board).toEqual(v2); // 변화 없음
  });

  it('v1.15 → migration 결과가 v2 expected fixture 와 deep-equal (무손실 검증)', () => {
    const v115 = readFixture<WallBoard>('wall-board-v115-sample.json');
    const expected = readFixture<WallBoard>('wall-board-v2-expected.json');

    const result = migrateWallBoardToV2(v115, { defaultTabTitle: '전체' });

    expect(result.board).toEqual(expected);
  });

  it('defaultTabTitle 미지정 → 도메인-안전 fallback (DEFAULT_TAB_ID 자체)', () => {
    const v115 = readFixture<WallBoard>('wall-board-v115-sample.json');

    const result = migrateWallBoardToV2(v115); // 옵션 미전달

    expect(result.migrated).toBe(true);
    expect(result.board.tabs?.[0]?.title).toBe('default');
    expect(result.board.tabs?.[0]?.title).toBe(DEFAULT_TAB_ID);
  });

  it('이중 호출 idempotent (한 번 더 migrate 해도 결과 동일)', () => {
    const v115 = readFixture<WallBoard>('wall-board-v115-sample.json');

    const once = migrateWallBoardToV2(v115, { defaultTabTitle: '전체' });
    expect(once.migrated).toBe(true);

    const twice = migrateWallBoardToV2(once.board, { defaultTabTitle: '전체' });
    expect(twice.migrated).toBe(false);
    expect(twice.board).toEqual(once.board);
  });
});
