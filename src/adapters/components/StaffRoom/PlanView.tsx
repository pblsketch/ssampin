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
import { useStaffRoomLibraryStore } from '@adapters/stores/useStaffRoomLibraryStore';
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
  STAFFROOM_TASK_KNOWLEDGE_MAX_ITEMS,
  type StaffRoomEvent,
  type StaffRoomTask,
  type StaffRoomTaskForm,
  type StaffRoomTaskRoutine,
  type WriteStaffRoomEventInput,
  type WriteStaffRoomTaskInput,
} from '@domain/entities/StaffRoomRooms';
import { SchedulePasteModal } from './SchedulePasteModal';

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

      {!check.ok && <p className="text-xs text-sp-error">{check.message}</p>}

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

/**
 * 반복 업무 편집 — 주기·할 일을 한 쌍씩 적는다 (066 인수인계).
 *
 * "매주 금요일 / 주간 출결 통계 정리"처럼 두 칸이 뜻이 다르므로 문자열 하나로
 * 뭉쳐 받지 않고 처음부터 쌍으로 받는다.
 */
function RoutineListEditor({
  items,
  onChange,
}: {
  items: readonly StaffRoomTaskRoutine[];
  onChange: (next: StaffRoomTaskRoutine[]) => void;
}) {
  const atMax = items.length >= STAFFROOM_TASK_KNOWLEDGE_MAX_ITEMS;

  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-sp-medium text-sp-text">
        <span className="material-symbols-outlined text-icon-sm text-sp-muted">event_repeat</span>
        반복 업무
      </p>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              type="text"
              value={item.cycle}
              onChange={(e) =>
                onChange(
                  items.map((it, idx) => (idx === i ? { ...it, cycle: e.target.value } : it)),
                )
              }
              placeholder="매주 금요일"
              aria-label="반복 주기"
              className={`w-32 shrink-0 ${INPUT_CLASS}`}
            />
            <input
              type="text"
              value={item.what}
              onChange={(e) =>
                onChange(items.map((it, idx) => (idx === i ? { ...it, what: e.target.value } : it)))
              }
              placeholder="주간 출결 통계 정리"
              aria-label="할 일"
              className={`flex-1 ${INPUT_CLASS}`}
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              aria-label="이 반복 업무 줄 지우기"
              className="shrink-0 rounded-lg p-1.5 text-sp-muted transition-colors hover:text-sp-error"
            >
              <span className="material-symbols-outlined text-icon-sm">close</span>
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...items, { cycle: '', what: '' }])}
        disabled={atMax}
        className="mt-1.5 flex items-center gap-1 text-xs font-sp-medium text-sp-accent transition-colors hover:underline disabled:cursor-not-allowed disabled:text-sp-muted disabled:no-underline"
      >
        <span className="material-symbols-outlined text-icon-sm">add</span>줄 추가
      </button>
      {atMax && (
        <p className="mt-1 text-xs text-sp-muted">
          {STAFFROOM_TASK_KNOWLEDGE_MAX_ITEMS}줄까지 적을 수 있어요.
        </p>
      )}
    </div>
  );
}

/** 한 줄짜리 목록 편집 — 처리 절차·인수인계 메모가 함께 쓴다 (066 인수인계) */
function StringListEditor({
  label,
  icon,
  items,
  onChange,
  placeholder,
  numbered,
}: {
  label: string;
  icon: string;
  items: readonly string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  numbered?: boolean;
}) {
  const atMax = items.length >= STAFFROOM_TASK_KNOWLEDGE_MAX_ITEMS;

  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-sp-medium text-sp-text">
        <span className="material-symbols-outlined text-icon-sm text-sp-muted">{icon}</span>
        {label}
      </p>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-1.5">
            {numbered && (
              <span className="w-4 shrink-0 text-right text-xs text-sp-muted">{i + 1}.</span>
            )}
            <input
              type="text"
              value={item}
              onChange={(e) => onChange(items.map((it, idx) => (idx === i ? e.target.value : it)))}
              placeholder={placeholder}
              aria-label={`${label} ${i + 1}번째 줄`}
              className={`flex-1 ${INPUT_CLASS}`}
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              aria-label="이 줄 지우기"
              className="shrink-0 rounded-lg p-1.5 text-sp-muted transition-colors hover:text-sp-error"
            >
              <span className="material-symbols-outlined text-icon-sm">close</span>
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...items, ''])}
        disabled={atMax}
        className="mt-1.5 flex items-center gap-1 text-xs font-sp-medium text-sp-accent transition-colors hover:underline disabled:cursor-not-allowed disabled:text-sp-muted disabled:no-underline"
      >
        <span className="material-symbols-outlined text-icon-sm">add</span>줄 추가
      </button>
      {atMax && (
        <p className="mt-1 text-xs text-sp-muted">
          {STAFFROOM_TASK_KNOWLEDGE_MAX_ITEMS}줄까지 적을 수 있어요.
        </p>
      )}
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
    // 편집 중에는 빈 줄이 있어도 된다(막 추가한 줄) — 저장할 때만 걸러낸다.
    const cleaned: WriteStaffRoomTaskInput = {
      ...form,
      routines: form.routines
        .map((r) => ({ cycle: r.cycle.trim(), what: r.what.trim() }))
        .filter((r) => r.cycle.length > 0 || r.what.length > 0),
      howto: form.howto.map((s) => s.trim()).filter((s) => s.length > 0),
      handoverNotes: form.handoverNotes.map((s) => s.trim()).filter((s) => s.length > 0),
    };
    const ok = await saveTask(departmentId, cleaned, taskId);
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

      {/* 인수인계 지식 (066) — 2월에 부서가 바뀔 때 파일은 넘어가도 아는 것은 안 넘어간다.
          다음 담당자가 이어받을 수 있게 여기 적어둔다. 셋 다 선택이라 비워도 된다. */}
      <div className="space-y-4 border-t border-sp-border pt-4">
        <p className="text-xs leading-relaxed text-sp-muted">
          인수인계 지식 <span>(비워도 됩니다)</span> — 다음에 이 업무를 맡을 분이 알아야 할 것을
          적어두면 담당자가 바뀌어도 이어집니다.
        </p>
        <RoutineListEditor
          items={form.routines}
          onChange={(next) => setForm((p) => ({ ...p, routines: next }))}
        />
        <StringListEditor
          label="처리 절차"
          icon="checklist"
          items={form.howto}
          onChange={(next) => setForm((p) => ({ ...p, howto: next }))}
          placeholder="예: 나이스에서 출결 현황을 내려받는다"
          numbered
        />
        <StringListEditor
          label="인수인계 메모"
          icon="flag"
          items={form.handoverNotes}
          onChange={(next) => setForm((p) => ({ ...p, handoverNotes: next }))}
          placeholder="예: 매년 2월 말로 마감이 당겨지니 미리 확인할 것"
        />
      </div>

      {!check.ok && <p className="text-xs text-sp-error">{check.message}</p>}

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

/** 업무 카드 안의 "인수인계 지식" 접이 구역 — 셋 다 비어 있으면 이 함수를 부르지 않는다 */
function TaskKnowledgePanel({ task }: { task: StaffRoomTask }) {
  return (
    <div className="mt-2 w-full space-y-3 rounded-lg bg-sp-surface p-3">
      {task.routines.length > 0 && (
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-sp-semibold text-sp-text">
            <span className="material-symbols-outlined text-icon-sm text-sp-muted">
              event_repeat
            </span>
            반복 업무
          </p>
          <ul className="space-y-0.5">
            {task.routines.map((r, i) => (
              <li key={i} className="text-xs leading-relaxed text-sp-text">
                <span className="text-sp-muted">{r.cycle}</span>
                {r.cycle && r.what && ' · '}
                {r.what}
              </li>
            ))}
          </ul>
        </div>
      )}
      {task.howto.length > 0 && (
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-sp-semibold text-sp-text">
            <span className="material-symbols-outlined text-icon-sm text-sp-muted">checklist</span>
            처리 절차
          </p>
          <ol className="list-inside list-decimal space-y-0.5 text-xs leading-relaxed text-sp-text">
            {task.howto.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      )}
      {task.handoverNotes.length > 0 && (
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-sp-semibold text-sp-text">
            <span className="material-symbols-outlined text-icon-sm text-sp-muted">flag</span>
            인수인계 메모
          </p>
          <ul className="space-y-0.5">
            {task.handoverNotes.map((note, i) => (
              <li key={i} className="flex items-start gap-1 text-xs leading-relaxed text-sp-text">
                <span className="material-symbols-outlined mt-0.5 shrink-0 text-icon-sm text-sp-highlight">
                  priority_high
                </span>
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * 업무에 걸린 서식 — 접으면 아무 왕복도 없다가, 펼치는 순간 한 번만 받아 온다.
 *
 * 내려받기는 `useStaffRoomLibraryStore.downloadFile` 을 그대로 부른다 — 자료실이
 * 이미 가진 권한 내주는 경로를 여기서 새로 만들지 않는다(PostDetail 과 같은 방식).
 */
function TaskFormsPanel({
  departmentId,
  taskId,
  canEdit,
}: {
  departmentId: string;
  taskId: string;
  canEdit: boolean;
}) {
  const forms = useStaffRoomPlanStore((s) => s.taskForms[taskId]);
  const loading = useStaffRoomPlanStore((s) => s.taskFormsLoading[taskId] ?? false);
  const loadTaskForms = useStaffRoomPlanStore((s) => s.loadTaskForms);
  const setTaskFormFiles = useStaffRoomPlanStore((s) => s.setTaskFormFiles);
  const downloadFile = useStaffRoomLibraryStore((s) => s.downloadFile);
  const libraryFiles = useStaffRoomLibraryStore((s) => s.files);
  const loadLibraryFiles = useStaffRoomLibraryStore((s) => s.loadFiles);

  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (forms === undefined) void loadTaskForms(departmentId, taskId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, taskId]);

  const aliveFileIds = (forms ?? []).map((f) => f.fileId).filter((id): id is string => id !== null);

  const togglePicking = () => {
    const opening = !picking;
    setPicking(opening);
    if (opening) void loadLibraryFiles(departmentId);
  };

  const applyFileIds = (next: string[]) => void setTaskFormFiles(departmentId, taskId, next);

  const removeForm = (form: StaffRoomTaskForm) =>
    applyFileIds(aliveFileIds.filter((id) => id !== form.fileId));

  const toggleLibraryFile = (fileId: string, picked: boolean) =>
    applyFileIds(picked ? aliveFileIds.filter((id) => id !== fileId) : [...aliveFileIds, fileId]);

  return (
    <div className="mt-2 w-full space-y-2 rounded-lg bg-sp-surface p-3">
      {loading && <p className="text-xs text-sp-muted">불러오는 중…</p>}

      {!loading && (forms?.length ?? 0) === 0 && (
        <p className="text-xs text-sp-muted">아직 걸린 서식이 없습니다.</p>
      )}

      {!loading && forms && forms.length > 0 && (
        <ul className="space-y-1">
          {forms.map((form) => {
            // fileId 가 null = 자료실에서 지워진 파일. 조용히 사라지면 업무가
            // 고쳐진 줄 안다 — PostDetail 의 첨부 처리와 같은 판단이다.
            const isGone = form.fileId === null;
            return (
              <li
                key={form.id}
                className="flex items-center gap-2 rounded-lg border border-sp-border bg-sp-card px-3 py-2"
              >
                <span className="material-symbols-outlined shrink-0 text-icon-sm text-sp-muted">
                  {isGone ? 'link_off' : 'description'}
                </span>
                <span
                  className={`min-w-0 flex-1 truncate text-xs ${isGone ? 'text-sp-muted' : 'text-sp-text'}`}
                >
                  {form.fileName}
                  {isGone && <span> · 자료실에서 지워졌어요</span>}
                </span>
                {!isGone && (
                  <button
                    type="button"
                    onClick={() => {
                      void (async () => {
                        const url = await downloadFile(departmentId, form.fileId as string);
                        if (url) window.open(url, '_blank', 'noopener,noreferrer');
                      })();
                    }}
                    aria-label={`${form.fileName} 내려받기`}
                    className="shrink-0 rounded-lg p-1 text-sp-muted transition-colors hover:text-sp-text"
                  >
                    <span className="material-symbols-outlined text-icon-sm">download</span>
                  </button>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => removeForm(form)}
                    aria-label={`${form.fileName} 서식에서 빼기`}
                    className="shrink-0 rounded-lg p-1 text-sp-muted transition-colors hover:text-sp-error"
                  >
                    <span className="material-symbols-outlined text-icon-sm">close</span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (
        <div>
          <button
            type="button"
            onClick={togglePicking}
            className="flex items-center gap-1 text-xs font-sp-medium text-sp-accent transition-colors hover:underline"
          >
            <span className="material-symbols-outlined text-icon-sm">add</span>
            자료실에서 서식 걸기
          </button>

          {picking && (
            <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-sp-border bg-sp-bg p-2">
              {libraryFiles.length === 0 ? (
                <p className="px-1 py-2 text-xs text-sp-muted">
                  자료실에 올라간 파일이 없어요. 자료실 탭에서 먼저 올려주세요.
                </p>
              ) : (
                <ul className="space-y-1">
                  {libraryFiles.map((f) => {
                    const picked = aliveFileIds.includes(f.id);
                    return (
                      <li key={f.id}>
                        <button
                          type="button"
                          onClick={() => toggleLibraryFile(f.id, picked)}
                          className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors ${
                            picked ? 'bg-sp-card text-sp-text' : 'text-sp-muted hover:text-sp-text'
                          }`}
                        >
                          <span className="material-symbols-outlined text-icon-sm">
                            {picked ? 'check_box' : 'check_box_outline_blank'}
                          </span>
                          <span className="truncate">{f.name}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 업무 목록 한 줄 — 인수인계 지식·서식은 눌러야 펼쳐진다 */
function TaskRow({
  task,
  departmentId,
  overdue,
  mayToggle,
  mayEdit,
  onToggleDone,
  onEdit,
  onDelete,
}: {
  task: StaffRoomTask;
  departmentId: string;
  overdue: boolean;
  mayToggle: boolean;
  mayEdit: boolean;
  onToggleDone: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [formsOpen, setFormsOpen] = useState(false);

  const hasKnowledge =
    task.routines.length > 0 || task.howto.length > 0 || task.handoverNotes.length > 0;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-sp-border bg-sp-card px-4 py-3">
      <button
        type="button"
        onClick={onToggleDone}
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
            ? displayNameOf({ email: task.assigneeEmail, displayName: task.assigneeName })
            : '아직 안 정함'}
          {task.dueOn && (
            <span className={overdue ? 'text-sp-error' : undefined}>
              {' '}
              · {task.dueOn}까지{overdue && ' (지났습니다)'}
            </span>
          )}
        </p>
      </div>

      {mayEdit && (
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`${task.title} 고치기`}
            className="rounded-lg p-1.5 text-sp-muted transition-colors hover:text-sp-text"
          >
            <span className="material-symbols-outlined text-icon-sm">edit</span>
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`${task.title} 지우기`}
            className="rounded-lg p-1.5 text-sp-muted transition-colors hover:text-sp-error"
          >
            <span className="material-symbols-outlined text-icon-sm">delete</span>
          </button>
        </div>
      )}

      {/* 인수인계 지식·서식 — 대부분의 업무는 여기 채울 게 없으니 눌러야만 보인다 */}
      <div className="flex w-full basis-full flex-wrap items-center gap-3 border-t border-sp-border pt-2">
        {hasKnowledge && (
          <button
            type="button"
            onClick={() => setKnowledgeOpen((v) => !v)}
            className="flex items-center gap-1 text-xs font-sp-medium text-sp-muted transition-colors hover:text-sp-text"
          >
            <span className="material-symbols-outlined text-icon-sm">
              {knowledgeOpen ? 'expand_less' : 'expand_more'}
            </span>
            인수인계 지식
          </button>
        )}
        <button
          type="button"
          onClick={() => setFormsOpen((v) => !v)}
          className="flex items-center gap-1 text-xs font-sp-medium text-sp-muted transition-colors hover:text-sp-text"
        >
          <span className="material-symbols-outlined text-icon-sm">
            {formsOpen ? 'expand_less' : 'expand_more'}
          </span>
          서식
        </button>
      </div>

      {knowledgeOpen && hasKnowledge && <TaskKnowledgePanel task={task} />}
      {formsOpen && (
        <TaskFormsPanel departmentId={departmentId} taskId={task.id} canEdit={mayEdit} />
      )}
    </li>
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
  const droppedTaskForms = useStaffRoomPlanStore((s) => s.droppedTaskForms);
  const clearDroppedTaskForms = useStaffRoomPlanStore((s) => s.clearDroppedTaskForms);
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
  const [pasteOpen, setPasteOpen] = useState(false);

  useEffect(() => {
    void loadPlan(departmentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId]);

  const now = today();

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-sp-error bg-sp-surface p-4">
          <p className="text-sm leading-relaxed text-sp-error">{error}</p>
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
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPasteOpen(true)}
                className="flex items-center gap-1.5 rounded-xl border border-sp-border px-3 py-2 text-sm font-sp-medium text-sp-text transition-colors hover:bg-sp-surface"
              >
                <span className="material-symbols-outlined text-icon-sm">content_paste</span>표
                붙여넣기
              </button>
              <button
                type="button"
                onClick={() => setEventForm({ open: true, editing: null })}
                className="flex items-center gap-1.5 rounded-xl border border-sp-border px-3 py-2 text-sm font-sp-medium text-sp-text transition-colors hover:bg-sp-surface"
              >
                <span className="material-symbols-outlined text-icon-sm">event</span>일정 추가
              </button>
            </div>
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
                    className="rounded-lg p-1.5 text-sp-muted transition-colors hover:text-sp-error"
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

        {droppedTaskForms > 0 && (
          <div className="mb-2 flex items-start justify-between gap-3 rounded-xl border border-sp-highlight bg-sp-surface p-4">
            <p className="text-sm leading-relaxed text-sp-text">
              자료실에 없는 파일 {droppedTaskForms}개는 서식에서 빠졌습니다.
            </p>
            <button
              type="button"
              onClick={clearDroppedTaskForms}
              aria-label="안내 닫기"
              className="shrink-0 rounded-lg p-1 text-sp-muted hover:text-sp-text"
            >
              <span className="material-symbols-outlined text-icon-sm">close</span>
            </button>
          </div>
        )}

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
                    routines: [...taskForm.editing.routines],
                    howto: [...taskForm.editing.howto],
                    handoverNotes: [...taskForm.editing.handoverNotes],
                  }
                : {
                    title: '',
                    assigneeEmail: null,
                    dueOn: null,
                    memo: '',
                    routines: [],
                    howto: [],
                    handoverNotes: [],
                  }
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
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              departmentId={departmentId}
              overdue={isTaskOverdue(task, now)}
              mayToggle={canToggleTaskDone(myEmail, myRole, task.assigneeEmail)}
              mayEdit={canEditTask(myEmail, myRole, task.authorEmail)}
              onToggleDone={() => void toggleTask(departmentId, task.id, task.doneAt === null)}
              onEdit={() => setTaskForm({ open: true, editing: task })}
              onDelete={() => {
                if (window.confirm(`"${task.title}" 업무를 지울까요?`)) {
                  void removeTask(departmentId, task.id);
                }
              }}
            />
          ))}
        </ul>
      </section>

      {pasteOpen && (
        <SchedulePasteModal departmentId={departmentId} onClose={() => setPasteOpen(false)} />
      )}
    </div>
  );
}
