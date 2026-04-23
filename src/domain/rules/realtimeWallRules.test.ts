import { describe, expect, it } from 'vitest';
import type { RealtimeWallColumn, RealtimeWallPost } from '@domain/entities/RealtimeWall';
import {
  approveRealtimeWallPost,
  buildRealtimeWallColumns,
  classifyRealtimeWallLink,
  createDefaultFreeformPosition,
  createPendingRealtimeWallPost,
  extractYoutubeVideoId,
  heartRealtimeWallPost,
  hideRealtimeWallPost,
  normalizeRealtimeWallLink,
  REALTIME_WALL_MAX_HEARTS,
  sortRealtimeWallPostsForBoard,
  togglePinRealtimeWallPost,
} from './realtimeWallRules';

describe('buildRealtimeWallColumns', () => {
  it('빈 제목을 제거하고 순서를 다시 매긴다', () => {
    expect(buildRealtimeWallColumns([' 질문 ', '', '정리 '])).toEqual([
      { id: 'column-1', title: '질문', order: 0 },
      { id: 'column-2', title: '정리', order: 1 },
    ]);
  });

  it('유효한 제목이 2개 미만이면 기본 컬럼으로 대체한다', () => {
    expect(buildRealtimeWallColumns(['토론'])).toEqual([
      { id: 'column-1', title: '생각', order: 0 },
      { id: 'column-2', title: '질문', order: 1 },
      { id: 'column-3', title: '정리', order: 2 },
    ]);
  });
});

describe('normalizeRealtimeWallLink', () => {
  it('http/https 링크는 정규화해서 반환한다', () => {
    expect(normalizeRealtimeWallLink(' https://example.com/path?q=1 ')).toBe(
      'https://example.com/path?q=1',
    );
  });

  it('빈 문자열은 undefined를 반환한다', () => {
    expect(normalizeRealtimeWallLink('   ')).toBeUndefined();
  });

  it('http/https 외 스킴은 거부한다', () => {
    expect(normalizeRealtimeWallLink('javascript:alert(1)')).toBeUndefined();
    expect(normalizeRealtimeWallLink('ftp://example.com')).toBeUndefined();
  });

  it('유효하지 않은 URL은 거부한다', () => {
    expect(normalizeRealtimeWallLink('not a url')).toBeUndefined();
  });
});

describe('createDefaultFreeformPosition', () => {
  it('인덱스에 따라 3열 그리드로 배치한다', () => {
    expect(createDefaultFreeformPosition(0)).toMatchObject({ x: 24, y: 24, w: 260, h: 180 });
    expect(createDefaultFreeformPosition(1)).toMatchObject({ x: 316, y: 24, w: 260, h: 180 });
    expect(createDefaultFreeformPosition(3)).toMatchObject({ x: 24, y: 232, w: 260, h: 180 });
  });
});

describe('sortRealtimeWallPostsForBoard', () => {
  it('고정 글 우선, 그다음 최신순으로 정렬한다', () => {
    const sorted = sortRealtimeWallPostsForBoard([
      {
        id: 'a',
        nickname: '가',
        text: '첫 글',
        status: 'approved',
        pinned: false,
        submittedAt: 1,
        kanban: { columnId: 'column-1', order: 0 },
        freeform: { x: 0, y: 0, w: 1, h: 1, zIndex: 1 },
      },
      {
        id: 'b',
        nickname: '나',
        text: '둘째 글',
        status: 'approved',
        pinned: true,
        submittedAt: 2,
        kanban: { columnId: 'column-1', order: 1 },
        freeform: { x: 0, y: 0, w: 1, h: 1, zIndex: 2 },
      },
      {
        id: 'c',
        nickname: '다',
        text: '셋째 글',
        status: 'approved',
        pinned: false,
        submittedAt: 3,
        kanban: { columnId: 'column-1', order: 2 },
        freeform: { x: 0, y: 0, w: 1, h: 1, zIndex: 3 },
      },
    ]);

    expect(sorted.map((post) => post.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('approveRealtimeWallPost', () => {
  const columns: RealtimeWallColumn[] = [
    { id: 'column-1', title: '생각', order: 0 },
    { id: 'column-2', title: '질문', order: 1 },
  ];

  function makePost(overrides: Partial<RealtimeWallPost> & { id: string }): RealtimeWallPost {
    return {
      nickname: '학생',
      text: '내용',
      status: 'pending',
      pinned: false,
      submittedAt: 1000,
      kanban: { columnId: 'column-1', order: 0 },
      freeform: { x: 0, y: 0, w: 260, h: 180, zIndex: 1 },
      ...overrides,
    };
  }

  it('pending 카드를 approved로 승격하며 기존 컬럼을 유지한다', () => {
    const posts = [
      makePost({ id: 'p1', status: 'approved', kanban: { columnId: 'column-2', order: 0 } }),
      makePost({ id: 'p2', status: 'pending', kanban: { columnId: 'column-2', order: 0 } }),
    ];

    const result = approveRealtimeWallPost(posts, 'p2', columns);
    const approved = result.find((p) => p.id === 'p2')!;

    expect(approved.status).toBe('approved');
    expect(approved.kanban.columnId).toBe('column-2');
    expect(approved.kanban.order).toBe(1);
  });

  it('hidden 카드 복구에도 동일 로직이 적용된다', () => {
    const posts = [
      makePost({ id: 'p1', status: 'approved', kanban: { columnId: 'column-1', order: 0 } }),
      makePost({ id: 'p2', status: 'hidden', kanban: { columnId: 'column-1', order: 3 } }),
    ];

    const result = approveRealtimeWallPost(posts, 'p2', columns);
    const restored = result.find((p) => p.id === 'p2')!;

    expect(restored.status).toBe('approved');
    expect(restored.kanban.order).toBe(1);
  });

  it('대상 post의 컬럼이 현재 컬럼 목록에 없으면 첫 컬럼으로 fallback', () => {
    const posts = [
      makePost({ id: 'p1', status: 'pending', kanban: { columnId: 'column-9-deleted', order: 5 } }),
    ];

    const result = approveRealtimeWallPost(posts, 'p1', columns);
    const approved = result[0]!;

    expect(approved.kanban.columnId).toBe('column-1');
    expect(approved.kanban.order).toBe(0);
  });

  it('zIndex는 전체 posts의 최댓값 + 1로 승격된다', () => {
    const posts = [
      makePost({ id: 'p1', status: 'approved', freeform: { x: 0, y: 0, w: 260, h: 180, zIndex: 42 } }),
      makePost({ id: 'p2', status: 'pending', freeform: { x: 0, y: 0, w: 260, h: 180, zIndex: 3 } }),
    ];

    const result = approveRealtimeWallPost(posts, 'p2', columns);
    const approved = result.find((p) => p.id === 'p2')!;

    expect(approved.freeform.zIndex).toBe(43);
  });

  it('존재하지 않는 postId는 posts를 변경하지 않는다', () => {
    const posts = [makePost({ id: 'p1', status: 'approved' })];
    const result = approveRealtimeWallPost(posts, 'missing', columns);
    expect(result).toEqual(posts);
  });
});

describe('extractYoutubeVideoId', () => {
  it('표준 watch URL에서 v 파라미터를 추출', () => {
    expect(extractYoutubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYoutubeVideoId('https://youtube.com/watch?v=dQw4w9WgXcQ&t=30')).toBe('dQw4w9WgXcQ');
  });

  it('youtu.be 단축 URL 지원', () => {
    expect(extractYoutubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYoutubeVideoId('https://youtu.be/dQw4w9WgXcQ?si=abc')).toBe('dQw4w9WgXcQ');
  });

  it('shorts / embed / v / live 경로 지원', () => {
    expect(extractYoutubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYoutubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYoutubeVideoId('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('m.youtube.com / music.youtube.com 호스트 지원', () => {
    expect(extractYoutubeVideoId('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYoutubeVideoId('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('유효하지 않은 videoId 길이는 거부', () => {
    expect(extractYoutubeVideoId('https://youtu.be/short')).toBeUndefined();
    expect(extractYoutubeVideoId('https://www.youtube.com/watch?v=tooLongId1234567')).toBeUndefined();
  });

  it('유튜브가 아닌 호스트는 undefined', () => {
    expect(extractYoutubeVideoId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeUndefined();
    expect(extractYoutubeVideoId('https://fakeyoutube.com/watch?v=dQw4w9WgXcQ')).toBeUndefined();
  });

  it('http/https 외 스킴 거부', () => {
    expect(extractYoutubeVideoId('javascript:alert(1)')).toBeUndefined();
    expect(extractYoutubeVideoId('file:///etc/passwd')).toBeUndefined();
  });

  it('URL 파싱 실패는 undefined', () => {
    expect(extractYoutubeVideoId('not a url')).toBeUndefined();
    expect(extractYoutubeVideoId('')).toBeUndefined();
  });
});

describe('heartRealtimeWallPost', () => {
  function makeHeartablePost(overrides: Partial<RealtimeWallPost> & { id: string }): RealtimeWallPost {
    return {
      nickname: '학생',
      text: '내용',
      status: 'approved',
      pinned: false,
      submittedAt: 1000,
      kanban: { columnId: 'column-1', order: 0 },
      freeform: { x: 0, y: 0, w: 260, h: 180, zIndex: 1 },
      ...overrides,
    };
  }

  it('teacherHearts 미설정 카드는 0 → 1로 증가', () => {
    const posts = [makeHeartablePost({ id: 'p1' })];
    const result = heartRealtimeWallPost(posts, 'p1');
    expect(result[0]!.teacherHearts).toBe(1);
  });

  it('기존 teacherHearts는 +1 증가', () => {
    const posts = [makeHeartablePost({ id: 'p1', teacherHearts: 3 })];
    const result = heartRealtimeWallPost(posts, 'p1');
    expect(result[0]!.teacherHearts).toBe(4);
  });

  it('상한 REALTIME_WALL_MAX_HEARTS를 초과하지 않음', () => {
    const posts = [makeHeartablePost({ id: 'p1', teacherHearts: REALTIME_WALL_MAX_HEARTS })];
    const result = heartRealtimeWallPost(posts, 'p1');
    expect(result[0]!.teacherHearts).toBe(REALTIME_WALL_MAX_HEARTS);
  });

  it('존재하지 않는 postId는 posts 변경 없음', () => {
    const posts = [makeHeartablePost({ id: 'p1', teacherHearts: 5 })];
    const result = heartRealtimeWallPost(posts, 'missing');
    expect(result).toEqual(posts);
  });

  it('같은 배열 내 다른 post는 건드리지 않음', () => {
    const posts = [
      makeHeartablePost({ id: 'p1', teacherHearts: 2 }),
      makeHeartablePost({ id: 'p2', teacherHearts: 5 }),
    ];
    const result = heartRealtimeWallPost(posts, 'p1');
    expect(result[0]!.teacherHearts).toBe(3);
    expect(result[1]!.teacherHearts).toBe(5);
  });
});

describe('createPendingRealtimeWallPost', () => {
  const columns: RealtimeWallColumn[] = [
    { id: 'column-1', title: '생각', order: 0 },
    { id: 'column-2', title: '질문', order: 1 },
  ];

  it('linkUrl 없는 기본 제출은 pending + 첫 컬럼 + order=0', () => {
    const post = createPendingRealtimeWallPost(
      { id: 's1', nickname: '민수', text: '안녕', submittedAt: 1000 },
      [],
      columns,
    );
    expect(post).toMatchObject({
      id: 's1',
      nickname: '민수',
      text: '안녕',
      status: 'pending',
      pinned: false,
      submittedAt: 1000,
      kanban: { columnId: 'column-1', order: 0 },
    });
    expect(post.linkUrl).toBeUndefined();
    expect(post.linkPreview).toBeUndefined();
    expect(post.freeform.zIndex).toBe(1);
  });

  it('YouTube 링크는 linkPreview.kind = youtube로 즉시 분류', () => {
    const post = createPendingRealtimeWallPost(
      {
        id: 's1',
        nickname: '지연',
        text: '이거 보세요',
        linkUrl: 'https://youtu.be/dQw4w9WgXcQ',
        submittedAt: 1000,
      },
      [],
      columns,
    );
    expect(post.linkUrl).toBe('https://youtu.be/dQw4w9WgXcQ');
    expect(post.linkPreview).toEqual({ kind: 'youtube', videoId: 'dQw4w9WgXcQ' });
  });

  it('일반 웹페이지 링크는 linkPreview.kind = webpage 빈 shell', () => {
    const post = createPendingRealtimeWallPost(
      {
        id: 's1',
        nickname: '지연',
        text: '',
        linkUrl: 'https://example.com/article',
        submittedAt: 1000,
      },
      [],
      columns,
    );
    expect(post.linkPreview).toEqual({ kind: 'webpage' });
  });

  it('무효 스킴의 linkUrl은 완전 제거', () => {
    const post = createPendingRealtimeWallPost(
      {
        id: 's1',
        nickname: '지연',
        text: '',
        linkUrl: 'javascript:alert(1)',
        submittedAt: 1000,
      },
      [],
      columns,
    );
    expect(post.linkUrl).toBeUndefined();
    expect(post.linkPreview).toBeUndefined();
  });

  it('기존 approved 카드 수로 order 계산', () => {
    const existing: RealtimeWallPost[] = [
      {
        id: 'a',
        nickname: '가',
        text: '',
        status: 'approved',
        pinned: false,
        submittedAt: 100,
        kanban: { columnId: 'column-1', order: 0 },
        freeform: { x: 0, y: 0, w: 260, h: 180, zIndex: 1 },
      },
      {
        id: 'b',
        nickname: '나',
        text: '',
        status: 'approved',
        pinned: false,
        submittedAt: 200,
        kanban: { columnId: 'column-1', order: 1 },
        freeform: { x: 0, y: 0, w: 260, h: 180, zIndex: 2 },
      },
      {
        id: 'c',
        nickname: '다',
        text: '',
        status: 'pending',
        pinned: false,
        submittedAt: 300,
        kanban: { columnId: 'column-1', order: 0 },
        freeform: { x: 0, y: 0, w: 260, h: 180, zIndex: 3 },
      },
    ];
    const post = createPendingRealtimeWallPost(
      { id: 's1', nickname: '라', text: '', submittedAt: 400 },
      existing,
      columns,
    );
    // pending은 제외되고 approved 2개만 카운트
    expect(post.kanban.order).toBe(2);
    // freeform zIndex는 existingPosts.length(=3) 인덱스 기반
    expect(post.freeform.zIndex).toBe(4);
  });

  it('columns 비어있으면 fallback column-1', () => {
    const post = createPendingRealtimeWallPost(
      { id: 's1', nickname: '학생', text: '', submittedAt: 1 },
      [],
      [],
    );
    expect(post.kanban.columnId).toBe('column-1');
  });
});

describe('hideRealtimeWallPost', () => {
  it('지정 post를 hidden으로 전환', () => {
    const posts: RealtimeWallPost[] = [
      {
        id: 'p1',
        nickname: '가',
        text: '',
        status: 'approved',
        pinned: false,
        submittedAt: 1,
        kanban: { columnId: 'column-1', order: 0 },
        freeform: { x: 0, y: 0, w: 260, h: 180, zIndex: 1 },
      },
    ];
    const result = hideRealtimeWallPost(posts, 'p1');
    expect(result[0]!.status).toBe('hidden');
  });

  it('없는 postId는 불변', () => {
    const posts: RealtimeWallPost[] = [
      {
        id: 'p1',
        nickname: '가',
        text: '',
        status: 'approved',
        pinned: false,
        submittedAt: 1,
        kanban: { columnId: 'column-1', order: 0 },
        freeform: { x: 0, y: 0, w: 260, h: 180, zIndex: 1 },
      },
    ];
    const result = hideRealtimeWallPost(posts, 'missing');
    expect(result[0]!.status).toBe('approved');
  });
});

describe('togglePinRealtimeWallPost', () => {
  function makePinnablePost(overrides: Partial<RealtimeWallPost> & { id: string }): RealtimeWallPost {
    return {
      nickname: '학생',
      text: '',
      status: 'approved',
      pinned: false,
      submittedAt: 1,
      kanban: { columnId: 'column-1', order: 0 },
      freeform: { x: 0, y: 0, w: 260, h: 180, zIndex: 1 },
      ...overrides,
    };
  }

  it('pinned false → true 전환 + zIndex 승격', () => {
    const posts = [
      makePinnablePost({ id: 'p1', pinned: false, freeform: { x: 0, y: 0, w: 260, h: 180, zIndex: 3 } }),
      makePinnablePost({ id: 'p2', pinned: false, freeform: { x: 0, y: 0, w: 260, h: 180, zIndex: 7 } }),
    ];
    const result = togglePinRealtimeWallPost(posts, 'p1');
    expect(result[0]!.pinned).toBe(true);
    expect(result[0]!.freeform.zIndex).toBe(8); // max+1
  });

  it('pinned true → false 전환 (zIndex 는 여전히 승격)', () => {
    const posts = [
      makePinnablePost({ id: 'p1', pinned: true, freeform: { x: 0, y: 0, w: 260, h: 180, zIndex: 2 } }),
    ];
    const result = togglePinRealtimeWallPost(posts, 'p1');
    expect(result[0]!.pinned).toBe(false);
    expect(result[0]!.freeform.zIndex).toBe(3);
  });

  it('없는 postId는 불변', () => {
    const posts = [makePinnablePost({ id: 'p1', pinned: false })];
    const result = togglePinRealtimeWallPost(posts, 'missing');
    expect(result[0]!.pinned).toBe(false);
  });
});

describe('classifyRealtimeWallLink', () => {
  it('YouTube URL은 youtube kind 반환', () => {
    expect(classifyRealtimeWallLink('https://youtu.be/dQw4w9WgXcQ')).toEqual({
      kind: 'youtube',
      videoId: 'dQw4w9WgXcQ',
    });
  });

  it('일반 http(s) URL은 webpage kind 반환 (OG는 빈 shell)', () => {
    expect(classifyRealtimeWallLink('https://example.com/article')).toEqual({
      kind: 'webpage',
    });
  });

  it('유효하지 않은 URL은 undefined', () => {
    expect(classifyRealtimeWallLink('ftp://example.com')).toBeUndefined();
    expect(classifyRealtimeWallLink('javascript:alert(1)')).toBeUndefined();
    expect(classifyRealtimeWallLink('')).toBeUndefined();
  });
});
