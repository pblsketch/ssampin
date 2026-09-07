/**
 * 제출 과제 스토어 — **정본이 하나인지** 확인한다.
 *
 * 막으려는 사고: 개인 할 일 화면에서 "냈음"을 눌렀는데 교무실 진행률이 안 바뀌는 것.
 * 두 화면이 서로 다른 스토어를 보면 그렇게 되고, 사용자는 저장이 안 된 줄 알고
 * 두 번 누른다. 그 상태는 타입 검사도 린트도 못 잡는다.
 *
 * 그리고 `mine` 왕복이 한 번뿐인지도 함께 본다 — 매일 열리는 화면이라
 * 여기서 두 배가 되면 교무실 전체가 느려진 것처럼 느껴진다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffRoomSubmission } from '@domain/entities/StaffRoomSubmission';

const listMyPlan = vi.fn();
const toggleSubmissionDone = vi.fn();
const listSubmissions = vi.fn();

vi.mock('@adapters/di/container', () => ({
  staffRoomPort: {
    listMyPlan: (...args: unknown[]) => listMyPlan(...args),
    toggleSubmissionDone: (...args: unknown[]) => toggleSubmissionDone(...args),
    listSubmissions: (...args: unknown[]) => listSubmissions(...args),
  },
  authenticateGoogle: {
    isConnected: () => Promise.resolve(true),
    getValidAccessToken: () => Promise.resolve('token'),
  },
}));

const { useStaffRoomSubmissionStore } =
  await import('@adapters/stores/useStaffRoomSubmissionStore');
const { useStaffRoomPlanStore } = await import('@adapters/stores/useStaffRoomPlanStore');

const BASE: StaffRoomSubmission = {
  id: 's1',
  moduleId: 'mod1',
  title: '2학기 수행평가 계획 제출',
  dueOn: '2026-09-15',
  guide: '',
  docUrl: '',
  authorEmail: 'author@school.kr',
  doneCount: 0,
  totalCount: 2,
  myDoneAt: null,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  useStaffRoomSubmissionStore.setState({
    submissions: [],
    mySubmissions: [],
    mySubmissionsTruncated: false,
    targets: null,
    error: null,
    droppedTargets: 0,
  });
});

describe('제출 과제 정본 스토어', () => {
  it('★ 개인 화면에서 체크하면 교무실 목록의 진행률도 곧바로 바뀐다', async () => {
    // 교무실 목록과 개인 화면에 같은 과제가 들어 있는 상태
    useStaffRoomSubmissionStore.setState({
      submissions: [BASE],
      mySubmissions: [{ ...BASE, departmentId: 'dep1', departmentName: '2학년부' }],
    });

    toggleSubmissionDone.mockResolvedValue({
      ...BASE,
      doneCount: 1,
      myDoneAt: '2026-09-10T00:00:00Z',
    });

    const ok = await useStaffRoomSubmissionStore.getState().toggleDone('dep1', 's1', true);
    expect(ok).toBe(true);

    const state = useStaffRoomSubmissionStore.getState();
    // 두 목록이 같은 숫자를 말해야 한다
    expect(state.submissions[0]?.doneCount).toBe(1);
    expect(state.mySubmissions[0]?.doneCount).toBe(1);
    expect(state.mySubmissions[0]?.myDoneAt).toBe('2026-09-10T00:00:00Z');
    // 개인 화면 줄은 부서 이름을 잃지 않는다
    expect(state.mySubmissions[0]?.departmentName).toBe('2학년부');
  });

  it('★ 체크를 되돌리면 그 자리에서 다시 0으로 — 줄이 사라지지 않는다', async () => {
    useStaffRoomSubmissionStore.setState({
      mySubmissions: [
        {
          ...BASE,
          doneCount: 1,
          myDoneAt: '2026-09-10T00:00:00Z',
          departmentId: 'dep1',
          departmentName: '2학년부',
        },
      ],
    });

    toggleSubmissionDone.mockResolvedValue({ ...BASE, doneCount: 0, myDoneAt: null });
    await useStaffRoomSubmissionStore.getState().toggleDone('dep1', 's1', false);

    const mine = useStaffRoomSubmissionStore.getState().mySubmissions;
    expect(mine).toHaveLength(1); // 사라지면 되돌릴 방법이 없어진다
    expect(mine[0]?.myDoneAt).toBeNull();
  });

  it('남의 칸을 건드리면 서버가 거절하고 그 말을 그대로 보여준다', async () => {
    toggleSubmissionDone.mockRejectedValue(
      new Error('글을 쓴 분이나 부서 관리자만 할 수 있습니다.'),
    );
    const ok = await useStaffRoomSubmissionStore
      .getState()
      .toggleDone('dep1', 's1', true, 'x@a.kr');
    expect(ok).toBe(false);
    expect(useStaffRoomSubmissionStore.getState().error).toContain('관리자만');
  });
});

describe('개인 화면 왕복 — 한 번만 부른다', () => {
  it('★ loadMyPlan 한 번으로 일정·업무·제출 과제가 함께 온다', async () => {
    listMyPlan.mockResolvedValue({
      events: [],
      tasks: [],
      submissions: [{ ...BASE, departmentId: 'dep1', departmentName: '2학년부' }],
      submissionsTruncated: false,
    });

    await useStaffRoomPlanStore.getState().loadMyPlan(['dep1']);

    // 왕복은 딱 한 번 — 제출 스토어가 따로 서버를 부르지 않는다
    expect(listMyPlan).toHaveBeenCalledTimes(1);
    expect(listSubmissions).not.toHaveBeenCalled();
    expect(useStaffRoomSubmissionStore.getState().mySubmissions).toHaveLength(1);
  });

  it('상한에 닿으면 잘렸다고 알린다 — 조용히 잘리지 않는다', async () => {
    listMyPlan.mockResolvedValue({
      events: [],
      tasks: [],
      submissions: [],
      submissionsTruncated: true,
    });
    await useStaffRoomPlanStore.getState().loadMyPlan(['dep1']);
    expect(useStaffRoomSubmissionStore.getState().mySubmissionsTruncated).toBe(true);
  });

  it('옛 서버가 제출 과제를 안 보내도 화면이 안 깨진다', async () => {
    // 서버를 먼저 배포하는 순서를 지키면 안 생기는 상황이지만, 배포 사이의
    // 짧은 틈에 옛 응답을 받을 수 있다.
    listMyPlan.mockResolvedValue({ events: [], tasks: [] });
    await useStaffRoomPlanStore.getState().loadMyPlan(['dep1']);
    expect(useStaffRoomSubmissionStore.getState().mySubmissions).toEqual([]);
  });
});
