/**
 * 온라인 교무실 — 제출 과제 (066)
 *
 * 계획서: .omc/plans/staffroom-submission-plan.md
 *
 * ── 부서 업무(PlanView 의 업무)와 무엇이 다른가 ─────────────────────
 * 업무는 한 사람이 도는 일이고, 제출 과제는 여럿이 각자 내고 다 내면 끝나는 일이다.
 * "2학기 수행평가 계획 제출 9/15까지" 같은 취합을 담는 자리다.
 *
 * ── ★ 목록에는 제출 주체의 이메일·이름이 없다 ───────────────────────
 * `StaffRoomSubmission` 은 진행률 숫자(`doneCount`/`totalCount`)와 내 상태(`myDoneAt`)만
 * 준다. "안 낸 분 보기"를 열어야 명단이 오고, 그건 만든이·관리자만 받는다
 * (`useStaffRoomSubmissionStore.loadTargets`). 그래서 **고치기 폼도** 명단을 먼저
 * 받아 현재 제출 주체를 채운 뒤에 연다 — 안 그러면 제목만 고치고 저장해도
 * 제출 주체가 통째로 사라진다(고치기는 전체 주체 목록을 다시 보내는 방식이라서).
 *
 * ── ★ §8-E — 사람별 누적을 세지 않는다 ─────────────────────────────
 * 이 화면에 그리는 숫자는 **과제 하나**의 진행률뿐이다. 여러 과제를 가로질러
 * "이 분이 N개 안 냄"으로 세는 자리를 만들지 않는다.
 */
import { useEffect, useState } from 'react';
import { useStaffRoomSubmissionStore } from '@adapters/stores/useStaffRoomSubmissionStore';
import { useStaffRoomStore } from '@adapters/stores/useStaffRoomStore';
import { useGoogleAccountStore } from '@adapters/stores/useGoogleAccountStore';
import { displayNameOf } from '@domain/rules/staffRoomBoardPermission';
import {
  canSeeUnsubmittedList,
  checkSubmission,
  daysUntilSubmissionDue,
  submissionDueState,
} from '@domain/rules/staffRoomRoomRules';
import {
  STAFFROOM_SUBMISSION_GUIDE_MAX_LENGTH,
  STAFFROOM_SUBMISSION_TITLE_MAX_LENGTH,
  type StaffRoomSubmission,
  type StaffRoomSubmissionDueState,
  type WriteStaffRoomSubmissionInput,
} from '@domain/entities/StaffRoomSubmission';
import type { StaffRoomRole } from '@domain/entities/StaffRoom';
import { UnsubmittedModal } from './UnsubmittedModal';

interface SubmissionViewProps {
  departmentId: string;
  moduleId: string;
}

/** 오늘 YYYY-MM-DD — PlanView 와 같은 방식(로컬 자정 기준) */
function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const INPUT_CLASS =
  'rounded-xl border border-sp-border bg-sp-surface px-3 py-2.5 text-sm text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none';

/** 마감 상태별 배지 색·문구 — 넷(+기한 없음)이 한눈에 갈라져야 한다 */
function dueBadge(
  state: StaffRoomSubmissionDueState,
  dueOn: string | null,
  now: string,
): { readonly label: string; readonly className: string } {
  switch (state) {
    case 'over':
      return { label: '지남', className: 'border-sp-error text-sp-error' };
    case 'today':
      return { label: '오늘까지', className: 'border-sp-warning text-sp-warning' };
    case 'tomorrow':
      return { label: '내일까지', className: 'border-sp-highlight text-sp-highlight' };
    case 'later': {
      const days = dueOn ? daysUntilSubmissionDue(dueOn, now) : 0;
      return { label: `${days}일 남음`, className: 'border-sp-border text-sp-muted' };
    }
    case 'none':
    default:
      return { label: '기한 없음', className: 'border-sp-border text-sp-muted' };
  }
}

/** 제출 과제 만들기·고치기 폼 */
function SubmissionForm({
  departmentId,
  moduleId,
  submissionId,
  initial,
  onDone,
  onCancel,
}: {
  departmentId: string;
  moduleId: string;
  submissionId?: string;
  initial: WriteStaffRoomSubmissionInput;
  onDone: () => void;
  onCancel: () => void;
}) {
  const saveSubmission = useStaffRoomSubmissionStore((s) => s.saveSubmission);
  const members = useStaffRoomStore((s) => s.members);
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);

  const check = checkSubmission(form);

  const set = <K extends keyof WriteStaffRoomSubmissionInput>(
    key: K,
    value: WriteStaffRoomSubmissionInput[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const toggleTarget = (email: string) => {
    setForm((prev) => ({
      ...prev,
      targetEmails: prev.targetEmails.includes(email)
        ? prev.targetEmails.filter((e) => e !== email)
        : [...prev.targetEmails, email],
    }));
  };

  const submit = async () => {
    if (!check.ok || saving) return;
    setSaving(true);
    const ok = await saveSubmission(departmentId, moduleId, form, submissionId);
    setSaving(false);
    if (ok) onDone();
  };

  return (
    <div className="space-y-3 rounded-xl border border-sp-border bg-sp-card p-4">
      <input
        type="text"
        value={form.title}
        onChange={(e) => set('title', e.target.value)}
        maxLength={STAFFROOM_SUBMISSION_TITLE_MAX_LENGTH}
        placeholder="무엇을 걷을까요? (예: 2학기 수행평가 계획)"
        aria-label="과제 제목"
        className={`w-full ${INPUT_CLASS}`}
      />

      <div className="flex flex-wrap gap-3">
        <label className="text-xs text-sp-muted">
          마감일 <span className="text-sp-muted">(없으면 비워두세요)</span>
          <input
            type="date"
            value={form.dueOn ?? ''}
            onChange={(e) => set('dueOn', e.target.value || null)}
            className={`mt-1 block ${INPUT_CLASS}`}
          />
        </label>
      </div>

      <input
        type="text"
        value={form.docUrl}
        onChange={(e) => set('docUrl', e.target.value)}
        placeholder="제출할 구글 문서·시트 주소 (https://...)"
        aria-label="제출 문서 주소"
        className={`w-full ${INPUT_CLASS}`}
      />

      <textarea
        value={form.guide}
        onChange={(e) => set('guide', e.target.value)}
        rows={2}
        maxLength={STAFFROOM_SUBMISSION_GUIDE_MAX_LENGTH}
        placeholder="안내 문구 (예: 링크를 열어 과목별 시트에 작성해 주세요)"
        aria-label="안내 문구"
        className={`w-full resize-y ${INPUT_CLASS}`}
      />

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-sp-medium text-sp-text">
            제출할 분 ({form.targetEmails.length}명)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                set(
                  'targetEmails',
                  members.map((m) => m.email),
                )
              }
              className="text-xs font-sp-medium text-sp-accent hover:underline"
            >
              전체 선택
            </button>
            <button
              type="button"
              onClick={() => set('targetEmails', [])}
              className="text-xs font-sp-medium text-sp-muted hover:text-sp-text hover:underline"
            >
              선택 해제
            </button>
          </div>
        </div>
        <div className="mt-2 max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-sp-border bg-sp-surface p-1.5">
          {members.length === 0 && (
            <p className="px-2 py-2 text-xs text-sp-muted">부서 멤버가 없습니다.</p>
          )}
          {members.map((m) => (
            <label
              key={m.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-sp-text transition-colors hover:bg-sp-card"
            >
              <input
                type="checkbox"
                checked={form.targetEmails.includes(m.email)}
                onChange={() => toggleTarget(m.email)}
                className="h-4 w-4 shrink-0 rounded border-sp-border text-sp-accent focus:ring-sp-accent"
              />
              <span className="min-w-0 truncate">
                {displayNameOf({ email: m.email, displayName: m.displayName })}
              </span>
            </label>
          ))}
        </div>
      </div>

      {!check.ok && <p className="text-xs text-sp-error">{check.message}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
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

/** 과제 목록 한 줄 */
function SubmissionRow({
  submission,
  now,
  myEmail,
  myRole,
  onToggleMine,
  onOpenUnsubmitted,
  onEdit,
  onDelete,
}: {
  submission: StaffRoomSubmission;
  now: string;
  myEmail: string;
  myRole: StaffRoomRole | null;
  onToggleMine: (done: boolean) => void;
  onOpenUnsubmitted: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const state = submissionDueState(submission.dueOn, now);
  const badge = dueBadge(state, submission.dueOn, now);
  const mayManage = canSeeUnsubmittedList(myEmail, myRole, submission.authorEmail);
  const done = submission.myDoneAt !== null;
  const ratio = submission.totalCount > 0 ? submission.doneCount / submission.totalCount : 0;

  return (
    <div className="rounded-xl border border-sp-border bg-sp-card px-4 py-3.5 transition-all duration-sp-base ease-sp-out hover:border-sp-accent hover:shadow-sp-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-sp-semibold ${badge.className}`}
            >
              {badge.label}
            </span>
            <h3 className="min-w-0 truncate text-sm font-sp-medium text-sp-text">
              {submission.title}
            </h3>
          </div>

          {submission.guide && (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-sp-muted">
              {submission.guide}
            </p>
          )}

          <div className="mt-2.5 flex items-center gap-2">
            <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-sp-surface">
              <div
                className="h-full rounded-full bg-sp-accent transition-all duration-sp-base ease-sp-out"
                style={{ width: `${Math.round(ratio * 100)}%` }}
                role="progressbar"
                aria-valuenow={Math.round(ratio * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="제출 진행률"
              />
            </div>
            <span className="text-xs font-sp-medium tabular-nums text-sp-text">
              {submission.doneCount} / {submission.totalCount}
            </span>
          </div>

          <a
            href={submission.docUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs font-sp-medium text-sp-accent hover:underline"
          >
            <span className="material-symbols-outlined text-icon-sm">open_in_new</span>
            문서 열기
          </a>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <button
            type="button"
            onClick={() => onToggleMine(!done)}
            aria-pressed={done}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-sp-semibold transition-all duration-sp-base ease-sp-out ${
              done
                ? 'border-sp-success bg-sp-success text-white'
                : 'border-sp-border text-sp-text hover:border-sp-accent'
            }`}
          >
            <span className="material-symbols-outlined text-icon-sm">
              {done ? 'check_circle' : 'radio_button_unchecked'}
            </span>
            {done ? '냈음' : '제출 표시'}
          </button>

          {mayManage && (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={onOpenUnsubmitted}
                className="rounded-lg border border-sp-border px-2.5 py-1.5 text-[11px] font-sp-medium text-sp-text transition-colors hover:bg-sp-surface"
              >
                안 낸 분 보기
              </button>
              <button
                type="button"
                onClick={onEdit}
                aria-label={`${submission.title} 고치기`}
                className="rounded-lg p-1.5 text-sp-muted transition-colors hover:bg-sp-surface hover:text-sp-text"
              >
                <span className="material-symbols-outlined text-icon-sm">edit</span>
              </button>
              <button
                type="button"
                onClick={onDelete}
                aria-label={`${submission.title} 지우기`}
                className="rounded-lg p-1.5 text-sp-muted transition-colors hover:bg-sp-surface hover:text-sp-error"
              >
                <span className="material-symbols-outlined text-icon-sm">delete</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const EMPTY_INPUT: WriteStaffRoomSubmissionInput = {
  title: '',
  dueOn: null,
  guide: '',
  docUrl: '',
  targetEmails: [],
};

export function SubmissionView({ departmentId, moduleId }: SubmissionViewProps) {
  const submissions = useStaffRoomSubmissionStore((s) => s.submissions);
  const isLoading = useStaffRoomSubmissionStore((s) => s.isLoading);
  const error = useStaffRoomSubmissionStore((s) => s.error);
  const droppedTargets = useStaffRoomSubmissionStore((s) => s.droppedTargets);
  const loadSubmissions = useStaffRoomSubmissionStore((s) => s.loadSubmissions);
  const removeSubmission = useStaffRoomSubmissionStore((s) => s.removeSubmission);
  const toggleDone = useStaffRoomSubmissionStore((s) => s.toggleDone);
  const loadTargets = useStaffRoomSubmissionStore((s) => s.loadTargets);
  const clearTargets = useStaffRoomSubmissionStore((s) => s.clearTargets);
  const clearDropped = useStaffRoomSubmissionStore((s) => s.clearDropped);

  const myEmail = useGoogleAccountStore((s) => s.email) ?? '';
  const myRole = useStaffRoomStore((s) => s.currentDepartment?.myRole) ?? null;

  const [form, setForm] = useState<{
    open: boolean;
    submission: StaffRoomSubmission | null;
    initial: WriteStaffRoomSubmissionInput;
  }>({ open: false, submission: null, initial: EMPTY_INPUT });
  /** 고치기를 누른 뒤 현재 제출 주체 명단을 받아오는 동안의 대기 상태 */
  const [loadingEditFor, setLoadingEditFor] = useState<string | null>(null);
  const [unsubmittedFor, setUnsubmittedFor] = useState<StaffRoomSubmission | null>(null);

  useEffect(() => {
    void loadSubmissions(departmentId, moduleId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, moduleId]);

  const now = today();

  const openCreate = () => setForm({ open: true, submission: null, initial: EMPTY_INPUT });

  const openEdit = async (submission: StaffRoomSubmission) => {
    // ★ 고치기는 전체 제출 주체 목록을 다시 보내는 방식이라, 지금 걸린 사람들을
    //   먼저 받아 채워 두지 않으면 제목만 고치고 저장해도 주체가 통째로 사라진다.
    setLoadingEditFor(submission.id);
    clearTargets();
    await loadTargets(departmentId, submission.id);
    const targets = useStaffRoomSubmissionStore.getState().targets;
    setLoadingEditFor(null);
    if (!targets) return; // 명단을 못 받으면(권한 변경 등) 조용히 멈춘다 — 에러 안내는 스토어가 이미 띄운다
    const targetEmails = [...targets.pending, ...targets.done].map((t) => t.email);
    setForm({
      open: true,
      submission,
      initial: {
        title: submission.title,
        dueOn: submission.dueOn,
        guide: submission.guide,
        docUrl: submission.docUrl,
        targetEmails,
      },
    });
  };

  const closeForm = () => {
    clearTargets();
    setForm({ open: false, submission: null, initial: EMPTY_INPUT });
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-sp-error bg-sp-surface p-4">
          <p className="text-sm leading-relaxed text-sp-error">{error}</p>
          <button
            type="button"
            onClick={() => useStaffRoomSubmissionStore.setState({ error: null })}
            aria-label="안내 닫기"
            className="shrink-0 rounded-lg p-1 text-sp-muted hover:text-sp-text"
          >
            <span className="material-symbols-outlined text-icon-sm">close</span>
          </button>
        </div>
      )}

      {droppedTargets > 0 && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-sp-highlight bg-sp-surface p-4">
          <p className="text-sm leading-relaxed text-sp-text">
            {droppedTargets}명은 이 부서 멤버가 아니라 빠졌습니다.
          </p>
          <button
            type="button"
            onClick={clearDropped}
            aria-label="안내 닫기"
            className="shrink-0 rounded-lg p-1 text-sp-muted hover:text-sp-text"
          >
            <span className="material-symbols-outlined text-icon-sm">close</span>
          </button>
        </div>
      )}

      {form.open ? (
        <SubmissionForm
          departmentId={departmentId}
          moduleId={moduleId}
          submissionId={form.submission?.id}
          initial={form.initial}
          onDone={closeForm}
          onCancel={closeForm}
        />
      ) : (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-xl bg-sp-accent px-4 py-2.5 text-sm font-sp-semibold text-white transition-all duration-sp-base ease-sp-out hover:shadow-sp-md"
          >
            <span className="material-symbols-outlined text-icon-sm">add</span>
            과제 만들기
          </button>
        </div>
      )}

      {loadingEditFor && (
        <p className="rounded-xl border border-sp-border bg-sp-card px-4 py-3 text-center text-xs text-sp-muted">
          제출 주체 명단을 불러오는 중…
        </p>
      )}

      {isLoading && submissions.length === 0 && (
        <p className="py-8 text-center text-sm text-sp-muted">불러오는 중…</p>
      )}

      {!isLoading && submissions.length === 0 && !form.open && (
        <div className="rounded-xl border border-dashed border-sp-border bg-sp-card px-6 py-12 text-center">
          <span className="material-symbols-outlined text-icon-xl text-sp-muted">
            assignment_turned_in
          </span>
          <p className="mt-3 text-sm font-sp-medium text-sp-text">아직 걷고 있는 과제가 없습니다</p>
          <p className="mt-1 text-xs leading-relaxed text-sp-muted">
            "2학기 수행평가 계획을 과목별로 내주세요" 처럼 마감일과 낼 사람을 걸어두면 누가 냈는지
            한눈에 모입니다.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {submissions.map((s) => (
          <SubmissionRow
            key={s.id}
            submission={s}
            now={now}
            myEmail={myEmail}
            myRole={myRole}
            onToggleMine={(done) => void toggleDone(departmentId, s.id, done)}
            onOpenUnsubmitted={() => setUnsubmittedFor(s)}
            onEdit={() => void openEdit(s)}
            onDelete={() => {
              if (window.confirm(`"${s.title}" 과제를 지울까요?`)) {
                void removeSubmission(departmentId, s.id);
              }
            }}
          />
        ))}
      </div>

      {unsubmittedFor && (
        <UnsubmittedModal
          departmentId={departmentId}
          submission={unsubmittedFor}
          onClose={() => setUnsubmittedFor(null)}
        />
      )}
    </div>
  );
}
