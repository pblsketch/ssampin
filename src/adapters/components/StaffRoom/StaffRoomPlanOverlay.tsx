/**
 * 온라인 교무실 — 부서 일정·업무를 내 화면에 겹쳐 보여주기 (M4 · §8-B)
 *
 * 계획서 §8-B 가 "쌤핀이라서 되는 것"으로 꼽은 대목이다 —
 * **부서 회의가 내 시간표 위에 뜨고, 누가 뭘 맡았는지가 개인 화면까지 내려온다.**
 *
 * ── 왜 개인 일정·할 일에 섞지 않고 따로 그리는가 ────────────────────
 *
 * 1) **부서가 주인이다.** 개인 일정 표에 복사해 넣으면 부서를 나간 뒤에도 남고,
 *    부서에서 날짜를 고쳐도 이미 복사된 것은 안 바뀐다(§8-B).
 * 2) **편집 경로로 새면 안 된다.** 개인 일정 목록에 끼워 넣으면 누르는 순간
 *    일정 편집창이 열리고 저장·구글 동기화 경로로 흘러간다. 부서 일정은 부서
 *    화면에서만 고쳐야 한다.
 * 3) 그래서 여기 있는 것은 전부 **읽기 전용**이다. 고치려면 교무실로 간다.
 *
 * 이 파일 하나에 불러오기·판정·표시를 다 담아, 일정·할 일 화면에는 몇 줄만 얹는다.
 */
import { useEffect, useMemo } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useStaffRoomStore } from '@adapters/stores/useStaffRoomStore';
import { useStaffRoomPlanStore } from '@adapters/stores/useStaffRoomPlanStore';
import { eventCoversDate, isTaskOverdue } from '@domain/rules/staffRoomRoomRules';
import type { StaffRoomEvent, StaffRoomTask } from '@domain/entities/StaffRoomRooms';

/**
 * 내가 멤버인 부서들의 일정·업무를 받아 둔다.
 *
 * 부서 목록이 아직 없으면 함께 불러온다 — 일정 화면은 교무실을 한 번도 안 연
 * 상태에서도 열리기 때문이다.
 */
const NO_EVENTS: readonly StaffRoomEvent[] = [];
const NO_TASKS: readonly StaffRoomTask[] = [];

export function useStaffRoomPlanOverlay(): {
  events: readonly StaffRoomEvent[];
  tasks: readonly StaffRoomTask[];
} {
  // 실험실 게이트 (2026-08-24 오너 결정) — 실험실에서 안 켠 선생님에게는 그리지도,
  // **서버를 부르지도** 않는다. 일정·할 일 화면은 교무실과 무관하게 매일 열리는 화면이라
  // 여기서 안 막으면 안 쓰는 대부분의 선생님 PC가 헛요청을 보낸다.
  const staffRoomEnabled = useSettingsStore((s) => s.settings.staffRoomEnabled === true);

  const departments = useStaffRoomStore((s) => s.departments);
  const hasLoadedDepartments = useStaffRoomStore((s) => s.hasLoadedDepartments);
  const loadDepartments = useStaffRoomStore((s) => s.loadDepartments);
  const myEvents = useStaffRoomPlanStore((s) => s.myEvents);
  const myTasks = useStaffRoomPlanStore((s) => s.myTasks);
  const loadMyPlan = useStaffRoomPlanStore((s) => s.loadMyPlan);

  // ★ `departments.length === 0` 이 아니라 **불러온 적이 있는가**로 판단한다.
  //   교무실을 안 쓰는 선생님은 부서가 0개인데, 개수로 보면 할 일 화면을 열 때마다
  //   서버를 부르게 된다. 대부분의 선생님이 여기 해당한다.
  useEffect(() => {
    if (!staffRoomEnabled) {
      // 끄면 캐시도 버린다 — 켜기→부서 가입→끄기→다시 켜기 흐름에서
      // hasLoadedDepartments 가 true 로 남아 옛 부서 목록을 한 박자 그리는 것을 막는다.
      if (useStaffRoomStore.getState().hasLoadedDepartments) {
        useStaffRoomStore.setState({ departments: [], hasLoadedDepartments: false });
        useStaffRoomPlanStore.getState().reset();
      }
      return;
    }
    if (!hasLoadedDepartments) void loadDepartments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffRoomEnabled, hasLoadedDepartments]);

  // 부서 목록이 바뀔 때만 다시 받는다 — 달을 넘길 때마다 부르지 않는다
  const departmentIds = useMemo(() => departments.map((d) => d.id).join(','), [departments]);

  useEffect(() => {
    if (!staffRoomEnabled) return;
    if (departmentIds.length === 0) return;
    void loadMyPlan(departmentIds.split(','));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffRoomEnabled, departmentIds]);

  // 부서가 하나도 없으면 그릴 것도 없다 — 교무실을 안 쓰는 분에게는 아무것도 안 보인다

  if (!staffRoomEnabled) return { events: NO_EVENTS, tasks: NO_TASKS };
  return { events: myEvents, tasks: myTasks };
}

/** 이 날짜에 걸리는 부서 일정 — 일정 화면의 하루 목록 아래에 붙인다 */
export function StaffRoomDayEvents({ dateKey }: { dateKey: string }) {
  const { events } = useStaffRoomPlanOverlay();

  const todays = useMemo(
    () => events.filter((e) => eventCoversDate(e, dateKey)),
    [events, dateKey],
  );

  if (todays.length === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-sp-border bg-sp-surface p-3">
      <h4 className="flex items-center gap-1.5 text-xs font-sp-semibold text-sp-muted">
        <span className="material-symbols-outlined text-icon-sm">groups</span>
        부서 일정
      </h4>
      <ul className="mt-2 space-y-1.5">
        {todays.map((event) => (
          <li key={event.id} className="flex flex-wrap items-baseline gap-x-2 text-xs">
            <span className="shrink-0 rounded-full border border-sp-border px-2 py-0.5 text-[11px] text-sp-muted">
              {event.departmentName}
            </span>
            <span className="min-w-0 flex-1 truncate text-sp-text">{event.title}</span>
            {event.startTime && <span className="shrink-0 text-sp-muted">{event.startTime}</span>}
            {event.place && <span className="shrink-0 text-sp-muted">{event.place}</span>}
          </li>
        ))}
      </ul>
      {/* 고치려면 교무실로 — 여기서 누르면 개인 일정 편집창이 열려 버린다 */}
      <p className="mt-2 text-[11px] text-sp-muted">
        온라인 교무실에서 만든 일정입니다. 고치려면 교무실에서 열어주세요.
      </p>
    </div>
  );
}

/**
 * 나에게 맡겨진 부서 업무 — 할 일 화면 위에 붙인다.
 *
 * ★ 끝난 일은 빼고 보여준다. 할 일 화면은 **무엇이 남았는지** 보는 곳이다.
 *   끝낸 개수를 세어 보여주지 않는다(§8-E 활동 포인트 금지).
 */
export function StaffRoomMyTasks({ myEmail }: { myEmail: string | null }) {
  const { tasks } = useStaffRoomPlanOverlay();

  const mine = useMemo(() => {
    if (!myEmail) return [];
    const me = myEmail.trim().toLowerCase();
    return tasks.filter((t) => t.doneAt === null && t.assigneeEmail?.trim().toLowerCase() === me);
  }, [tasks, myEmail]);

  if (mine.length === 0) return null;

  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  return (
    <div className="rounded-xl border border-sp-border bg-sp-surface p-3">
      <h4 className="flex items-center gap-1.5 text-xs font-sp-semibold text-sp-muted">
        <span className="material-symbols-outlined text-icon-sm">groups</span>
        부서에서 맡은 일 {mine.length}
      </h4>
      <ul className="mt-2 space-y-1.5">
        {mine.map((task) => {
          const overdue = isTaskOverdue(task, todayKey);
          return (
            <li key={task.id} className="flex flex-wrap items-baseline gap-x-2 text-xs">
              <span className="shrink-0 rounded-full border border-sp-border px-2 py-0.5 text-[11px] text-sp-muted">
                {task.departmentName}
              </span>
              <span className="min-w-0 flex-1 truncate text-sp-text">{task.title}</span>
              {task.dueOn && (
                <span className={`shrink-0 ${overdue ? 'text-sp-danger' : 'text-sp-muted'}`}>
                  {task.dueOn}까지{overdue && ' (지났습니다)'}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-sp-muted">
        온라인 교무실의 업무 분담입니다. 끝냄 표시는 교무실에서 해주세요.
      </p>
    </div>
  );
}
