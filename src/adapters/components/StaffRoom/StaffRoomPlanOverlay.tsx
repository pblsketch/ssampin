/**
 * 온라인 교무실 — 부서 일정·업무·제출 과제를 내 화면에 겹쳐 보여주기 (M4 · §8-B, 069)
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
 * 3) **예외는 딱 하나, 내 칸의 완료 표시뿐이다** (오너 결정, 2026-09-07).
 *    부서 일정·업무는 여전히 전부 읽기 전용이고, 제출 과제도 제목·마감·주체는
 *    여기서 못 고친다 — 오직 "냈음" 체크 하나만 이 화면에서 바로 켜고 끌 수 있다.
 *    **이 예외를 넓히려면**(다른 칸도 여기서 고치게 하려면) 먼저 회귀 검사
 *    `REGRESSION #68-3`(`scripts/regression-grep-check.mjs`)을 지우거나 고쳐야 한다 —
 *    그 검사가 이 파일에서 제출 과제 스토어의 완료 토글(`toggleDone`) 통로 하나만
 *    쓰는지 잠가 둔다.
 *
 * 이 파일 하나에 불러오기·판정·표시를 다 담아, 일정·할 일 화면에는 몇 줄만 얹는다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useStaffRoomStore } from '@adapters/stores/useStaffRoomStore';
import { useStaffRoomPlanStore } from '@adapters/stores/useStaffRoomPlanStore';
import { useStaffRoomSubmissionStore } from '@adapters/stores/useStaffRoomSubmissionStore';
import { eventCoversDate, isTaskOverdue } from '@domain/rules/staffRoomRoomRules';
import type { StaffRoomEvent, StaffRoomTask } from '@domain/entities/StaffRoomRooms';
import type { StaffRoomMySubmission } from '@domain/entities/StaffRoomSubmission';

/**
 * 내가 멤버인 부서들의 일정·업무를 받아 둔다.
 *
 * 부서 목록이 아직 없으면 함께 불러온다 — 일정 화면은 교무실을 한 번도 안 연
 * 상태에서도 열리기 때문이다.
 */
const NO_EVENTS: readonly StaffRoomEvent[] = [];
const NO_TASKS: readonly StaffRoomTask[] = [];
const NO_SUBMISSIONS: readonly StaffRoomMySubmission[] = [];

export function useStaffRoomPlanOverlay(): {
  events: readonly StaffRoomEvent[];
  tasks: readonly StaffRoomTask[];
  submissions: readonly StaffRoomMySubmission[];
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
  // 제출 과제의 정본은 이 스토어다(`useStaffRoomSubmissionStore.ts` 머리 주석 참고).
  // `loadMyPlan` 이 왕복 응답의 제출 과제를 `receiveMine` 으로 이미 여기 넘겨 둔다 —
  // 이 훅이 또 서버를 부르지 않는다.
  const mySubmissions = useStaffRoomSubmissionStore((s) => s.mySubmissions);

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

  if (!staffRoomEnabled) return { events: NO_EVENTS, tasks: NO_TASKS, submissions: NO_SUBMISSIONS };
  return { events: myEvents, tasks: myTasks, submissions: mySubmissions };
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
 * 나에게 맡겨진 부서 업무 + 내가 낼 제출 과제 — 할 일 화면 위에 붙인다.
 *
 * ── 두 구역이 "끝난 것"을 다르게 다루는 이유 (2026-09-07, 069) ──────────
 * 부서 업무(`mine`)는 지금까지처럼 **끝난 것을 뺀다** — 이 화면에서는 체크할 수
 * 없으니(끝냄 표시는 교무실에서만 한다) 사라져도 되돌릴 방법이 없다.
 *
 * 제출 과제(`mySubmissions`)는 **끝난 것도 그대로, 체크된 채로 보여준다** — 완료
 * 표시를 이 화면에서 바로 켜고 끄기 때문이다. 누르는 순간 줄이 사라지면 잘못
 * 누른 것을 되돌릴 길이 없다. 서버가 이미 "미완료 전부 + 최근 14일 완료분"만
 * 실어 주므로(`useStaffRoomSubmissionStore.ts` 참고) 무한정 쌓이지 않는다.
 *
 * ★ 두 구역 모두 §8-E(사람별 누적 표시 금지)를 지킨다 — 부서 업무 개수는 원래도
 *   "남은 일" 개수였고, 제출 과제 개수도 **미완료만** 센다. "N개 중 M개 냈다"처럼
 *   보이면 사람별 누적 실적으로 읽힌다.
 */
export function StaffRoomMyTasks({ myEmail }: { myEmail: string | null }) {
  const { tasks, submissions } = useStaffRoomPlanOverlay();

  // ★ 완료 표시를 바꾸는 통로 하나만 연다 — `saveSubmission`·`removeSubmission`
  //   같은 쓰기 전체를 컴포넌트에 노출하면 "여기서 제목·마감도 고칠 수 있지 않을까"로
  //   자연스럽게 번진다. `REGRESSION #68-3`(scripts/regression-grep-check.mjs)이
  //   이 파일에서 `toggleDone` 외의 제출 과제 스토어 API 호출을 막는다.
  const toggleDone = useStaffRoomSubmissionStore((s) => s.toggleDone);
  const mySubmissionsTruncated = useStaffRoomSubmissionStore((s) => s.mySubmissionsTruncated);

  // 두 번 누르기 방지는 ref 로 막는다 — useState 값으로 막으면, 두 클릭이 리액트가
  // 상태를 갱신하기 전의 같은 "아직 안 눌렀다" 값을 보고 둘 다 통과해 버린다
  // (상태 갱신은 비동기). ref 는 그 자리에서 바로 바뀌므로 두 번째 클릭이 확실히 막힌다.
  const pendingToggles = useRef<Set<string>>(new Set());
  const [, forceRerender] = useState(0);

  const handleToggleSubmission = (
    departmentId: string,
    submissionId: string,
    nextDone: boolean,
  ) => {
    if (pendingToggles.current.has(submissionId)) return;
    pendingToggles.current.add(submissionId);
    forceRerender((n) => n + 1);
    void toggleDone(departmentId, submissionId, nextDone).finally(() => {
      pendingToggles.current.delete(submissionId);
      forceRerender((n) => n + 1);
    });
  };

  const mine = useMemo(() => {
    if (!myEmail) return [];
    const me = myEmail.trim().toLowerCase();
    return tasks.filter((t) => t.doneAt === null && t.assigneeEmail?.trim().toLowerCase() === me);
  }, [tasks, myEmail]);

  // 제출 과제는 서버가 이미 "나를 주체로 건 것"만 실어 준다(구글 계정이 없으면
  // 애초에 받아 오지도 못한다) — 여기서 또 이메일로 거르지 않는다. 다만 구글
  // 계정 자체가 없는 화면(myEmail === null)에서는 부서 업무와 같은 규칙으로 숨긴다.
  const mySubmissions = myEmail ? submissions : [];
  const pendingSubmissionCount = mySubmissions.filter((s) => s.myDoneAt === null).length;

  // ★ 함정: 부서 업무가 0건이어도 제출 과제가 있으면 그려야 한다. 둘 다 없을 때만 숨긴다.
  if (mine.length === 0 && mySubmissions.length === 0) return null;

  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  return (
    <div className="flex flex-col gap-3">
      {mine.length > 0 && (
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
                    <span className={`shrink-0 ${overdue ? 'text-sp-error' : 'text-sp-muted'}`}>
                      {task.dueOn}까지{overdue && ' (지났습니다)'}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {/* 이 안내는 부서 업무에만 해당한다 — 제출 과제는 바로 아래에서 직접 체크한다 */}
          <p className="mt-2 text-[11px] text-sp-muted">
            온라인 교무실의 업무 분담입니다. 끝냄 표시는 교무실에서 해주세요.
          </p>
        </div>
      )}

      {mySubmissions.length > 0 && (
        <div className="rounded-xl border border-sp-border bg-sp-surface p-3">
          <h4 className="flex items-center gap-1.5 text-xs font-sp-semibold text-sp-muted">
            <span className="material-symbols-outlined text-icon-sm">assignment_turned_in</span>
            내가 낼 것 {pendingSubmissionCount}
          </h4>
          <ul className="mt-2 space-y-1.5">
            {mySubmissions.map((sub) => {
              const done = sub.myDoneAt !== null;
              const overdue = isTaskOverdue({ dueOn: sub.dueOn, doneAt: sub.myDoneAt }, todayKey);
              const pending = pendingToggles.current.has(sub.id);
              return (
                <li key={sub.id} className="flex flex-wrap items-center gap-x-2 text-xs">
                  <button
                    type="button"
                    onClick={() => handleToggleSubmission(sub.departmentId, sub.id, !done)}
                    disabled={pending}
                    aria-pressed={done}
                    aria-label={`${sub.title} ${done ? '제출 완료 해제' : '제출 완료로 표시'}`}
                    className={`shrink-0 rounded-full transition-colors duration-sp-base ease-sp-out disabled:opacity-50 ${
                      done ? 'text-sp-success' : 'text-sp-muted hover:text-sp-accent'
                    }`}
                  >
                    <span className="material-symbols-outlined text-icon-md">
                      {done ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                  </button>
                  <span className="shrink-0 rounded-full border border-sp-border px-2 py-0.5 text-[11px] text-sp-muted">
                    {sub.departmentName}
                  </span>
                  <span
                    className={`min-w-0 flex-1 truncate ${done ? 'text-sp-muted line-through' : 'text-sp-text'}`}
                  >
                    {sub.title}
                  </span>
                  {sub.dueOn && (
                    <span className={`shrink-0 ${overdue ? 'text-sp-error' : 'text-sp-muted'}`}>
                      {sub.dueOn}까지{overdue && ' (지났습니다)'}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {mySubmissionsTruncated && (
            <p className="mt-2 text-[11px] text-sp-muted">
              한 번에 다 보여드리기엔 너무 많아 일부만 보여드립니다. 전체 목록은 온라인 교무실에서
              확인해주세요.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
