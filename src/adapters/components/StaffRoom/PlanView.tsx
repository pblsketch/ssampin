/**
 * 온라인 교무실 — 부서 일정 · 업무 분담 (M4 · §8-B)
 *
 * 계획서 §8-B 는 이 둘을 "쌤핀이라서 되는 것"으로 꼽았다 —
 * 부서 회의가 **내 시간표 위에** 뜨고, 누가 뭘 맡았는지가 **내 할 일 화면까지** 내려온다.
 * 이 화면은 그 둘을 **부서 쪽에서 만들고 보는** 자리다.
 *
 * ★ §8-E — 사람별 누적을 보여주지 않는다. "누가 몇 개 끝냈나" 같은 표는 만들지 않는다.
 *   업무는 **무엇이 남았는지**를 보여주는 곳이지 사람을 줄 세우는 곳이 아니다.
 */
import { useEffect, useState } from 'react';
import { useStaffRoomPlanStore } from '@adapters/stores/useStaffRoomPlanStore';
import { useStaffRoomStore } from '@adapters/stores/useStaffRoomStore';
import { useGoogleAccountStore } from '@adapters/stores/useGoogleAccountStore';
import { displayNameOf } from '@domain/rules/staffRoomBoardPermission';
import {
  canEditEvent,
  canEditTask,
  canToggleTaskDone,
  checkEvent,
  checkTask,
  isTaskOverdue,
} from '@domain/rules/staffRoomRoomRules';
import {
  STAFFROOM_ROOM_TITLE_MAX_LENGTH,
  type StaffRoomEvent,
  type StaffRoomTask,
  type WriteStaffRoomEventInput,
  type WriteStaffRoomTaskInput,
} from '@domain/entities/StaffRoomRooms';

interface PlanViewProps {
  departmentId: string;
}

/** 오늘 YYYY-MM-DD */
function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const INPUT_CLASS =
  'rounded-xl border border-sp-border bg-sp-surface px-3 py-2.5 text-sm text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none';

/** 일정 만들기·고치기 */
function EventForm({
  departmentId,
  initial,
  eventId,
  onDone,
}: {
  departmentId: string;
  initial: WriteStaffRoomEventInput;
  eventId?: string;
  onDone: () => void;
}) {
  const saveEvent = useStaffRoomPlanStore((s) => s.saveEvent);
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);

  const check = checkEvent(form);

  const set = <K extends keyof WriteStaffRoomEventInput>(
    key: K,
    value: WriteStaffRoomEventInput[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    if (!check.ok || saving) return;
    setSaving(true);
    const ok = await saveEvent(departmentId, form, eventId);
    setSaving(false);
    if (ok) onDone();
  };

  return (
    <div className="space-y-3 rounded-xl border border-sp-border bg-sp-card p-4">
      <input
        type="text"
        value={form.title}
        onChange={(e) => set('title', e.target.value)}
        maxLength={STAFFROOM_ROOM_TITLE_MAX_LENGTH}
        placeholder="무슨 일정인가요? (예: 2학년부 협의회)"
        aria-label="일정 제목"
        className={`w-full ${INPUT_CLASS}`}
      />
      <div className="flex flex-wrap gap-3">
        <label className="text-xs text-sp-muted">
          시작
          <input
            type="date"
            value={form.startsOn}
            onChange={(e) => set('startsOn', e.target.value)}
            className={`mt-1 block ${INPUT_CLASS}`}
          />
        </label>
        <label className="text-xs text-sp-muted">
          마지막 날 <span className="text-sp-muted">(하루면 비워두세요)</span>
          <input
            type="date"
            value={form.endsOn ?? ''}
            onChange={(e) => set('endsOn', e.target.value || null)}
            className={`mt-1 block ${INPUT_CLASS}`}
          />
        </label>
        <label className="text-xs text-sp-muted">
          시각 <span className="text-sp-muted">(종일이면 비워두세요)</span>
          <input
            type="time"
            value={form.startTime ?? ''}
            onChange={(e) => set('startTime', e.target.value || null)}
            className={`mt-1 block ${INPUT_CLASS}`}
          />
        </label>
      </div>
      <input
        type="text"
        value={form.place}
        onChange={(e) => set('place', e.target.value)}
        placeholder="어디에서 (예: 2학년 교무실)"
        aria-label="장소"
        className={`w-full ${INPUT_CLASS}`}
      />
      <textarea
        value={form.memo}
        onChange={(e) => set('memo', e.target.value)}
        rows={2}
        placeholder="메모 (비워도 됩니다)"
        aria-label="메모"
        className={`w-full resize-y ${INPUT_CLASS}`}
      />

      {!check.ok && <p className="text-xs text-sp-danger">{check.message}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded-xl border border-sp-border px-4 py-2 text-sm font-sp-medium text-sp-text transition-colors hover:bg-sp-surface"
        >
          취소
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!check.ok || saving}
          className="rounded-xl bg-sp-accent px-4 py-2 text-sm font-sp-semibold text-white transition-all duration-sp-base ease-sp-out hover:shadow-sp-md disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? '저장하는 중…' : '저장'}
        </button>
      </div>
    </div>
  );
}

/** 업무 만들기·고치기 */
function TaskForm({
  departmentId,
  initial,
  taskId,
  onDone,
}: {
  departmentId: string;
  initial: WriteStaffRoomTaskInput;
  taskId?: string;
  onDone: () => void;
}) {
  const saveTask = useStaffRoomPlanStore((s) => s.saveTask);
  const members = useStaffRoomStore((s) => s.members);
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);

  const check = checkTask(form);

  const submit = async () => {
    if (!check.ok || saving) return;
    setSaving(true);
    const ok = await saveTask(departmentId, form, taskId);
    setSaving(false);
    if (ok) onDone();
  };

  return (
    <div className="space-y-3 rounded-xl border border-sp-border bg-sp-card p-4">
      <input
        type="text"
        value={form.title}
        onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
        maxLength={STAFFROOM_ROOM_TITLE_MAX_LENGTH}
        placeholder="무슨 일인가요? (예: 체육대회 물품 신청)"
        aria-label="업무 제목"
        className={`w-full ${INPUT_CLASS}`}
      />
      <div className="flex flex-wrap gap-3">
        <label className="min-w-0 flex-1 text-xs text-sp-muted">
          맡은 사람
          <select
            value={form.assigneeEmail ?? ''}
            onChange={(e) => setForm((p) => ({ ...p, assigneeEmail: e.target.value || null }))}
            className={`mt-1 block w-full ${INPUT_CLASS}`}
          >
            {/* 아직 아무도 안 정한 상태가 기본 — "누가 할까요"를 적어 둘 자리가 필요하다 */}
            <option value="">아직 안 정함</option>
            {members.map((m) => (
              <option key={m.id} value={m.email}>
                {displayNameOf({ email: m.email, displayName: m.displayName })}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-sp-muted">
          기한 <span className="text-sp-muted">(없으면 비워두세요)</span>
          <input
            type="date"
            value={form.dueOn ?? ''}
            onChange={(e) => setForm((p) => ({ ...p, dueOn: e.target.value || null }))}
            className={`mt-1 block ${INPUT_CLASS}`}
          />
        </label>
      </div>
      <textarea
        value={form.memo}
        onChange={(e) => setForm((p) => ({ ...p, memo: e.target.value }))}
        rows={2}
        placeholder="메모 (비워도 됩니다)"
        aria-label="메모"
        className={`w-full resize-y ${INPUT_CLASS}`}
      />

      {!check.ok && <p className="text-xs text-sp-danger">{check.message}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded-xl border border-sp-border px-4 py-2 text-sm font-sp-medium text-sp-text transition-colors hover:bg-sp-surface"
        >
          취소
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!check.ok || saving}
          className="rounded-xl bg-sp-accent px-4 py-2 text-sm font-sp-semibold text-white transition-all duration-sp-base ease-sp-out hover:shadow-sp-md disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? '저장하는 중…' : '저장'}
        </button>
      </div>
    </div>
  );
}

export function PlanView({ departmentId }: PlanViewProps) {
  const events = useStaffRoomPlanStore((s) => s.events);
  const tasks = useStaffRoomPlanStore((s) => s.tasks);
  const isLoading = useStaffRoomPlanStore((s) => s.isLoading);
  const error = useStaffRoomPlanStore((s) => s.error);
  const loadPlan = useStaffRoomPlanStore((s) => s.loadPlan);
  const removeEvent = useStaffRoomPlanStore((s) => s.removeEvent);
  const toggleTask = useStaffRoomPlanStore((s) => s.toggleTask);
  const removeTask = useStaffRoomPlanStore((s) => s.removeTask);
  const clearError = useStaffRoomPlanStore((s) => s.clearError);

  const myEmail = useGoogleAccountStore((s) => s.email) ?? '';
  const myRole = useStaffRoomStore((s) => s.currentDepartment?.myRole) ?? null;

  const [eventForm, setEventForm] = useState<{ open: boolean; editing: StaffRoomEvent | null }>({
    open: false,
    editing: null,
  });
  const [taskForm, setTaskForm] = useState<{ open: boolean; editing: StaffRoomTask | null }>({
    open: false,
    editing: null,
  });

  useEffect(() => {
    void loadPlan(departmentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId]);

  const now = today();

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-sp-danger bg-sp-surface p-4">
          <p className="text-sm leading-relaxed text-sp-danger">{error}</p>
          <button
            type="button"
            onClick={clearError}
            aria-label="안내 닫기"
            className="shrink-0 rounded-lg p-1 text-sp-muted hover:text-sp-text"
          >
            <span className="material-symbols-outlined text-icon-sm">close</span>
          </button>
        </div>
      )}

      {/* ── 부서 일정 ─────────────────────────────────────────────── */}
      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-sp-semibold text-sp-text">부서 일정</h3>
            <p className="text-xs text-sp-muted">여기 적은 일정은 내 달력에도 함께 뜹니다.</p>
          </div>
          {!eventForm.open && (
            <button
              type="button"
              onClick={() => setEventForm({ open: true, editing: null })}
              className="flex items-center gap-1.5 rounded-xl border border-sp-border px-3 py-2 text-sm font-sp-medium text-sp-text transition-colors hover:bg-sp-surface"
            >
              <span className="material-symbols-outlined text-icon-sm">event</span>일정 추가
            </button>
          )}
        </div>

        {eventForm.open && (
          <EventForm
            departmentId={departmentId}
            eventId={eventForm.editing?.id}
            initial={
              eventForm.editing
                ? {
                    title: eventForm.editing.title,
                    startsOn: eventForm.editing.startsOn,
                    endsOn: eventForm.editing.endsOn,
                    startTime: eventForm.editing.startTime,
                    place: eventForm.editing.place,
                    memo: eventForm.editing.memo,
                  }
                : {
                    title: '',
                    startsOn: now,
                    endsOn: null,
                    startTime: null,
                    place: '',
                    memo: '',
                  }
            }
            onDone={() => setEventForm({ open: false, editing: null })}
          />
        )}

        {!isLoading && events.length === 0 && !eventForm.open && (
          <p className="rounded-xl border border-dashed border-sp-border bg-sp-card px-4 py-8 text-center text-xs text-sp-muted">
            아직 부서 일정이 없습니다. 협의회·행사를 적어두면 부서 선생님들 달력에 함께 뜹니다.
          </p>
        )}

        <ul className="space-y-2">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-sp-border bg-sp-card px-4 py-3"
            >
              <span className="material-symbols-outlined shrink-0 text-icon-sm text-sp-muted">
                event
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-sp-medium text-sp-text">{event.title}</p>
                <p className="truncate text-xs text-sp-muted">
                  {event.startsOn}
                  {event.endsOn && ` ~ ${event.endsOn}`}
                  {event.startTime && ` · ${event.startTime}`}
                  {event.place && ` · ${event.place}`}
                </p>
              </div>
              {canEditEvent(myEmail, myRole, event.authorEmail) && (
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => setEventForm({ open: true, editing: event })}
                    aria-label={`${event.title} 고치기`}
                    className="rounded-lg p-1.5 text-sp-muted transition-colors hover:text-sp-text"
                  >
                    <span className="material-symbols-outlined text-icon-sm">edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`"${event.title}" 일정을 지울까요?`)) {
                        void removeEvent(departmentId, event.id);
                      }
                    }}
                    aria-label={`${event.title} 지우기`}
                    className="rounded-lg p-1.5 text-sp-muted transition-colors hover:text-sp-danger"
                  >
                    <span className="material-symbols-outlined text-icon-sm">delete</span>
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* ── 업무 분담 ─────────────────────────────────────────────── */}
      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-sp-semibold text-sp-text">업무 분담</h3>
            <p className="text-xs text-sp-muted">
              맡은 분의 할 일 화면에도 내려갑니다. 끝냄 표시는 맡은 분이 합니다.
            </p>
          </div>
          {!taskForm.open && (
            <button
              type="button"
              onClick={() => setTaskForm({ open: true, editing: null })}
              className="flex items-center gap-1.5 rounded-xl border border-sp-border px-3 py-2 text-sm font-sp-medium text-sp-text transition-colors hover:bg-sp-surface"
            >
              <span className="material-symbols-outlined text-icon-sm">add_task</span>업무 추가
            </button>
          )}
        </div>

        {taskForm.open && (
          <TaskForm
            departmentId={departmentId}
            taskId={taskForm.editing?.id}
            initial={
              taskForm.editing
                ? {
                    title: taskForm.editing.title,
                    assigneeEmail: taskForm.editing.assigneeEmail,
                    dueOn: taskForm.editing.dueOn,
                    memo: taskForm.editing.memo,
                  }
                : { title: '', assigneeEmail: null, dueOn: null, memo: '' }
            }
            onDone={() => setTaskForm({ open: false, editing: null })}
          />
        )}

        {!isLoading && tasks.length === 0 && !taskForm.open && (
          <p className="rounded-xl border border-dashed border-sp-border bg-sp-card px-4 py-8 text-center text-xs text-sp-muted">
            아직 나눈 업무가 없습니다. &ldquo;누가 뭘 맡았는지&rdquo;를 여기 적어두면 단체방에서
            흘러가 버리지 않습니다.
          </p>
        )}

        <ul className="space-y-2">
          {tasks.map((task) => {
            const overdue = isTaskOverdue(task, now);
            const mayToggle = canToggleTaskDone(myEmail, myRole, task.assigneeEmail);
            return (
              <li
                key={task.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-sp-border bg-sp-card px-4 py-3"
              >
                <button
                  type="button"
                  onClick={() => void toggleTask(departmentId, task.id, task.doneAt === null)}
                  disabled={!mayToggle}
                  aria-label={task.doneAt ? '안 끝난 것으로' : '끝냄으로'}
                  aria-pressed={task.doneAt !== null}
                  title={mayToggle ? undefined : '맡은 분과 관리자만 표시할 수 있습니다'}
                  className="shrink-0 rounded-lg p-1 text-sp-muted transition-colors hover:text-sp-accent disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="material-symbols-outlined text-icon-md">
                    {task.doneAt ? 'check_circle' : 'radio_button_unchecked'}
                  </span>
                </button>

                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm font-sp-medium ${
                      task.doneAt ? 'text-sp-muted line-through' : 'text-sp-text'
                    }`}
                  >
                    {task.title}
                  </p>
                  <p className="truncate text-xs text-sp-muted">
                    {task.assigneeEmail
                      ? displayNameOf({
                          email: task.assigneeEmail,
                          displayName: task.assigneeName,
                        })
                      : '아직 안 정함'}
                    {task.dueOn && (
                      <span className={overdue ? 'text-sp-danger' : undefined}>
                        {' '}
                        · {task.dueOn}까지{overdue && ' (지났습니다)'}
                      </span>
                    )}
                  </p>
                </div>

                {canEditTask(myEmail, myRole, task.authorEmail) && (
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => setTaskForm({ open: true, editing: task })}
                      aria-label={`${task.title} 고치기`}
                      className="rounded-lg p-1.5 text-sp-muted transition-colors hover:text-sp-text"
                    >
                      <span className="material-symbols-outlined text-icon-sm">edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`"${task.title}" 업무를 지울까요?`)) {
                          void removeTask(departmentId, task.id);
                        }
                      }}
                      aria-label={`${task.title} 지우기`}
                      className="rounded-lg p-1.5 text-sp-muted transition-colors hover:text-sp-danger"
                    >
                      <span className="material-symbols-outlined text-icon-sm">delete</span>
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
