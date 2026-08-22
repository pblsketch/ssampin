/*
  온라인 교무실 — 부서 탭 줄 배치 가드.

  배경: 사용자 신고 2026-08-22 — 공간 관리(톱니) 단추가 탭 줄 **한가운데**에 있었다.
  공간 탭(게시판·자료실·토론방·갤러리)과 한 덩어리로 묶여 있어서, 그 뒤에 오는
  '일정·업무 / 멤버 / 초대'보다 앞에 놓였기 때문이다.

  관리 단추는 탭이 아니라 **줄 전체의 오른쪽 끝**에 있어야 한다.

  이 테스트가 잡는 회귀:
   1) 관리 단추가 마지막 탭('초대' 또는 '멤버')보다 앞으로 돌아가는 것
   2) 오른쪽으로 미는 `ml-auto` 가 빠지는 것 (원래 자리로 돌아간다)
   3) 관리 패널이 다시 `role="tablist"` 안으로 들어가는 것
      — 화면을 읽어 주는 도구에 "탭 목록 안의 패널"로 잘못 전달된다
   4) 일반 멤버에게 관리 단추가 보이는 것
*/
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { StaffRoomRole } from '@domain/entities/StaffRoom';

const noop = () => {};
const asyncNoop = async () => {};

let myRole: StaffRoomRole = 'admin';

const MODULES = [
  {
    id: 'm-board',
    departmentId: 'dept-1',
    kind: 'board',
    name: '게시판',
    position: 0,
    unreadCount: 0,
  },
  {
    id: 'm-arch',
    departmentId: 'dept-1',
    kind: 'archive',
    name: '자료실',
    position: 1,
    unreadCount: 0,
  },
];

vi.mock('@adapters/stores/useStaffRoomStore', () => ({
  useStaffRoomStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      currentDepartment: { id: 'dept-1', name: '2학년부', myRole, description: null },
      members: [{ id: 'a1', email: 'kim@school.kr', displayName: '김부장', role: 'admin' }],
      closeDepartment: noop,
    }),
}));
vi.mock('@adapters/stores/useGoogleAccountStore', () => ({
  useGoogleAccountStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ email: 'kim@school.kr' }),
}));
vi.mock('@adapters/stores/useStaffRoomBoardStore', () => ({
  useStaffRoomBoardStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ currentPost: null, reset: noop }),
}));
vi.mock('@adapters/stores/useStaffRoomLibraryStore', () => ({
  useStaffRoomLibraryStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ reset: noop }),
}));
vi.mock('@adapters/stores/useStaffRoomPlanStore', () => ({
  useStaffRoomPlanStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ reset: noop }),
}));
vi.mock('@adapters/stores/useStaffRoomRoomsStore', () => ({
  useStaffRoomRoomsStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      modules: MODULES,
      hasLoadedModules: true,
      loadModules: asyncNoop,
      reset: noop,
      banner: null,
      saveBanner: asyncNoop,
      addModule: asyncNoop,
      renameModule: asyncNoop,
      moveModule: asyncNoop,
      removeModule: asyncNoop,
    }),
}));

// 자식 화면들은 이 테스트의 관심사가 아니다 — 탭 줄 배치만 본다
vi.mock('./BoardView', () => ({ BoardView: () => null }));
vi.mock('./LibraryView', () => ({ LibraryView: () => null }));
vi.mock('./DiscussionView', () => ({ DiscussionView: () => null }));
vi.mock('./GalleryView', () => ({ GalleryView: () => null }));
vi.mock('./MinutesView', () => ({ MinutesView: () => null }));
vi.mock('./PlanView', () => ({ PlanView: () => null }));
vi.mock('./MemberList', () => ({ MemberList: () => null }));
vi.mock('./InvitePanel', () => ({ InvitePanel: () => null }));
vi.mock('./PostDetail', () => ({ PostDetail: () => null }));
vi.mock('./PostEditor', () => ({ PostEditor: () => null }));
vi.mock('./DepartmentBanner', () => ({ DepartmentBanner: () => null }));
vi.mock('./MyNameModal', () => ({
  MyNameModal: () => null,
  hasSkippedNamePrompt: () => true,
}));

const { DepartmentDetail } = await import('./DepartmentDetail');

beforeEach(() => {
  myRole = 'admin';
});

/** 탭 줄(role="tablist") 안쪽 HTML 만 잘라낸다 */
function tablistHtml(html: string): string {
  const start = html.indexOf('role="tablist"');
  expect(start).toBeGreaterThan(-1);
  // 탭 줄 여는 div 의 끝부터 그 div 가 닫히기 전까지 — 닫는 지점은 다음 형제 블록 시작으로 근사한다
  const from = html.indexOf('>', start) + 1;
  const to = html.indexOf('</div>', html.indexOf('초대') > -1 ? html.indexOf('초대') : from);
  return html.slice(from, Math.max(to, from));
}

describe('부서 탭 줄 — 공간 관리 단추는 맨 오른쪽', () => {
  it('★ 관리 단추가 마지막 탭(초대)보다 뒤에 온다', () => {
    const html = renderToString(<DepartmentDetail />);
    const gear = html.indexOf('aria-label="공간 관리"');
    const invite = html.indexOf('초대');
    expect(gear).toBeGreaterThan(-1);
    expect(invite).toBeGreaterThan(-1);
    expect(gear).toBeGreaterThan(invite);
  });

  it('★ 관리 단추가 모든 공간 탭보다 뒤에 온다', () => {
    const html = renderToString(<DepartmentDetail />);
    const gear = html.indexOf('aria-label="공간 관리"');
    expect(gear).toBeGreaterThan(html.indexOf('게시판'));
    expect(gear).toBeGreaterThan(html.indexOf('자료실'));
    expect(gear).toBeGreaterThan(html.indexOf('일정·업무'));
    expect(gear).toBeGreaterThan(html.indexOf('멤버'));
  });

  it('★ 오른쪽으로 미는 ml-auto 가 붙어 있다 (빠지면 원래 자리로 돌아간다)', () => {
    const html = renderToString(<DepartmentDetail />);
    const gearStart = html.lastIndexOf('<button', html.indexOf('aria-label="공간 관리"'));
    const gearTag = html.slice(
      gearStart,
      html.indexOf('>', html.indexOf('aria-label="공간 관리"')),
    );
    expect(gearTag).toContain('ml-auto');
  });

  it('탭이 아니라 여닫는 단추다 (role="tab" 을 주지 않고 aria-expanded 로 알린다)', () => {
    const html = renderToString(<DepartmentDetail />);
    const gearStart = html.lastIndexOf('<button', html.indexOf('aria-label="공간 관리"'));
    const gearTag = html.slice(
      gearStart,
      html.indexOf('>', html.indexOf('aria-label="공간 관리"')),
    );
    expect(gearTag).not.toContain('role="tab"');
    expect(gearTag).toContain('aria-expanded');
  });

  it('★ 일반 멤버에게는 관리 단추가 아예 없다', () => {
    myRole = 'member';
    const html = renderToString(<DepartmentDetail />);
    expect(html).not.toContain('aria-label="공간 관리"');
  });

  it('관리 패널은 닫혀 있을 때 그려지지 않는다', () => {
    const html = renderToString(<DepartmentDetail />);
    expect(html).not.toContain('새 공간 만들기');
  });

  it('★ 탭 줄(role="tablist") 안에 관리 패널이 들어 있지 않다', () => {
    const html = renderToString(<DepartmentDetail />);
    const inside = tablistHtml(html);
    expect(inside).not.toContain('새 공간 만들기');
    expect(inside).not.toContain('공간 관리</h4>');
  });
});
