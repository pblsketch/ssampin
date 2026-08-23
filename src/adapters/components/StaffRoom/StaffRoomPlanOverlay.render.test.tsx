/**
 * 부서 일정·업무 겹쳐 보기 (M4 · §8-B) — 정적 렌더 테스트
 *
 * 잠그는 것:
 *   §8-B  부서 일정은 **읽기 전용**이다. 고치는 단추가 여기 생기면 안 된다 —
 *         개인 일정 편집·구글 동기화 경로로 흘러가기 때문이다.
 *   §8-B  여러 부서가 겹쳐 뜨므로 **어느 부서 것인지**가 함께 보인다.
 *   §8-E  끝낸 일은 세지 않는다. "몇 개 끝냈다" 같은 표시가 생기면 안 된다.
 *   기본  교무실을 안 쓰는 선생님(부서 0개)에게는 **아무것도 안 보인다.**
 *   실험실  설정 > 실험실 기능에서 안 켰으면 일정이 있어도 **아무것도 안 보인다** (2026-08-24).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { StaffRoomEvent, StaffRoomTask } from '@domain/entities/StaffRoomRooms';

const noop = () => {};
const asyncNoop = async () => {};

let departments: Array<{ id: string; name: string }> = [];
let myEvents: StaffRoomEvent[] = [];
let myTasks: StaffRoomTask[] = [];
let staffRoomEnabled = true;

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

describe('교무실을 안 쓰는 선생님', () => {
  it('★ 부서가 없으면 일정·할 일 화면에 아무것도 안 보인다', () => {
    departments = [];
    myEvents = [];
    myTasks = [];
    expect(renderDay('2026-08-21')).toBe('');
    expect(renderTasks('lee@school.kr')).toBe('');
  });
});
