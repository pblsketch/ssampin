/**
 * 부서 일정·업무·제출 과제 겹쳐 보기 (M4 · §8-B, 069) — 정적 렌더 테스트
 *
 * 잠그는 것:
 *   §8-B  부서 일정·업무는 **읽기 전용**이다. 고치는 단추가 여기 생기면 안 된다 —
 *         개인 일정 편집·구글 동기화 경로로 흘러가기 때문이다.
 *   §8-B  여러 부서가 겹쳐 뜨므로 **어느 부서 것인지**가 함께 보인다.
 *   §8-E  끝낸 일은 세지 않는다. "몇 개 끝냈다" 같은 표시가 생기면 안 된다.
 *   기본  교무실을 안 쓰는 선생님(부서 0개)에게는 **아무것도 안 보인다.**
 *   실험실  설정 > 실험실 기능에서 안 켰으면 일정이 있어도 **아무것도 안 보인다** (2026-08-24).
 *   069   개인 화면의 유일한 예외 — 제출 과제의 "냈음" 체크만 여기서 바로 켜고 끌 수
 *         있다. 부서 업무·일정은 여전히 단추가 없어야 한다.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { StaffRoomEvent, StaffRoomTask } from '@domain/entities/StaffRoomRooms';
import type { StaffRoomMySubmission } from '@domain/entities/StaffRoomSubmission';

const noop = () => {};
const asyncNoop = async () => {};

let departments: Array<{ id: string; name: string }> = [];
let myEvents: StaffRoomEvent[] = [];
let myTasks: StaffRoomTask[] = [];
let staffRoomEnabled = true;
let mySubmissions: StaffRoomMySubmission[] = [];
let mySubmissionsTruncated = false;

vi.mock('@adapters/stores/useSettingsStore', () => ({
  useSettingsStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ settings: { staffRoomEnabled } }),
}));

vi.mock('@adapters/stores/useStaffRoomStore', () => ({
  useStaffRoomStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ departments, hasLoadedDepartments: true, loadDepartments: asyncNoop }),
}));

vi.mock('@adapters/stores/useStaffRoomPlanStore', () => ({
  useStaffRoomPlanStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ myEvents, myTasks, loadMyPlan: asyncNoop, reset: noop }),
}));

// ★ 오버레이 훅이 여기서 `mySubmissions`·`mySubmissionsTruncated`·`toggleDone` 만
//   읽는다(REGRESSION #68-3). 다른 필드를 셀렉터로 꺼내려 하면 이 mock 이 `undefined`
//   를 돌려주므로 여기서도 자연스럽게 드러난다.
vi.mock('@adapters/stores/useStaffRoomSubmissionStore', () => ({
  useStaffRoomSubmissionStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ mySubmissions, mySubmissionsTruncated, toggleDone: asyncNoop }),
}));

const { StaffRoomDayEvents, StaffRoomMyTasks } = await import('./StaffRoomPlanOverlay');

function makeEvent(over: Partial<StaffRoomEvent> = {}): StaffRoomEvent {
  return {
    id: 'e1',
    departmentId: 'd1',
    departmentName: '2학년부',
    title: '학년부 협의회',
    startsOn: '2026-08-21',
    endsOn: null,
    startTime: '14:30',
    place: '2학년 교무실',
    memo: '',
    authorEmail: 'kim@school.kr',
    authorName: '김부장',
    ...over,
  };
}

function makeTask(over: Partial<StaffRoomTask> = {}): StaffRoomTask {
  return {
    id: 't1',
    departmentId: 'd1',
    departmentName: '2학년부',
    title: '체육대회 물품 신청',
    assigneeEmail: 'lee@school.kr',
    assigneeName: '이선생',
    dueOn: '2026-08-25',
    memo: '',
    doneAt: null,
    authorEmail: 'kim@school.kr',
    routines: [],
    howto: [],
    handoverNotes: [],
    ...over,
  };
}

function makeSubmission(over: Partial<StaffRoomMySubmission> = {}): StaffRoomMySubmission {
  return {
    id: 's1',
    moduleId: 'm1',
    departmentId: 'd1',
    departmentName: '2학년부',
    title: '2학기 수행평가 계획 제출',
    dueOn: '2026-09-15',
    guide: '',
    docUrl: 'https://docs.google.com/x',
    authorEmail: 'kim@school.kr',
    doneCount: 3,
    totalCount: 10,
    myDoneAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...over,
  };
}

const renderDay = (dateKey: string) =>
  renderToString(<StaffRoomDayEvents dateKey={dateKey} />).replace(/<!-- -->/g, '');
const renderTasks = (email: string | null) =>
  renderToString(<StaffRoomMyTasks myEmail={email} />).replace(/<!-- -->/g, '');

beforeEach(() => {
  departments = [{ id: 'd1', name: '2학년부' }];
  myEvents = [];
  myTasks = [];
  staffRoomEnabled = true;
  mySubmissions = [];
  mySubmissionsTruncated = false;
});

describe('실험실 게이트 — 설정에서 안 켰으면 아무것도 안 보인다 (2026-08-24)', () => {
  it('일정이 있어도 안 뜬다', () => {
    staffRoomEnabled = false;
    myEvents = [makeEvent()];
    expect(renderDay('2026-08-21')).toBe('');
  });

  it('맡은 일이 있어도 안 뜬다', () => {
    staffRoomEnabled = false;
    myTasks = [makeTask()];
    expect(renderTasks('lee@school.kr')).toBe('');
  });

  it('제출 과제가 있어도 안 뜬다', () => {
    staffRoomEnabled = false;
    mySubmissions = [makeSubmission()];
    expect(renderTasks('lee@school.kr')).toBe('');
  });
});

describe('부서 일정 겹쳐 보기', () => {
  it('그날 일정이 있으면 보여준다', () => {
    myEvents = [makeEvent()];
    const html = renderDay('2026-08-21');
    expect(html).toContain('학년부 협의회');
    expect(html).toContain('14:30');
  });

  it('★ 어느 부서 것인지 함께 보인다 — 여러 부서가 겹쳐 뜨므로', () => {
    myEvents = [makeEvent()];
    expect(renderDay('2026-08-21')).toContain('2학년부');
  });

  it('다른 날에는 안 뜬다', () => {
    myEvents = [makeEvent()];
    expect(renderDay('2026-08-22')).toBe('');
  });

  it('★ 여러 날 걸친 일정은 중간 날에도 뜬다', () => {
    myEvents = [makeEvent({ endsOn: '2026-08-24' })];
    expect(renderDay('2026-08-23')).toContain('학년부 협의회');
  });

  it('★★ 고치거나 지우는 단추가 없다 — 있으면 개인 일정 편집 경로로 샌다', () => {
    myEvents = [makeEvent()];
    const html = renderDay('2026-08-21');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('edit');
    expect(html).not.toContain('delete');
  });

  it('어디서 고치는지 알려준다', () => {
    myEvents = [makeEvent()];
    expect(renderDay('2026-08-21')).toContain('교무실에서 열어주세요');
  });

  it('일정이 없으면 아무것도 그리지 않는다', () => {
    expect(renderDay('2026-08-21')).toBe('');
  });
});

describe('부서에서 맡은 일', () => {
  it('나에게 맡겨진 일을 보여준다', () => {
    myTasks = [makeTask()];
    const html = renderTasks('lee@school.kr');
    expect(html).toContain('체육대회 물품 신청');
    expect(html).toContain('2학년부');
  });

  it('★ 남에게 맡겨진 일은 내 화면에 안 뜬다', () => {
    myTasks = [makeTask({ assigneeEmail: 'other@school.kr' })];
    expect(renderTasks('lee@school.kr')).toBe('');
  });

  it('아직 아무도 안 맡은 일도 내 것이 아니다', () => {
    myTasks = [makeTask({ assigneeEmail: null })];
    expect(renderTasks('lee@school.kr')).toBe('');
  });

  it('★ 끝난 일은 빼고 보여준다 — 할 일 화면은 남은 것을 보는 곳이다', () => {
    myTasks = [makeTask({ doneAt: '2026-08-20T00:00:00.000Z' })];
    expect(renderTasks('lee@school.kr')).toBe('');
  });

  it('★★ 끝낸 개수를 세어 보여주지 않는다 (§8-E 활동 포인트 금지)', () => {
    myTasks = [makeTask(), makeTask({ id: 't2', doneAt: '2026-08-20T00:00:00.000Z' })];
    const html = renderTasks('lee@school.kr');
    for (const banned of ['완료 1', '1개 완료', '달성', '포인트', '점수', '순위']) {
      expect(html).not.toContain(banned);
    }
  });

  it('대소문자가 달라도 내 것으로 본다', () => {
    myTasks = [makeTask({ assigneeEmail: 'LEE@School.kr' })];
    expect(renderTasks('lee@school.kr')).toContain('체육대회 물품 신청');
  });

  it('구글 연결이 없으면 아무것도 안 보인다', () => {
    myTasks = [makeTask()];
    expect(renderTasks(null)).toBe('');
  });

  it('★ 끝냄 표시 단추가 없다 — 교무실에서 하도록 안내한다', () => {
    myTasks = [makeTask()];
    const html = renderTasks('lee@school.kr');
    expect(html).not.toContain('<button');
    expect(html).toContain('교무실에서 해주세요');
  });

  it('기한이 지난 일은 알려준다', () => {
    myTasks = [makeTask({ dueOn: '2020-01-01' })];
    expect(renderTasks('lee@school.kr')).toContain('지났습니다');
  });
});

describe('내가 낼 것 (제출 과제, 069) — 부서 업무와 다른 계약', () => {
  it('제출 과제를 보여준다', () => {
    mySubmissions = [makeSubmission()];
    const html = renderTasks('lee@school.kr');
    expect(html).toContain('2학기 수행평가 계획 제출');
    expect(html).toContain('2학년부');
  });

  it('★ 함정1 — 부서 업무가 0건이어도 제출 과제만 있으면 화면이 통째로 사라지지 않는다', () => {
    myTasks = [];
    mySubmissions = [makeSubmission()];
    expect(renderTasks('lee@school.kr')).not.toBe('');
  });

  it('부서 업무와 제출 과제가 둘 다 없으면 아무것도 안 그린다', () => {
    myTasks = [];
    mySubmissions = [];
    expect(renderTasks('lee@school.kr')).toBe('');
  });

  it('★ 함정2 — 끝낸 제출 과제도 빼지 않고 체크된 채로 보여준다 (되돌릴 수 있어야 하므로)', () => {
    mySubmissions = [makeSubmission({ myDoneAt: '2026-09-02T00:00:00.000Z' })];
    const html = renderTasks('lee@school.kr');
    expect(html).toContain('2학기 수행평가 계획 제출');
    expect(html).toContain('aria-pressed="true"');
  });

  it('아직 안 낸 것은 체크가 꺼진 채로 보여준다', () => {
    mySubmissions = [makeSubmission({ myDoneAt: null })];
    expect(renderTasks('lee@school.kr')).toContain('aria-pressed="false"');
  });

  it('★★ 함정3 — 개수는 미완료만 센다 (완료분을 더해 "N개 중 M개"처럼 세지 않는다, §8-E)', () => {
    mySubmissions = [
      makeSubmission({ id: 's1', myDoneAt: null }),
      makeSubmission({ id: 's2', myDoneAt: '2026-09-02T00:00:00.000Z' }),
      makeSubmission({ id: 's3', myDoneAt: '2026-09-02T00:00:00.000Z' }),
    ];
    const html = renderTasks('lee@school.kr');
    expect(html).toContain('내가 낼 것 1');
    for (const banned of [
      '3개 중',
      '1/3',
      '2개 완료',
      '완료 2',
      '달성',
      '포인트',
      '점수',
      '순위',
    ]) {
      expect(html).not.toContain(banned);
    }
  });

  it('★ 체크할 수 있는 단추가 있다 — 부서 업무와 달리 여기서는 바로 체크한다', () => {
    mySubmissions = [makeSubmission()];
    expect(renderTasks('lee@school.kr')).toContain('<button');
  });

  it('★ "교무실에서 해주세요" 안내가 제출 과제 구역에는 없다 — 여기서 직접 체크하므로', () => {
    myTasks = [];
    mySubmissions = [makeSubmission()];
    expect(renderTasks('lee@school.kr')).not.toContain('교무실에서 해주세요');
  });

  it('일부만 보내졌으면 안내한다', () => {
    mySubmissions = [makeSubmission()];
    mySubmissionsTruncated = true;
    expect(renderTasks('lee@school.kr')).toContain('일부만 보여드립니다');
  });

  it('잘리지 않았으면 안내하지 않는다', () => {
    mySubmissions = [makeSubmission()];
    mySubmissionsTruncated = false;
    expect(renderTasks('lee@school.kr')).not.toContain('일부만 보여드립니다');
  });

  it('구글 연결이 없으면 제출 과제도 안 보인다', () => {
    mySubmissions = [makeSubmission()];
    expect(renderTasks(null)).toBe('');
  });

  it('기한이 지났고 아직 안 냈으면 알려준다', () => {
    mySubmissions = [makeSubmission({ dueOn: '2020-01-01', myDoneAt: null })];
    expect(renderTasks('lee@school.kr')).toContain('지났습니다');
  });

  it('기한이 지났어도 이미 냈으면 재촉하지 않는다', () => {
    mySubmissions = [makeSubmission({ dueOn: '2020-01-01', myDoneAt: '2020-01-02T00:00:00.000Z' })];
    expect(renderTasks('lee@school.kr')).not.toContain('지났습니다');
  });
});

describe('교무실을 안 쓰는 선생님', () => {
  it('★ 부서가 없으면 일정·할 일 화면에 아무것도 안 보인다', () => {
    departments = [];
    myEvents = [];
    myTasks = [];
    expect(renderDay('2026-08-21')).toBe('');
    expect(renderTasks('lee@school.kr')).toBe('');
  });
});
