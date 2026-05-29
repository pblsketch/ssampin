/**
 * β-Step3.5 — Realtime Wall WS 프로토콜 Zod 스키마 메타테스트.
 *
 * Plan §2.2 Step 3.5 / 회귀 보호 #2 SERVER_TRUSTED_BROADCAST.
 *
 * 검증:
 *   - 17 server messages discriminated union 정확
 *   - v2.0 신규 5종 정상 parse
 *   - 잘못된 페이로드 reject (학생 송신 신뢰 경계 단일 게이트)
 *   - REALTIME_WALL_SERVER_MESSAGE_COUNT 상수 정합
 */
import { describe, expect, it } from 'vitest';
import {
  REALTIME_WALL_PROTOCOL_VERSION,
  REALTIME_WALL_SERVER_MESSAGE_COUNT,
  REALTIME_WALL_V2_NEW_MESSAGE_COUNT,
  RealtimeWallClientMessageSchema,
  RealtimeWallServerMessageSchema,
  TabPermissionSchema,
  CardColorSchema,
} from '../realtimeWall';

describe('REALTIME_WALL_PROTOCOL_VERSION + counts', () => {
  it('프로토콜 버전이 v2.0.0', () => {
    expect(REALTIME_WALL_PROTOCOL_VERSION).toBe('2.0.0');
  });

  it('server message 17개 (12 v1.15 + 5 v2.0)', () => {
    expect(REALTIME_WALL_SERVER_MESSAGE_COUNT).toBe(17);
    expect(REALTIME_WALL_V2_NEW_MESSAGE_COUNT).toBe(5);
  });
});

describe('RealtimeWallServerMessageSchema — v1.15 12종', () => {
  it.each([
    [
      'wall-state',
      {
        type: 'wall-state',
        board: {
          title: '보드',
          layoutMode: 'kanban',
          columns: [],
          posts: [],
          studentFormLocked: false,
          settings: { version: 1, moderation: 'off' },
        },
      },
    ],
    [
      'post-added',
      {
        type: 'post-added',
        post: {
          id: 'p1',
          nickname: '학생',
          text: '내용',
          status: 'approved',
          pinned: false,
          submittedAt: 1,
        },
      },
    ],
    ['post-updated', { type: 'post-updated', postId: 'p1', patch: { pinned: true } }],
    ['post-removed', { type: 'post-removed', postId: 'p1' }],
    ['closed', { type: 'closed' }],
    ['error', { type: 'error', message: '오류' }],
    ['like-toggled', { type: 'like-toggled', postId: 'p1', likes: 3, likedBy: ['session-a'] }],
    [
      'comment-added',
      {
        type: 'comment-added',
        postId: 'p1',
        comment: {
          id: 'c1',
          nickname: '학생',
          text: '댓글',
          status: 'approved',
          createdAt: 1,
        },
      },
    ],
    ['comment-removed', { type: 'comment-removed', postId: 'p1', commentId: 'c1' }],
    ['student-form-locked', { type: 'student-form-locked', locked: true }],
    [
      'boardSettings-changed',
      { type: 'boardSettings-changed', settings: { version: 1, moderation: 'manual' } },
    ],
    [
      'nickname-changed',
      { type: 'nickname-changed', postIds: ['p1', 'p2'], newNickname: '새 이름' },
    ],
  ])('%s 정상 parse', (_label, msg) => {
    const result = RealtimeWallServerMessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });
});

describe('RealtimeWallServerMessageSchema — v2.0 신규 5종 (β-Step12)', () => {
  it('tab-added 정상 parse', () => {
    const result = RealtimeWallServerMessageSchema.safeParse({
      type: 'tab-added',
      tab: { id: 'tab-1', title: '새 탭', permission: 'all', order: 1 },
    });
    expect(result.success).toBe(true);
  });

  it('tab-deleted + orphanedPostIds', () => {
    const result = RealtimeWallServerMessageSchema.safeParse({
      type: 'tab-deleted',
      tabId: 'tab-1',
      orphanedPostIds: ['p1', 'p2'],
    });
    expect(result.success).toBe(true);
  });

  it('tab-renamed', () => {
    const result = RealtimeWallServerMessageSchema.safeParse({
      type: 'tab-renamed',
      tabId: 'tab-1',
      newTitle: '바뀐 이름',
    });
    expect(result.success).toBe(true);
  });

  it('tab-permission-changed', () => {
    const result = RealtimeWallServerMessageSchema.safeParse({
      type: 'tab-permission-changed',
      tabId: 'tab-1',
      permission: 'teacher-only',
    });
    expect(result.success).toBe(true);
  });

  it('post-tab-moved', () => {
    const result = RealtimeWallServerMessageSchema.safeParse({
      type: 'post-tab-moved',
      postId: 'p1',
      newTabId: 'tab-2',
    });
    expect(result.success).toBe(true);
  });
});

describe('RealtimeWallServerMessageSchema — reject 검증 (회귀 #2 SERVER_TRUSTED_BROADCAST)', () => {
  it('알 수 없는 type reject', () => {
    const result = RealtimeWallServerMessageSchema.safeParse({ type: 'unknown' });
    expect(result.success).toBe(false);
  });

  it('tab-added — 잘못된 permission reject', () => {
    const result = RealtimeWallServerMessageSchema.safeParse({
      type: 'tab-added',
      tab: { id: 'tab-1', title: '탭', permission: 'invalid-perm', order: 0 },
    });
    expect(result.success).toBe(false);
  });

  it('wall-state — settings 누락 reject', () => {
    const result = RealtimeWallServerMessageSchema.safeParse({
      type: 'wall-state',
      board: {
        title: '보드',
        layoutMode: 'kanban',
        columns: [],
        posts: [],
        studentFormLocked: false,
        // settings 누락
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('RealtimeWallClientMessageSchema — 학생 송신 검증', () => {
  it('submit 정상 + v2.0 tabId 옵션', () => {
    const result = RealtimeWallClientMessageSchema.safeParse({
      type: 'submit',
      nickname: '학생',
      text: '내용',
      tabId: 'tab-1',
    });
    expect(result.success).toBe(true);
  });

  it('submit — tabId 미지정도 통과 (서버가 default 백필)', () => {
    const result = RealtimeWallClientMessageSchema.safeParse({
      type: 'submit',
      nickname: '학생',
      text: '내용',
    });
    expect(result.success).toBe(true);
  });

  it('submit — 닉네임 빈 문자열 reject', () => {
    const result = RealtimeWallClientMessageSchema.safeParse({
      type: 'submit',
      nickname: '   ',
      text: '내용',
    });
    expect(result.success).toBe(false);
  });

  it('toggle-like / add-comment / edit-own-card / delete-own-card 모두 정상 parse', () => {
    expect(
      RealtimeWallClientMessageSchema.safeParse({ type: 'toggle-like', postId: 'p1' }).success,
    ).toBe(true);
    expect(
      RealtimeWallClientMessageSchema.safeParse({
        type: 'add-comment',
        postId: 'p1',
        nickname: '학생',
        text: '댓글',
      }).success,
    ).toBe(true);
    expect(
      RealtimeWallClientMessageSchema.safeParse({
        type: 'edit-own-card',
        postId: 'p1',
        text: '수정',
      }).success,
    ).toBe(true);
    expect(
      RealtimeWallClientMessageSchema.safeParse({
        type: 'delete-own-card',
        postId: 'p1',
      }).success,
    ).toBe(true);
  });

  it('add-comment — text 빈 문자열 reject', () => {
    const result = RealtimeWallClientMessageSchema.safeParse({
      type: 'add-comment',
      postId: 'p1',
      nickname: '학생',
      text: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('도메인 enum 정합 (TabPermission / CardColor)', () => {
  it('TabPermission 3종 enum', () => {
    expect(TabPermissionSchema.safeParse('all').success).toBe(true);
    expect(TabPermissionSchema.safeParse('teacher-only').success).toBe(true);
    expect(TabPermissionSchema.safeParse('role-gated').success).toBe(true);
    expect(TabPermissionSchema.safeParse('invalid').success).toBe(false);
  });

  it('CardColor 8색 enum', () => {
    const colors = ['white', 'yellow', 'pink', 'blue', 'green', 'purple', 'orange', 'gray'];
    for (const color of colors) {
      expect(CardColorSchema.safeParse(color).success).toBe(true);
    }
    expect(CardColorSchema.safeParse('rainbow').success).toBe(false);
  });
});
