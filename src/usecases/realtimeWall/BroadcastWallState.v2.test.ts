/**
 * v2.1 (Phase B) — buildWallStateForStudents v2.1 신규 동작 테스트.
 *
 * Design v2.1 §10.6 회귀 위험 #1: `posts.filter(p => p.status === 'approved')` 패턴 보존.
 * Design v2.1 §4.3: settings 옵션 통과 검증.
 * v2.1 status union 확장: 'hidden-by-author' 카드는 broadcast에서 제외 (Phase B는 학생에게 표시 X).
 */
import { describe, expect, it } from 'vitest';
import type { RealtimeWallPost } from '@domain/entities/RealtimeWall';
import { buildWallStateForStudents } from './BroadcastWallState';

function postFactory(overrides?: Partial<RealtimeWallPost>): RealtimeWallPost {
  return {
    id: 'p1',
    nickname: '학생',
    text: 'hello',
    status: 'approved',
    pinned: false,
    submittedAt: 1_700_000_000_000,
    kanban: { columnId: 'column-1', order: 0 },
    freeform: { x: 0, y: 0, w: 260, h: 180, zIndex: 1 },
    ...overrides,
  };
}

describe('buildWallStateForStudents v2.1', () => {
  it('회귀 #1 — status="approved" 카드만 통과', () => {
    const snapshot = buildWallStateForStudents({
      title: '보드',
      layoutMode: 'kanban',
      columns: [],
      posts: [
        postFactory({ id: 'a', status: 'approved' }),
        postFactory({ id: 'b', status: 'pending' }),
        postFactory({ id: 'c', status: 'hidden' }),
      ],
    });
    expect(snapshot.posts).toHaveLength(1);
    expect(snapshot.posts[0]?.id).toBe('a');
  });

  it('v2.1 — status="hidden-by-author" 카드는 학생 broadcast에서 제외 (Phase D에서 placeholder로 활용)', () => {
    const snapshot = buildWallStateForStudents({
      title: '보드',
      layoutMode: 'kanban',
      columns: [],
      posts: [
        postFactory({ id: 'a', status: 'approved' }),
        postFactory({ id: 'b', status: 'hidden-by-author' }),
      ],
    });
    expect(snapshot.posts).toHaveLength(1);
    expect(snapshot.posts[0]?.id).toBe('a');
  });

  it('v2.1 — settings 옵션이 스냅샷에 포함', () => {
    const snapshot = buildWallStateForStudents({
      title: '보드',
      layoutMode: 'freeform',
      columns: [],
      posts: [],
      settings: { version: 1, moderation: 'manual' },
    });
    expect(snapshot.settings).toEqual({ version: 1, moderation: 'manual' });
  });

  it('settings 미전달 시 스냅샷에 settings 키 자체가 없음', () => {
    const snapshot = buildWallStateForStudents({
      title: '보드',
      layoutMode: 'freeform',
      columns: [],
      posts: [],
    });
    expect(snapshot.settings).toBeUndefined();
  });

  it('studentFormLocked 미전달 시 false default', () => {
    const snapshot = buildWallStateForStudents({
      title: '보드',
      layoutMode: 'freeform',
      columns: [],
      posts: [],
    });
    expect(snapshot.studentFormLocked).toBe(false);
  });

  it('v2.1 신규 필드 (images / pdfUrl / color) 보존', () => {
    const snapshot = buildWallStateForStudents({
      title: '보드',
      layoutMode: 'kanban',
      columns: [],
      posts: [
        postFactory({
          id: 'a',
          status: 'approved',
          images: ['data:image/png;base64,iVBO'],
          pdfUrl: 'file:///tmp/x.pdf',
          pdfFilename: 'x.pdf',
          color: 'pink',
        }),
      ],
    });
    expect(snapshot.posts[0]?.images).toHaveLength(1);
    expect(snapshot.posts[0]?.pdfUrl).toBe('file:///tmp/x.pdf');
    expect(snapshot.posts[0]?.color).toBe('pink');
  });
});
