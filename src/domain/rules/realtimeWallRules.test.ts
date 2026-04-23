import { describe, expect, it } from 'vitest';
import type {
  RealtimeWallColumn,
  RealtimeWallPost,
  WallApprovalMode,
  WallBoard,
  WallBoardId,
} from '@domain/entities/RealtimeWall';
import {
  approveRealtimeWallPost,
  buildRealtimeWallColumns,
  buildWallPreviewPosts,
  bulkApproveWallPosts,
  classifyRealtimeWallLink,
  createDefaultFreeformPosition,
  createPendingRealtimeWallPost,
  createWallBoard,
  createWallPost,
  extractYoutubeVideoId,
  generateUniqueWallShortCode,
  generateWallShortCode,
  heartRealtimeWallPost,
  hideRealtimeWallPost,
  normalizeRealtimeWallLink,
  REALTIME_WALL_MAX_HEARTS,
  sortRealtimeWallPostsForBoard,
  togglePinRealtimeWallPost,
  toWallBoardMeta,
  WALL_SHORT_CODE_LENGTH,
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

// ============================================================
// v1.13 Stage A — WallBoard 영속화 규칙 테스트
// Design §3.1 / §3.5.1a / §8.1
// ============================================================

describe('generateWallShortCode', () => {
  it('6자 영숫자 코드를 생성한다', () => {
    const code = generateWallShortCode();
    expect(code).toHaveLength(WALL_SHORT_CODE_LENGTH);
    // 0/O/1/I는 알파벳에 포함되지 않아야 한다
    expect(code).not.toMatch(/[01OI]/);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]+$/);
  });

  it('randomSource 주입으로 결정적 코드 생성', () => {
    const seq = [0, 0.1, 0.2, 0.3, 0.4, 0.5];
    let i = 0;
    const rng = (): number => seq[i++] ?? 0;
    const code = generateWallShortCode(rng);
    expect(code).toHaveLength(WALL_SHORT_CODE_LENGTH);
    // 결정적 입력 → 결정적 출력
    let j = 0;
    const rng2 = (): number => seq[j++] ?? 0;
    expect(generateWallShortCode(rng2)).toBe(code);
  });

  it('generateUniqueWallShortCode는 기존 코드와 충돌 시 재시도', () => {
    // 첫 3회는 'AAAAAA'(rng=0), 네 번째부터 'HHHHHH'(rng=0.25*32=8th 근방)
    // 여기서는 단순히 2개 충돌 후 성공 확인
    let calls = 0;
    const rng = (): number => {
      calls++;
      // 첫 6 호출(1 code)은 0 → 'AAAAAA', 다음 6 호출은 0.5 → 약간 다른 문자
      return calls <= 6 ? 0 : 0.5;
    };
    const existing = new Set<string>([generateWallShortCode(() => 0)]); // AAAAAA
    const code = generateUniqueWallShortCode(existing, rng);
    expect(code).toHaveLength(WALL_SHORT_CODE_LENGTH);
    expect(existing.has(code)).toBe(false);
  });
});

describe('buildWallPreviewPosts', () => {
  const mkPost = (id: string, overrides?: Partial<RealtimeWallPost>): RealtimeWallPost => ({
    id,
    nickname: `n-${id}`,
    text: `text-${id}`,
    status: 'approved',
    pinned: false,
    submittedAt: Number(id),
    kanban: { columnId: 'column-1', order: 0 },
    freeform: { x: 0, y: 0, w: 260, h: 180, zIndex: 0 },
    ...overrides,
  });

  it('approved만 추출하고 pending/hidden은 제외', () => {
    const posts: RealtimeWallPost[] = [
      mkPost('1'),
      mkPost('2', { status: 'pending' }),
      mkPost('3', { status: 'hidden' }),
      mkPost('4'),
    ];
    const preview = buildWallPreviewPosts(posts);
    expect(preview.map((p) => p.id)).toEqual(['4', '1']);
  });

  it('pinned 우선, 그다음 최신순 정렬 유지', () => {
    const posts: RealtimeWallPost[] = [
      mkPost('1'),
      mkPost('2', { pinned: true }),
      mkPost('3'),
      mkPost('4', { pinned: true }),
    ];
    const preview = buildWallPreviewPosts(posts);
    // pinned 2개 먼저 (submittedAt 내림차순 → 4,2), 그 다음 3,1
    expect(preview.map((p) => p.id)).toEqual(['4', '2', '3', '1']);
  });

  it('max 상한 적용 + 100자 초과 text 말줄임', () => {
    const longText = 'x'.repeat(150);
    const posts: RealtimeWallPost[] = Array.from({ length: 10 }, (_, i) =>
      mkPost(String(i + 1), { text: longText, submittedAt: i + 1 }),
    );
    const preview = buildWallPreviewPosts(posts, 3);
    expect(preview).toHaveLength(3);
    expect(preview[0]!.text.length).toBe(100);
  });

  it('빈 posts는 빈 배열 반환', () => {
    expect(buildWallPreviewPosts([])).toEqual([]);
  });
});

describe('createWallBoard', () => {
  const columns: RealtimeWallColumn[] = [
    { id: 'column-1', title: '생각', order: 0 },
    { id: 'column-2', title: '질문', order: 1 },
  ];

  it('기본값 approvalMode=manual, posts=[], createdAt=updatedAt', () => {
    const now = 1000;
    const board = createWallBoard({
      id: 'board-1' as WallBoardId,
      title: '토론 1',
      layoutMode: 'kanban',
      columns,
      now,
    });
    expect(board.id).toBe('board-1');
    expect(board.title).toBe('토론 1');
    expect(board.approvalMode).toBe('manual');
    expect(board.posts).toEqual([]);
    expect(board.createdAt).toBe(now);
    expect(board.updatedAt).toBe(now);
    expect(board.archived).toBeUndefined();
    expect(board.shortCode).toBeUndefined();
  });

  it('columns deep copy로 원본 불변 보장', () => {
    const board = createWallBoard({
      id: 'board-2' as WallBoardId,
      title: '토론 2',
      layoutMode: 'kanban',
      columns,
    });
    // 원본 columns 수정이 board에 영향 없음
    (columns[0] as { title: string }).title = 'MUTATED';
    expect(board.columns[0]!.title).toBe('생각');
    // 원복
    (columns[0] as { title: string }).title = '생각';
  });

  it('shortCode 주입 시 저장 + approvalMode 명시 override', () => {
    const board = createWallBoard({
      id: 'board-3' as WallBoardId,
      title: '자동 승인',
      layoutMode: 'freeform',
      columns,
      approvalMode: 'auto',
      shortCode: 'ABC123',
    });
    expect(board.shortCode).toBe('ABC123');
    expect(board.approvalMode).toBe('auto');
  });

  it('빈 title은 "제목 없는 담벼락"으로 대체', () => {
    const board = createWallBoard({
      id: 'board-4' as WallBoardId,
      title: '   ',
      layoutMode: 'grid',
      columns,
    });
    expect(board.title).toBe('제목 없는 담벼락');
  });
});

describe('toWallBoardMeta', () => {
  const columns: RealtimeWallColumn[] = [
    { id: 'column-1', title: '생각', order: 0 },
  ];
  const mkPost = (id: string, status: 'pending' | 'approved' | 'hidden'): RealtimeWallPost => ({
    id,
    nickname: `n-${id}`,
    text: `t-${id}`,
    status,
    pinned: false,
    submittedAt: Number(id),
    kanban: { columnId: 'column-1', order: 0 },
    freeform: { x: 0, y: 0, w: 260, h: 180, zIndex: 0 },
  });

  it('postCount / approvedCount / previewPosts 경량 변환', () => {
    const board = createWallBoard({
      id: 'board-1' as WallBoardId,
      title: 'T',
      layoutMode: 'kanban',
      columns,
      now: 100,
    });
    const withPosts: WallBoard = {
      ...board,
      posts: [
        mkPost('1', 'approved'),
        mkPost('2', 'pending'),
        mkPost('3', 'approved'),
      ],
    };
    const meta = toWallBoardMeta(withPosts);
    expect(meta.postCount).toBe(3);
    expect(meta.approvedCount).toBe(2);
    expect(meta.previewPosts).toHaveLength(2);
    expect(meta.previewPosts.map((p) => p.id).sort()).toEqual(['1', '3']);
  });
});

// ============================================================
// v1.13 Stage C — 승인 정책 옵션
// Design §4.2, §4.3, §4.6
// ============================================================

describe('createWallPost (v1.13 Stage C)', () => {
  const columns: RealtimeWallColumn[] = [
    { id: 'column-1', title: '생각', order: 0 },
    { id: 'column-2', title: '질문', order: 1 },
  ];

  function makePost(overrides: Partial<RealtimeWallPost> & { id: string }): RealtimeWallPost {
    return {
      nickname: '기존',
      text: '기존 카드',
      status: 'approved',
      pinned: false,
      submittedAt: 500,
      kanban: { columnId: 'column-1', order: 0 },
      freeform: { x: 0, y: 0, w: 260, h: 180, zIndex: 1 },
      ...overrides,
    };
  }

  const submission = {
    id: 's-new',
    nickname: '민수',
    text: '새 제출',
    submittedAt: 2000,
  };

  it("'manual' 모드는 기존 createPendingRealtimeWallPost와 동일하게 pending 생성", () => {
    const existing = [
      makePost({ id: 'p1', status: 'approved', kanban: { columnId: 'column-1', order: 0 } }),
    ];
    const viaManual = createWallPost(submission, existing, columns, 'manual');
    const viaLegacy = createPendingRealtimeWallPost(submission, existing, columns);

    expect(viaManual).toEqual(viaLegacy);
    expect(viaManual.status).toBe('pending');
  });

  it("'auto' 모드는 즉시 approved + 같은 컬럼 approved 카드 수로 order 계산", () => {
    const existing = [
      makePost({ id: 'p1', status: 'approved', kanban: { columnId: 'column-1', order: 0 } }),
      makePost({ id: 'p2', status: 'approved', kanban: { columnId: 'column-1', order: 1 } }),
      makePost({ id: 'p3', status: 'pending', kanban: { columnId: 'column-1', order: 0 } }),
    ];
    const post = createWallPost(submission, existing, columns, 'auto');

    expect(post.status).toBe('approved');
    expect(post.kanban.columnId).toBe('column-1');
    // approved 2건만 카운트 (pending 제외)
    expect(post.kanban.order).toBe(2);
  });

  it("'auto' 모드의 zIndex는 전체 최댓값 + 1", () => {
    const existing = [
      makePost({ id: 'p1', freeform: { x: 0, y: 0, w: 260, h: 180, zIndex: 7 } }),
      makePost({ id: 'p2', freeform: { x: 0, y: 0, w: 260, h: 180, zIndex: 42 } }),
    ];
    const post = createWallPost(submission, existing, columns, 'auto');
    expect(post.freeform.zIndex).toBe(43);
  });

  it("'auto' 모드라도 existingPosts가 비면 zIndex=1, order=0", () => {
    const post = createWallPost(submission, [], columns, 'auto');
    expect(post.status).toBe('approved');
    expect(post.kanban.order).toBe(0);
    expect(post.freeform.zIndex).toBe(1);
  });

  it("'filter' 모드는 v1.13.2 스텁: pending으로 안전 폴백", () => {
    const post = createWallPost(submission, [], columns, 'filter');
    expect(post.status).toBe('pending');
  });

  it('알 수 없는 승인 모드는 never exhaustive 방어로 에러', () => {
    expect(() =>
      createWallPost(submission, [], columns, 'unknown' as WallApprovalMode),
    ).toThrow(/Unknown approvalMode/);
  });

  it("'auto' 모드 링크 분류는 manual과 동일 (youtube kind 유지)", () => {
    const post = createWallPost(
      { ...submission, linkUrl: 'https://youtu.be/dQw4w9WgXcQ' },
      [],
      columns,
      'auto',
    );
    expect(post.status).toBe('approved');
    expect(post.linkPreview).toEqual({ kind: 'youtube', videoId: 'dQw4w9WgXcQ' });
  });
});

describe('bulkApproveWallPosts (v1.13 Stage C)', () => {
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

  it('혼합 상태 배열: pending만 approved로 승격, approved/hidden은 보존', () => {
    const posts = [
      makePost({ id: 'a', status: 'approved', kanban: { columnId: 'column-1', order: 0 } }),
      makePost({ id: 'b', status: 'pending', kanban: { columnId: 'column-1', order: 0 } }),
      makePost({ id: 'c', status: 'hidden', kanban: { columnId: 'column-2', order: 9 } }),
      makePost({ id: 'd', status: 'pending', kanban: { columnId: 'column-2', order: 0 } }),
    ];

    const result = bulkApproveWallPosts(posts, columns);
    const byId = new Map(result.map((p) => [p.id, p]));

    expect(byId.get('a')!.status).toBe('approved');
    expect(byId.get('b')!.status).toBe('approved');
    // b는 column-1에서 a(이미 approved) 뒤 order 1
    expect(byId.get('b')!.kanban.order).toBe(1);
    // c는 hidden이므로 승인 대상 아님 (order 보존)
    expect(byId.get('c')!.status).toBe('hidden');
    expect(byId.get('c')!.kanban.order).toBe(9);
    expect(byId.get('d')!.status).toBe('approved');
    // d는 column-2 첫 approved → order 0
    expect(byId.get('d')!.kanban.order).toBe(0);
  });

  it('전부 pending: 순차 승인으로 같은 컬럼 내 order가 0,1,2... 누적', () => {
    const posts = [
      makePost({ id: 'a', status: 'pending', kanban: { columnId: 'column-1', order: 0 } }),
      makePost({ id: 'b', status: 'pending', kanban: { columnId: 'column-1', order: 0 } }),
      makePost({ id: 'c', status: 'pending', kanban: { columnId: 'column-1', order: 0 } }),
    ];

    const result = bulkApproveWallPosts(posts, columns);
    const orders = result.map((p) => p.kanban.order).sort();

    expect(result.every((p) => p.status === 'approved')).toBe(true);
    expect(orders).toEqual([0, 1, 2]);
  });

  it('전부 hidden: 어떤 카드도 변경되지 않음 (참조/상태 보존)', () => {
    const posts = [
      makePost({ id: 'a', status: 'hidden', kanban: { columnId: 'column-1', order: 0 } }),
      makePost({ id: 'b', status: 'hidden', kanban: { columnId: 'column-2', order: 5 } }),
    ];
    const result = bulkApproveWallPosts(posts, columns);

    expect(result.every((p) => p.status === 'hidden')).toBe(true);
    expect(result[0]!.kanban.order).toBe(0);
    expect(result[1]!.kanban.order).toBe(5);
  });

  it('빈 배열은 빈 배열 반환', () => {
    expect(bulkApproveWallPosts([], columns)).toEqual([]);
  });

  it('입력 배열 순서(id)는 반환 배열에서 그대로 유지', () => {
    const posts = [
      makePost({ id: 'a', status: 'pending' }),
      makePost({ id: 'b', status: 'approved' }),
      makePost({ id: 'c', status: 'pending' }),
    ];
    const result = bulkApproveWallPosts(posts, columns);
    expect(result.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });
});

// ============================================================
// v1.13 Stage B — 칸반 컬럼 실행 중 편집 규칙 테스트
// Design §5.1 / §5.4 체크리스트
// ============================================================

import {
  addWallColumn,
  removeWallColumn,
  renameWallColumn,
  reorderWallColumns,
} from './realtimeWallRules';

describe('addWallColumn', () => {
  const baseColumns: RealtimeWallColumn[] = [
    { id: 'column-1', title: '주장', order: 0 },
    { id: 'column-2', title: '근거', order: 1 },
    { id: 'column-3', title: '반박', order: 2 },
  ];

  it('새 컬럼을 끝에 추가하고 order 0..n 유지', () => {
    const result = addWallColumn(baseColumns, '결론');
    expect(result).toHaveLength(4);
    expect(result[3]).toMatchObject({ title: '결론', order: 3 });
    expect(result.map((c) => c.order)).toEqual([0, 1, 2, 3]);
  });

  it('id 충돌 없이 column-N 발급 (기존 최댓값+1)', () => {
    const result = addWallColumn(baseColumns, '결론');
    expect(result[3]!.id).toBe('column-4');
  });

  it('최대 6개 제한 — 7번째 추가는 거부(원본 반환)', () => {
    const six: RealtimeWallColumn[] = Array.from({ length: 6 }, (_, i) => ({
      id: `column-${i + 1}`,
      title: `c${i + 1}`,
      order: i,
    }));
    const result = addWallColumn(six, '일곱');
    expect(result).toHaveLength(6);
    expect(result.map((c) => c.title)).not.toContain('일곱');
  });

  it('빈/공백 제목은 거부', () => {
    expect(addWallColumn(baseColumns, '   ')).toHaveLength(3);
    expect(addWallColumn(baseColumns, '')).toHaveLength(3);
  });

  it('제목은 trim 처리', () => {
    const result = addWallColumn(baseColumns, '  결론  ');
    expect(result[3]!.title).toBe('결론');
  });
});

describe('renameWallColumn', () => {
  const columns: RealtimeWallColumn[] = [
    { id: 'column-1', title: '주장', order: 0 },
    { id: 'column-2', title: '근거', order: 1 },
  ];

  it('지정 컬럼의 title을 변경', () => {
    const result = renameWallColumn(columns, 'column-1', '핵심 주장');
    expect(result[0]!.title).toBe('핵심 주장');
    expect(result[1]!.title).toBe('근거');
  });

  it('빈/공백 제목은 거부(원본 반환)', () => {
    expect(renameWallColumn(columns, 'column-1', '')[0]!.title).toBe('주장');
    expect(renameWallColumn(columns, 'column-1', '   ')[0]!.title).toBe('주장');
  });

  it('존재하지 않는 columnId는 불변', () => {
    const result = renameWallColumn(columns, 'column-99', '이름');
    expect(result).toEqual(columns);
  });

  it('새 title은 trim 처리', () => {
    const result = renameWallColumn(columns, 'column-1', '  제목  ');
    expect(result[0]!.title).toBe('제목');
  });
});

describe('reorderWallColumns', () => {
  const columns: RealtimeWallColumn[] = [
    { id: 'column-1', title: 'A', order: 0 },
    { id: 'column-2', title: 'B', order: 1 },
    { id: 'column-3', title: 'C', order: 2 },
  ];

  it('fromIndex < toIndex: 앞→뒤 이동 + order 재계산', () => {
    const result = reorderWallColumns(columns, 0, 2);
    expect(result.map((c) => c.id)).toEqual(['column-2', 'column-3', 'column-1']);
    expect(result.map((c) => c.order)).toEqual([0, 1, 2]);
  });

  it('fromIndex > toIndex: 뒤→앞 이동 + order 재계산', () => {
    const result = reorderWallColumns(columns, 2, 0);
    expect(result.map((c) => c.id)).toEqual(['column-3', 'column-1', 'column-2']);
    expect(result.map((c) => c.order)).toEqual([0, 1, 2]);
  });

  it('fromIndex === toIndex: no-op', () => {
    const result = reorderWallColumns(columns, 1, 1);
    expect(result.map((c) => c.id)).toEqual(['column-1', 'column-2', 'column-3']);
  });

  it('범위 벗어난 index는 원본 반환', () => {
    expect(reorderWallColumns(columns, -1, 0)).toEqual(columns);
    expect(reorderWallColumns(columns, 0, 99)).toEqual(columns);
    expect(reorderWallColumns(columns, 99, 0)).toEqual(columns);
  });
});

describe('removeWallColumn', () => {
  const columns: RealtimeWallColumn[] = [
    { id: 'column-1', title: '주장', order: 0 },
    { id: 'column-2', title: '근거', order: 1 },
    { id: 'column-3', title: '반박', order: 2 },
  ];

  function mkPost(
    id: string,
    columnId: string,
    overrides?: Partial<RealtimeWallPost>,
  ): RealtimeWallPost {
    return {
      id,
      nickname: `n-${id}`,
      text: `t-${id}`,
      status: 'approved',
      pinned: false,
      submittedAt: Number(id.replace(/\D/g, '')) || 1,
      kanban: { columnId, order: 0 },
      freeform: { x: 0, y: 0, w: 260, h: 180, zIndex: 1 },
      ...overrides,
    };
  }

  describe('strategy: move-to', () => {
    it('삭제 컬럼의 카드를 target 컬럼 뒤로 append (order는 기존 target 수부터)', () => {
      const posts: RealtimeWallPost[] = [
        mkPost('1', 'column-1', { kanban: { columnId: 'column-1', order: 0 } }),
        mkPost('2', 'column-1', { kanban: { columnId: 'column-1', order: 1 } }),
        mkPost('3', 'column-2', { kanban: { columnId: 'column-2', order: 0 } }),
        mkPost('4', 'column-3', { kanban: { columnId: 'column-3', order: 0 } }),
      ];
      const { columns: nextCols, posts: nextPosts } = removeWallColumn(
        columns,
        posts,
        'column-3',
        { kind: 'move-to', targetColumnId: 'column-1' },
      );

      expect(nextCols.map((c) => c.id)).toEqual(['column-1', 'column-2']);
      expect(nextCols.map((c) => c.order)).toEqual([0, 1]);

      const moved = nextPosts.find((p) => p.id === '4')!;
      expect(moved.kanban.columnId).toBe('column-1');
      // column-1에 이미 approved 카드 2개 → startOrder=2
      expect(moved.kanban.order).toBe(2);
    });

    it('target이 삭제 대상과 같거나 존재하지 않으면 첫 남은 컬럼으로 fallback', () => {
      const posts: RealtimeWallPost[] = [
        mkPost('1', 'column-3', { kanban: { columnId: 'column-3', order: 0 } }),
      ];
      const { posts: nextPosts } = removeWallColumn(columns, posts, 'column-3', {
        kind: 'move-to',
        targetColumnId: 'column-3', // 자기 자신 → fallback
      });
      expect(nextPosts[0]!.kanban.columnId).toBe('column-1');
    });

    it('삭제 컬럼에 카드 2개면 target에 순차 order append', () => {
      const posts: RealtimeWallPost[] = [
        mkPost('a', 'column-2', { kanban: { columnId: 'column-2', order: 0 } }),
        mkPost('b', 'column-3', { kanban: { columnId: 'column-3', order: 0 } }),
        mkPost('c', 'column-3', { kanban: { columnId: 'column-3', order: 1 } }),
      ];
      const { posts: nextPosts } = removeWallColumn(columns, posts, 'column-3', {
        kind: 'move-to',
        targetColumnId: 'column-2',
      });
      const b = nextPosts.find((p) => p.id === 'b')!;
      const c = nextPosts.find((p) => p.id === 'c')!;
      expect(b.kanban.columnId).toBe('column-2');
      expect(c.kanban.columnId).toBe('column-2');
      // 기존 column-2 approved 카드 1개 → b=1, c=2
      expect(b.kanban.order).toBe(1);
      expect(c.kanban.order).toBe(2);
    });
  });

  describe('strategy: hide', () => {
    it('삭제 컬럼 카드 status=hidden 일괄 전환, 컬럼만 제거', () => {
      const posts: RealtimeWallPost[] = [
        mkPost('a', 'column-1'),
        mkPost('b', 'column-3'),
        mkPost('c', 'column-3'),
      ];
      const { columns: nextCols, posts: nextPosts } = removeWallColumn(
        columns,
        posts,
        'column-3',
        { kind: 'hide' },
      );
      expect(nextCols.map((c) => c.id)).toEqual(['column-1', 'column-2']);

      const a = nextPosts.find((p) => p.id === 'a')!;
      const b = nextPosts.find((p) => p.id === 'b')!;
      const c = nextPosts.find((p) => p.id === 'c')!;
      expect(a.status).toBe('approved');
      expect(b.status).toBe('hidden');
      expect(c.status).toBe('hidden');
    });
  });

  describe('strategy: delete', () => {
    it('삭제 컬럼 카드를 posts에서 영구 제거', () => {
      const posts: RealtimeWallPost[] = [
        mkPost('a', 'column-1'),
        mkPost('b', 'column-3'),
        mkPost('c', 'column-3'),
      ];
      const { posts: nextPosts } = removeWallColumn(
        columns,
        posts,
        'column-3',
        { kind: 'delete' },
      );
      expect(nextPosts.map((p) => p.id)).toEqual(['a']);
    });
  });

  it('최소 2컬럼 가드: 2개 중 삭제는 거부 (원본 반환)', () => {
    const twoCols: RealtimeWallColumn[] = [
      { id: 'column-1', title: 'A', order: 0 },
      { id: 'column-2', title: 'B', order: 1 },
    ];
    const posts: RealtimeWallPost[] = [mkPost('a', 'column-1')];
    const { columns: nextCols, posts: nextPosts } = removeWallColumn(
      twoCols,
      posts,
      'column-1',
      { kind: 'delete' },
    );
    expect(nextCols).toHaveLength(2);
    expect(nextPosts).toHaveLength(1);
  });

  it('존재하지 않는 columnId는 원본 반환', () => {
    const posts: RealtimeWallPost[] = [mkPost('a', 'column-1')];
    const { columns: nextCols, posts: nextPosts } = removeWallColumn(
      columns,
      posts,
      'column-999',
      { kind: 'delete' },
    );
    expect(nextCols).toEqual(columns);
    expect(nextPosts).toEqual(posts);
  });

  it('3개 컬럼 중 1개 삭제 후 나머지 2개의 order 0..1 재정렬', () => {
    const { columns: nextCols } = removeWallColumn(columns, [], 'column-2', {
      kind: 'delete',
    });
    expect(nextCols).toEqual([
      { id: 'column-1', title: '주장', order: 0 },
      { id: 'column-3', title: '반박', order: 1 },
    ]);
  });
});
