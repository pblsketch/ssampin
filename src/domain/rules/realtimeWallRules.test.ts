import { describe, expect, it } from 'vitest';
import {
  buildRealtimeWallColumns,
  createDefaultFreeformPosition,
  normalizeRealtimeWallLink,
  sortRealtimeWallPostsForBoard,
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
