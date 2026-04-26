/**
 * v1.14 Phase P2 (padlet mode) 도메인 규칙 단위 테스트.
 *
 * Design §10.1 — toggleStudentLike 6+, addStudentComment 6+, removeStudentComment 5+,
 * normalizePostForPadletMode 4, normalizeBoardForPadletMode 2.
 *
 * 순수 함수 검증 — UI/IPC 레이어와 독립.
 */
import { describe, expect, it } from 'vitest';
import type {
  RealtimeWallPost,
  WallBoard,
  WallBoardId,
} from '@domain/entities/RealtimeWall';
import {
  REALTIME_WALL_COMMENT_MAX_TEXT_LENGTH,
  REALTIME_WALL_MAX_COMMENTS_PER_POST,
  REALTIME_WALL_MAX_LIKED_BY,
  addStudentComment,
  normalizeBoardForPadletMode,
  normalizePostForPadletMode,
  removeStudentComment,
  toggleStudentLike,
} from './realtimeWallRules';

function createTestPost(overrides?: Partial<RealtimeWallPost>): RealtimeWallPost {
  return {
    id: 'post-1',
    nickname: '민수',
    text: '첫 댓글',
    status: 'approved',
    pinned: false,
    submittedAt: 1_700_000_000_000,
    kanban: { columnId: 'column-1', order: 0 },
    freeform: { x: 0, y: 0, w: 260, h: 180, zIndex: 1 },
    ...overrides,
  };
}

// =====================================================================
// toggleStudentLike (6+ cases)
// =====================================================================

describe('toggleStudentLike', () => {
  it('처음 누른 좋아요 → likes +1, likedBy에 sessionToken 추가', () => {
    const post = createTestPost();
    const result = toggleStudentLike(post, 'token-A');
    expect(result.likes).toBe(1);
    expect(result.likedBy).toEqual(['token-A']);
  });

  it('같은 토큰으로 두 번째 누름 → unlike (likes -1, likedBy에서 제거)', () => {
    const post = createTestPost({ likes: 1, likedBy: ['token-A'] });
    const result = toggleStudentLike(post, 'token-A');
    expect(result.likes).toBe(0);
    expect(result.likedBy).toEqual([]);
  });

  it('다른 토큰으로 like → likes +1, likedBy append', () => {
    const post = createTestPost({ likes: 1, likedBy: ['token-A'] });
    const result = toggleStudentLike(post, 'token-B');
    expect(result.likes).toBe(2);
    expect(result.likedBy).toEqual(['token-A', 'token-B']);
  });

  it('likedBy 1000개 도달 시 추가 like는 oldest drop 후 append (likes는 1000 유지)', () => {
    const fullLikedBy = Array.from({ length: REALTIME_WALL_MAX_LIKED_BY }, (_, i) => `token-${i}`);
    const post = createTestPost({ likes: REALTIME_WALL_MAX_LIKED_BY, likedBy: fullLikedBy });
    const result = toggleStudentLike(post, 'token-new');
    expect(result.likedBy?.length).toBe(REALTIME_WALL_MAX_LIKED_BY);
    expect(result.likedBy?.[0]).toBe('token-1'); // token-0이 drop됨
    expect(result.likedBy?.[REALTIME_WALL_MAX_LIKED_BY - 1]).toBe('token-new');
    expect(result.likes).toBe(REALTIME_WALL_MAX_LIKED_BY);
  });

  it('likes가 음수로 저장되어 있어도 unlike 후 min 0 유지', () => {
    // 이론상 발생 안 하지만 방어 코드 검증
    const post = createTestPost({ likes: 0, likedBy: ['token-A'] });
    const result = toggleStudentLike(post, 'token-A');
    expect(result.likes).toBe(0);
    expect(result.likedBy).toEqual([]);
  });

  it('빈 likedBy + likes 0 → like 시 likes 1', () => {
    const post = createTestPost({ likes: 0, likedBy: [] });
    const result = toggleStudentLike(post, 'token-A');
    expect(result.likes).toBe(1);
    expect(result.likedBy).toEqual(['token-A']);
  });

  it('기존 다른 필드(nickname/text/pinned)는 보존', () => {
    const post = createTestPost({ pinned: true, text: '원본 본문' });
    const result = toggleStudentLike(post, 'token-A');
    expect(result.pinned).toBe(true);
    expect(result.text).toBe('원본 본문');
    expect(result.id).toBe(post.id);
  });
});

// =====================================================================
// addStudentComment (6+ cases)
// =====================================================================

describe('addStudentComment', () => {
  it('정상 입력 → comments 길이 +1, id/submittedAt 정상', () => {
    const post = createTestPost();
    const result = addStudentComment(
      post,
      { nickname: '영희', text: '좋은 생각이에요', sessionToken: 'token-X' },
      'comment-1',
      1_700_000_100_000,
    );
    expect(result.comments?.length).toBe(1);
    expect(result.comments?.[0]).toMatchObject({
      id: 'comment-1',
      nickname: '영희',
      text: '좋은 생각이에요',
      submittedAt: 1_700_000_100_000,
      status: 'approved',
      sessionToken: 'token-X',
    });
  });

  it('trim 후 빈 닉네임 → 원본 반환', () => {
    const post = createTestPost();
    const result = addStudentComment(
      post,
      { nickname: '   ', text: '내용', sessionToken: 'token-X' },
      'comment-1',
      1_700_000_100_000,
    );
    expect(result).toBe(post); // 원본 그대로
  });

  it('trim 후 빈 본문 → 원본 반환', () => {
    const post = createTestPost();
    const result = addStudentComment(
      post,
      { nickname: '영희', text: '  \n\t  ', sessionToken: 'token-X' },
      'comment-1',
      1_700_000_100_000,
    );
    expect(result).toBe(post);
  });

  it('201자 본문 → 200자로 truncate', () => {
    const post = createTestPost();
    const longText = 'A'.repeat(201);
    const result = addStudentComment(
      post,
      { nickname: '영희', text: longText, sessionToken: 'token-X' },
      'comment-1',
      1_700_000_100_000,
    );
    expect(result.comments?.[0]?.text.length).toBe(REALTIME_WALL_COMMENT_MAX_TEXT_LENGTH);
  });

  it('50개 댓글 도달 시 51번째 추가 거부 (원본 반환)', () => {
    const existingComments = Array.from({ length: REALTIME_WALL_MAX_COMMENTS_PER_POST }, (_, i) => ({
      id: `c-${i}`,
      nickname: '학생',
      text: `댓글 ${i}`,
      submittedAt: 1_700_000_000_000 + i,
      sessionToken: `t-${i}`,
      status: 'approved' as const,
    }));
    const post = createTestPost({ comments: existingComments });
    const result = addStudentComment(
      post,
      { nickname: '영희', text: '추가', sessionToken: 'token-X' },
      'comment-new',
      1_700_000_100_000,
    );
    expect(result).toBe(post);
    expect(result.comments?.length).toBe(REALTIME_WALL_MAX_COMMENTS_PER_POST);
  });

  it('닉네임 trim 적용: "   민수   " → "민수"', () => {
    const post = createTestPost();
    const result = addStudentComment(
      post,
      { nickname: '   민수   ', text: '안녕', sessionToken: 'token-X' },
      'comment-1',
      1_700_000_100_000,
    );
    expect(result.comments?.[0]?.nickname).toBe('민수');
  });

  it('20자 초과 닉네임 → 20자로 truncate', () => {
    const post = createTestPost();
    const longNickname = '닉'.repeat(25);
    const result = addStudentComment(
      post,
      { nickname: longNickname, text: '내용', sessionToken: 'token-X' },
      'comment-1',
      1_700_000_100_000,
    );
    expect(result.comments?.[0]?.nickname.length).toBe(20);
  });

  it('기존 comments에 append (기존 댓글 보존)', () => {
    const existing = {
      id: 'c-existing',
      nickname: '기존',
      text: '기존 댓글',
      submittedAt: 1_700_000_000_000,
      sessionToken: 't-existing',
      status: 'approved' as const,
    };
    const post = createTestPost({ comments: [existing] });
    const result = addStudentComment(
      post,
      { nickname: '새', text: '새 댓글', sessionToken: 'token-X' },
      'comment-new',
      1_700_000_100_000,
    );
    expect(result.comments?.length).toBe(2);
    expect(result.comments?.[0]).toEqual(existing);
    expect(result.comments?.[1]?.id).toBe('comment-new');
  });
});

// =====================================================================
// removeStudentComment (5+ cases)
// =====================================================================

describe('removeStudentComment', () => {
  const baseComments = [
    { id: 'c-1', nickname: 'A', text: '첫', submittedAt: 1, sessionToken: 'ta', status: 'approved' as const },
    { id: 'c-2', nickname: 'B', text: '둘', submittedAt: 2, sessionToken: 'tb', status: 'approved' as const },
  ];

  it('정상 삭제 → 해당 댓글 status="hidden"으로 전환 (배열 길이 보존)', () => {
    const post = createTestPost({ comments: baseComments });
    const result = removeStudentComment(post, 'c-1');
    expect(result.comments?.length).toBe(2); // 인덱스 보존
    expect(result.comments?.[0]?.status).toBe('hidden');
    expect(result.comments?.[1]?.status).toBe('approved');
  });

  it('commentId 미존재 → 원본 반환 (참조 동일)', () => {
    const post = createTestPost({ comments: baseComments });
    const result = removeStudentComment(post, 'c-nonexistent');
    expect(result).toBe(post);
  });

  it('빈 comments에서 삭제 시도 → 원본 반환', () => {
    const post = createTestPost({ comments: [] });
    const result = removeStudentComment(post, 'c-1');
    expect(result).toBe(post);
  });

  it('comments 필드 미정의 카드 → 원본 반환 (정규화 안 해도 안전)', () => {
    const post = createTestPost();
    // comments 의도적 생략
    const result = removeStudentComment(post, 'c-any');
    expect(result).toBe(post);
  });

  it('같은 commentId 두 번 호출 (멱등성): 두 번째도 hidden 유지', () => {
    const post = createTestPost({ comments: baseComments });
    const first = removeStudentComment(post, 'c-1');
    const second = removeStudentComment(first, 'c-1');
    expect(second.comments?.[0]?.status).toBe('hidden');
    expect(second.comments?.length).toBe(2);
  });

  it('다른 댓글들의 status는 영향 없음', () => {
    const post = createTestPost({ comments: baseComments });
    const result = removeStudentComment(post, 'c-1');
    expect(result.comments?.[1]?.status).toBe('approved');
  });
});

// =====================================================================
// normalizePostForPadletMode (4 cases)
// =====================================================================

describe('normalizePostForPadletMode', () => {
  it('v1.13 데이터(likes/likedBy/comments 미정의) → 기본값 0/[]/[] 주입', () => {
    const post = createTestPost();
    const result = normalizePostForPadletMode(post);
    expect(result.likes).toBe(0);
    expect(result.likedBy).toEqual([]);
    expect(result.comments).toEqual([]);
  });

  it('기존 값이 있으면 보존 (likes=5, likedBy=[...], comments=[...])', () => {
    const comment = { id: 'c1', nickname: 'A', text: '본문', submittedAt: 1, sessionToken: 't', status: 'approved' as const };
    const post = createTestPost({
      likes: 5,
      likedBy: ['ta', 'tb', 'tc', 'td', 'te'],
      comments: [comment],
    });
    const result = normalizePostForPadletMode(post);
    expect(result.likes).toBe(5);
    expect(result.likedBy).toEqual(['ta', 'tb', 'tc', 'td', 'te']);
    expect(result.comments).toEqual([comment]);
  });

  it('기존 다른 필드(teacherHearts/pinned/kanban)는 영향 없음', () => {
    const post = createTestPost({ teacherHearts: 3, pinned: true });
    const result = normalizePostForPadletMode(post);
    expect(result.teacherHearts).toBe(3);
    expect(result.pinned).toBe(true);
    expect(result.kanban).toEqual(post.kanban);
  });

  it('일부만 있고 일부 없으면 없는 것만 주입 (likes만 존재)', () => {
    const post = createTestPost({ likes: 7 });
    const result = normalizePostForPadletMode(post);
    expect(result.likes).toBe(7);
    expect(result.likedBy).toEqual([]);
    expect(result.comments).toEqual([]);
  });
});

// =====================================================================
// normalizeBoardForPadletMode (2 cases)
// =====================================================================

describe('normalizeBoardForPadletMode', () => {
  function makeBoard(posts: readonly RealtimeWallPost[]): WallBoard {
    return {
      id: 'wb-1' as WallBoardId,
      title: '테스트',
      layoutMode: 'kanban',
      columns: [
        { id: 'column-1', title: 'A', order: 0 },
        { id: 'column-2', title: 'B', order: 1 },
      ],
      approvalMode: 'manual',
      posts,
      createdAt: 1,
      updatedAt: 1,
    };
  }

  it('빈 posts 보드 → posts=[] 그대로', () => {
    const board = makeBoard([]);
    const result = normalizeBoardForPadletMode(board);
    expect(result.posts).toEqual([]);
    expect(result.title).toBe('테스트');
  });

  it('다중 posts 보드 → 각 post에 normalizePostForPadletMode 적용', () => {
    const p1 = createTestPost({ id: 'p-1' });
    const p2 = createTestPost({ id: 'p-2', likes: 3, likedBy: ['ta', 'tb', 'tc'] });
    const board = makeBoard([p1, p2]);
    const result = normalizeBoardForPadletMode(board);
    expect(result.posts.length).toBe(2);
    expect(result.posts[0]?.likes).toBe(0);
    expect(result.posts[0]?.likedBy).toEqual([]);
    expect(result.posts[0]?.comments).toEqual([]);
    expect(result.posts[1]?.likes).toBe(3);
    expect(result.posts[1]?.likedBy).toEqual(['ta', 'tb', 'tc']);
    expect(result.posts[1]?.comments).toEqual([]);
  });
});
