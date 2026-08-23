/**
 * 온라인 교무실 게시판(M2) 정적 렌더 테스트.
 *
 * 환경: vitest(node) — `renderToString` 으로 출력 문자열을 검사한다
 * (같은 저장소의 `LessonCountSummary.test.tsx` 선례).
 *
 * 왜 필요한가 — 이 화면은 구글 로그인을 거쳐야 열려서 브라우저 모드로는 도달할 수 없다
 * (`reference_ui_render_verification_env` 의 결론: 스토어 목 기반 렌더 테스트로
 *  구조·게이팅을 결정적으로 검증한다).
 *
 * 잠그는 것 — 전부 "계획서의 설계 결정이 화면에서 무너지지 않는다"에 관한 계약이다:
 *   §3.5-나  사람별 읽음 명단은 **필독 글에만** 보인다. 일반 글에는 그 영역이 없다.
 *   §8-A     필독 글은 목록 맨 위에 붙박이로, 일반 글과 구분되어 보인다.
 *   §8-A     안 읽은 글·나를 부른 글이 표시된다.
 *   권한     남의 글 수정·삭제 버튼은 일반 멤버에게 **렌더되지 않는다**(숨김이 아니라 없음).
 *   권한     필독 지정은 관리자에게만 보인다.
 *   §10.2    글이 없을 때 조용한 빈 화면 대신 무엇을 할 수 있는지 알려 준다.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import type {
  StaffRoomComment,
  StaffRoomPost,
  StaffRoomPostSummary,
  StaffRoomReadStatus,
} from '@domain/entities/StaffRoomBoard';
import type { StaffRoomRole } from '@domain/entities/StaffRoom';

// ── 스토어 목 ────────────────────────────────────────────────────
interface BoardMockState {
  posts: StaffRoomPostSummary[];
  currentPost: StaffRoomPost | null;
  comments: StaffRoomComment[];
  readStatus: (StaffRoomReadStatus & { isRequired: boolean }) | null;
  isLoading: boolean;
  hasLoadedPosts: boolean;
  error: string | null;
  draftTitle: string;
  draftBody: string;
  draftMentions: string[];
  draftSavedAt: string | null;
  categories: { id: string; departmentId: string; name: string; position: number }[];
  filterCategoryId: string | null;
  filterTag: string | null;
}

const noop = () => {};
const asyncNoop = async () => {};

const boardState: BoardMockState = {
  posts: [],
  currentPost: null,
  comments: [],
  readStatus: null,
  isLoading: false,
  hasLoadedPosts: true,
  error: null,
  draftTitle: '',
  draftBody: '',
  draftMentions: [],
  draftSavedAt: null,
  categories: [],
  filterCategoryId: null,
  filterTag: null,
};

let myRole: StaffRoomRole | null = 'member';
let myEmail: string | null = 'lee@school.kr';

vi.mock('@adapters/stores/useStaffRoomBoardStore', () => ({
  useStaffRoomBoardStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      ...boardState,
      loadPosts: asyncNoop,
      openPost: asyncNoop,
      closePost: noop,
      writePost: asyncNoop,
      editPost: asyncNoop,
      setRequired: asyncNoop,
      removePost: asyncNoop,
      addComment: asyncNoop,
      removeComment: asyncNoop,
      loadDraft: asyncNoop,
      updateDraft: noop,
      discardDraft: asyncNoop,
      loadCategories: asyncNoop,
      addCategory: asyncNoop,
      removeCategory: asyncNoop,
      setFilter: noop,
      clearError: noop,
      reset: noop,
    }),
}));

vi.mock('@adapters/stores/useStaffRoomStore', () => ({
  useStaffRoomStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      currentDepartment: myRole === null ? null : { id: 'dept-1', myRole, name: '2학년부' },
      currentBoard: { id: 'board-1' },
      members: [
        { id: 'a1', email: 'kim@school.kr', displayName: '김부장', role: 'admin' },
        { id: 'm1', email: 'lee@school.kr', displayName: null, role: 'member' },
      ],
      setMyName: asyncNoop,
    }),
}));

vi.mock('@adapters/stores/useGoogleAccountStore', () => ({
  useGoogleAccountStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ email: myEmail }),
}));

const { BoardView } = await import('./BoardView');
const { PostDetail } = await import('./PostDetail');

// ── 표본 ─────────────────────────────────────────────────────────
function summary(over: Partial<StaffRoomPostSummary> = {}): StaffRoomPostSummary {
  return {
    id: 'p1',
    moduleId: 'board-1',
    title: '평범한 공지',
    authorEmail: 'kim@school.kr',
    authorName: '김부장',
    createdAt: '2026-08-20T01:00:00.000Z',
    updatedAt: '2026-08-20T01:00:00.000Z',
    isRequired: false,
    commentCount: 0,
    isUnread: false,
    mentionsMe: false,
    categoryId: null,
    tags: [],
    ...over,
  };
}

function fullPost(over: Partial<StaffRoomPost> = {}): StaffRoomPost {
  return { ...summary(), body: '본문입니다', bodyFormat: 'plain', mentionedEmails: [], ...over };
}

beforeEach(() => {
  boardState.posts = [];
  boardState.currentPost = null;
  boardState.comments = [];
  boardState.readStatus = null;
  boardState.isLoading = false;
  boardState.hasLoadedPosts = true;
  boardState.error = null;
  boardState.categories = [];
  boardState.filterCategoryId = null;
  boardState.filterTag = null;
  myRole = 'member';
  myEmail = 'lee@school.kr';
});

const board = () =>
  renderToString(<BoardView departmentId="dept-1" boardId="board-1" onWriteNew={noop} />);
const detail = () => renderToString(<PostDetail departmentId="dept-1" onEdit={noop} />);

// ══════════════════════════════════════════════════════════════════
describe('글 목록 — 필독·안읽음·멘션', () => {
  it('글이 없으면 조용한 빈 화면 대신 무엇을 할 수 있는지 알려 준다', () => {
    const html = board();
    expect(html).toContain('아직 올라온 글이 없어요');
  });

  it('필독 글에 필독 표시가 붙는다', () => {
    boardState.posts = [summary({ id: 'p-req', title: '9월 업무 분장', isRequired: true })];
    expect(board()).toContain('필독');
  });

  it('일반 글만 있으면 필독 표시가 없다', () => {
    boardState.posts = [summary({ title: '점심 같이 드실 분' })];
    expect(board()).not.toContain('필독');
  });

  it('★ 필독 글이 서버가 준 순서(맨 위)대로 먼저 그려진다', () => {
    boardState.posts = [
      summary({ id: 'p-req', title: '필독공지제목', isRequired: true }),
      summary({ id: 'p-normal', title: '일반글제목' }),
    ];
    const html = board();
    expect(html.indexOf('필독공지제목')).toBeLessThan(html.indexOf('일반글제목'));
  });

  it('안 읽은 글에 표시가 붙는다 (읽는 도구로도 알 수 있게 이름표를 단다)', () => {
    boardState.posts = [summary({ isUnread: true })];
    const html = board();
    expect(html).toContain('aria-label="안 읽음"');
    // 제목이 굵게 — 눈으로도 구분된다
    expect(html).toContain('font-sp-bold');
  });

  it('읽은 글에는 안 읽음 표시가 없다', () => {
    boardState.posts = [summary({ isUnread: false })];
    expect(board()).not.toContain('aria-label="안 읽음"');
  });

  it('나를 부른 글이 표시된다', () => {
    boardState.posts = [summary({ mentionsMe: true })];
    expect(board()).toContain('나를 부름');
  });

  it('나를 안 부른 글에는 그 표시가 없다', () => {
    boardState.posts = [summary({ mentionsMe: false })];
    expect(board()).not.toContain('나를 부름');
  });

  it('이름을 안 정한 사람은 지메일로 보인다', () => {
    boardState.posts = [summary({ authorEmail: 'park@school.kr', authorName: null })];
    expect(board()).toContain('park@school.kr');
  });

  it('이름을 정했으면 이름으로 보인다', () => {
    boardState.posts = [summary({ authorName: '김부장' })];
    const html = board();
    expect(html).toContain('김부장');
    expect(html).not.toContain('kim@school.kr');
  });

  it('오류가 있으면 한국어로 알린다 (조용히 삼키지 않는다)', () => {
    boardState.error = '이 부서의 멤버가 아니라 볼 수 없습니다.';
    expect(board()).toContain('이 부서의 멤버가 아니라 볼 수 없습니다.');
  });
});

// ══════════════════════════════════════════════════════════════════
describe('글 상세 — ★ 읽음 명단은 필독 글에만 (계획서 §3.5-나)', () => {
  it('필독 글에는 읽은 사람·안 읽은 사람이 보인다', () => {
    boardState.currentPost = fullPost({ isRequired: true });
    boardState.readStatus = {
      isRequired: true,
      read: [{ email: 'kim@school.kr', name: '김부장', readAt: '2026-08-20T02:00:00.000Z' }],
      unread: [{ email: 'lee@school.kr', name: null }],
    };
    const html = detail();
    expect(html).toContain('읽은 사람');
    expect(html).toContain('안 읽은 사람');
    expect(html).toContain('김부장');
  });

  it('★ 일반 글에는 사람별 읽음 영역 자체가 없다', () => {
    boardState.currentPost = fullPost({ isRequired: false });
    boardState.readStatus = null;
    const html = detail();
    expect(html).not.toContain('읽은 사람');
    expect(html).not.toContain('안 읽은 사람');
  });

  it('필독 글이어도 읽음 현황을 못 받았으면 없는 척하지 않고 영역을 안 그린다', () => {
    boardState.currentPost = fullPost({ isRequired: true });
    boardState.readStatus = null;
    expect(detail()).not.toContain('읽은 사람');
  });

  it('본문이 그대로 보인다', () => {
    boardState.currentPost = fullPost({ body: '내일 3시 회의실에서 뵙겠습니다' });
    expect(detail()).toContain('내일 3시 회의실에서 뵙겠습니다');
  });
});

// ══════════════════════════════════════════════════════════════════
describe('글 상세 — 권한에 따라 버튼이 아예 없다', () => {
  it('★ 남의 글이면 일반 멤버에게 수정·삭제 버튼이 렌더되지 않는다', () => {
    myRole = 'member';
    myEmail = 'lee@school.kr';
    boardState.currentPost = fullPost({ authorEmail: 'kim@school.kr' });
    const html = detail();
    expect(html).not.toContain('수정');
    expect(html).not.toContain('삭제');
  });

  it('내 글이면 수정·삭제가 보인다', () => {
    myRole = 'member';
    myEmail = 'lee@school.kr';
    boardState.currentPost = fullPost({ authorEmail: 'lee@school.kr' });
    const html = detail();
    expect(html).toContain('수정');
    expect(html).toContain('삭제');
  });

  it('관리자는 남의 글도 수정·삭제할 수 있다', () => {
    myRole = 'admin';
    myEmail = 'kim@school.kr';
    boardState.currentPost = fullPost({ authorEmail: 'lee@school.kr' });
    const html = detail();
    expect(html).toContain('수정');
    expect(html).toContain('삭제');
  });

  it('★ 필독 지정은 일반 멤버에게 렌더되지 않는다', () => {
    myRole = 'member';
    myEmail = 'lee@school.kr';
    boardState.currentPost = fullPost({ authorEmail: 'lee@school.kr' });
    expect(detail()).not.toContain('필독으로');
  });

  it('관리자에게는 필독 지정이 보인다', () => {
    myRole = 'admin';
    myEmail = 'kim@school.kr';
    boardState.currentPost = fullPost({ authorEmail: 'kim@school.kr', isRequired: false });
    expect(detail()).toContain('필독으로');
  });
});

// ══════════════════════════════════════════════════════════════════
describe('글 상세 — 댓글', () => {
  it('댓글이 보인다', () => {
    boardState.currentPost = fullPost();
    boardState.comments = [
      {
        id: 'c1',
        postId: 'p1',
        authorEmail: 'kim@school.kr',
        authorName: '김부장',
        body: '확인했습니다',
        bodyFormat: 'plain',
        createdAt: '2026-08-20T03:00:00.000Z',
      },
    ];
    const html = detail();
    expect(html).toContain('확인했습니다');
    expect(html).toContain('김부장');
  });

  it('댓글이 없으면 빈 안내가 있다', () => {
    boardState.currentPost = fullPost();
    boardState.comments = [];
    expect(detail()).toContain('댓글');
  });
});

// ══════════════════════════════════════════════════════════════════
describe('말머리·해시태그 (054)', () => {
  const 공지 = { id: 'c1', departmentId: 'dept-1', name: '공지', position: 0 };
  const 회의록 = { id: 'c2', departmentId: 'dept-1', name: '회의록', position: 1 };

  it('말머리가 없으면 걸러보기 줄을 그리지 않는다 — 빈 줄이 자리만 차지하지 않게', () => {
    boardState.posts = [summary()];
    boardState.categories = [];
    expect(board()).not.toContain('전체');
  });

  it('말머리가 있으면 걸러보기 단추가 보인다', () => {
    boardState.posts = [summary()];
    boardState.categories = [공지, 회의록];
    const html = board();
    expect(html).toContain('전체');
    expect(html).toContain('공지');
    expect(html).toContain('회의록');
  });

  it('글에 붙은 말머리 이름이 목록에 보인다', () => {
    boardState.categories = [공지];
    boardState.posts = [summary({ title: '9월 업무 분장', categoryId: 'c1' })];
    expect(board()).toContain('공지');
  });

  it('없어진 말머리를 가리키는 글이어도 목록이 깨지지 않는다', () => {
    // 관리자가 말머리를 지우면 글의 말머리는 NULL 이 되지만(054 SET NULL),
    // 목록을 다시 받기 전까지는 사라진 id 를 들고 있을 수 있다.
    boardState.categories = [];
    boardState.posts = [summary({ title: '살아있는 글', categoryId: '사라진-말머리' })];
    expect(board()).toContain('살아있는 글');
  });

  it('말머리로 거르면 그 말머리 글만 남는다', () => {
    boardState.categories = [공지, 회의록];
    boardState.posts = [
      summary({ id: 'p1', title: '공지글제목', categoryId: 'c1' }),
      summary({ id: 'p2', title: '회의록글제목', categoryId: 'c2' }),
    ];
    boardState.filterCategoryId = 'c1';
    const html = board();
    expect(html).toContain('공지글제목');
    expect(html).not.toContain('회의록글제목');
  });

  it('해시태그로 거르면 그 태그 글만 남는다', () => {
    boardState.posts = [
      summary({ id: 'p1', title: '체육대회글', tags: ['체육대회'] }),
      summary({ id: 'p2', title: '상관없는글', tags: ['급식'] }),
    ];
    boardState.filterTag = '체육대회';
    const html = board();
    expect(html).toContain('체육대회글');
    expect(html).not.toContain('상관없는글');
  });

  it('걸러서 아무것도 안 남으면 조용히 비우지 않고 알려 준다', () => {
    boardState.categories = [공지];
    boardState.posts = [summary({ categoryId: null })];
    boardState.filterCategoryId = 'c1';
    expect(board()).toContain('고른 조건에 맞는 글이 없어요');
  });

  it('글 상세에서 태그가 # 를 붙여 보인다', () => {
    boardState.currentPost = fullPost({ tags: ['체육대회', '준비물'] });
    const html = detail();
    expect(html).toContain('#체육대회');
    expect(html).toContain('#준비물');
  });

  it('태그가 없는 글에는 태그 영역이 없다', () => {
    boardState.currentPost = fullPost({ tags: [] });
    expect(detail()).not.toContain('#');
  });
});

// ══════════════════════════════════════════════════════════════════
describe('말머리 관리 (054, 관리자만)', () => {
  it('관리자에게는 말머리가 하나도 없어도 관리 단추가 보인다', () => {
    // 없을 때 안 보이면 첫 말머리를 만들 길이 아예 없다
    myRole = 'admin';
    boardState.posts = [summary()];
    boardState.categories = [];
    expect(board()).toContain('말머리 관리');
  });

  it('일반 멤버에게는 관리 단추가 렌더되지 않는다 (숨김이 아니라 없음)', () => {
    myRole = 'member';
    boardState.posts = [summary()];
    boardState.categories = [{ id: 'c1', departmentId: 'dept-1', name: '공지', position: 0 }];
    expect(board()).not.toContain('말머리 관리');
  });
});
