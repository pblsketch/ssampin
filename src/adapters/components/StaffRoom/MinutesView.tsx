/**
 * 온라인 교무실 — 회의록 (M4)
 *
 * 계획서 §8-C — "안건 → 논의 → 결정사항. 토론방에서 결정된 걸 그대로 회의록으로 굳힌다."
 *
 * ★ 세 칸을 따로 받는 이유 — 한 덩어리 글로 두면 **"그래서 뭘 정했나"가 문단 속에 묻힌다.**
 *   나중에 찾을 때 필요한 건 결정사항이고, 그래서 목록에서도 결정사항을 먼저 보여준다.
 */
import { useEffect, useState } from 'react';
import { useStaffRoomRoomsStore } from '@adapters/stores/useStaffRoomRoomsStore';
import { useStaffRoomStore } from '@adapters/stores/useStaffRoomStore';
import { useGoogleAccountStore } from '@adapters/stores/useGoogleAccountStore';
import { displayNameOf } from '@domain/rules/staffRoomBoardPermission';
import { canEditRoomItem, checkRoomTitle, isDateString } from '@domain/rules/staffRoomRoomRules';
import {
  STAFFROOM_ROOM_TITLE_MAX_LENGTH,
  type StaffRoomMinutes,
  type WriteStaffRoomMinutesInput,
} from '@domain/entities/StaffRoomRooms';

interface MinutesViewProps {
  departmentId: string;
  moduleId: string;
}

/** 오늘 날짜를 YYYY-MM-DD 로 — 회의록은 보통 회의한 날 또는 그다음 날 적는다 */
function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const EMPTY: WriteStaffRoomMinutesInput = {
  title: '',
  metOn: today(),
  attendees: '',
  agenda: '',
  discussion: '',
  decisions: '',
  fromDiscussionId: null,
};

/** 여러 줄 입력칸 — 세 칸이 같은 모양이라 묶어 둔다 */
function Field({
  label,
  hint,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (next: string) => void;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="text-xs font-sp-semibold text-sp-text">{label}</span>
      <span className="ml-1.5 text-xs text-sp-muted">{hint}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="mt-1.5 w-full resize-y rounded-xl border border-sp-border bg-sp-surface px-3 py-2.5 text-sm text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none"
      />
    </label>
  );
}

/** 회의록 쓰기·고치기 */
function MinutesEditor({
  departmentId,
  moduleId,
  initial,
  minutesId,
  onDone,
}: {
  departmentId: string;
  moduleId: string;
  initial: WriteStaffRoomMinutesInput;
  minutesId?: string;
  onDone: () => void;
}) {
  const saveMinutes = useStaffRoomRoomsStore((s) => s.saveMinutes);
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);

  const titleCheck = checkRoomTitle(form.title);
  const dateOk = isDateString(form.metOn);
  const canSave = titleCheck.ok && dateOk && !saving;

  const set = <K extends keyof WriteStaffRoomMinutesInput>(
    key: K,
    value: WriteStaffRoomMinutesInput[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    const ok = await saveMinutes(departmentId, moduleId, form, minutesId);
    setSaving(false);
    if (ok) onDone();
  };

  return (
    <div className="space-y-3 rounded-xl border border-sp-border bg-sp-card p-4">
      <div className="flex flex-wrap gap-3">
        <label className="min-w-0 flex-1">
          <span className="text-xs font-sp-semibold text-sp-text">제목</span>
          <input
            type="text"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            maxLength={STAFFROOM_ROOM_TITLE_MAX_LENGTH}
            placeholder="예: 8월 2학년부 협의회"
            className="mt-1.5 w-full rounded-xl border border-sp-border bg-sp-surface px-3 py-2.5 text-sm text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none"
          />
        </label>
        <label className="shrink-0">
          <span className="text-xs font-sp-semibold text-sp-text">회의한 날</span>
          <input
            type="date"
            value={form.metOn}
            onChange={(e) => set('metOn', e.target.value)}
            className="mt-1.5 block rounded-xl border border-sp-border bg-sp-surface px-3 py-2.5 text-sm text-sp-text focus:border-sp-accent focus:outline-none"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-xs font-sp-semibold text-sp-text">참석자</span>
        <span className="ml-1.5 text-xs text-sp-muted">
          멤버가 아닌 분도 오고, 멤버인데 빠진 분도 있어 직접 적습니다
        </span>
        <input
          type="text"
          value={form.attendees}
          onChange={(e) => set('attendees', e.target.value)}
          placeholder="김부장, 이선생, 박선생"
          className="mt-1.5 w-full rounded-xl border border-sp-border bg-sp-surface px-3 py-2.5 text-sm text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none"
        />
      </label>

      <Field
        label="안건"
        hint="무엇을 다루려고 모였는지"
        value={form.agenda}
        onChange={(v) => set('agenda', v)}
      />
      <Field
        label="논의"
        hint="오간 이야기"
        value={form.discussion}
        onChange={(v) => set('discussion', v)}
        rows={5}
      />
      <Field
        label="결정사항"
        hint="★ 나중에 찾을 때 필요한 건 이 칸입니다"
        value={form.decisions}
        onChange={(v) => set('decisions', v)}
      />

      {!dateOk && <p className="text-xs text-sp-danger">회의한 날을 골라주세요.</p>}

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
          disabled={!canSave}
          className="rounded-xl bg-sp-accent px-4 py-2 text-sm font-sp-semibold text-white transition-all duration-sp-base ease-sp-out hover:shadow-sp-md disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? '저장하는 중…' : '저장'}
        </button>
      </div>
    </div>
  );
}

/** 회의록 한 장 */
function MinutesCard({
  minutes,
  canEdit,
  onEdit,
  onDelete,
}: {
  minutes: StaffRoomMinutes;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const authorLabel = displayNameOf({
    email: minutes.authorEmail,
    displayName: minutes.authorName,
  });

  return (
    <div className="rounded-xl border border-sp-border bg-sp-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="min-w-0 flex-1 text-left"
        >
          <h3 className="truncate text-sm font-sp-semibold text-sp-text">{minutes.title}</h3>
          <p className="mt-0.5 truncate text-xs text-sp-muted">
            {minutes.metOn} · {authorLabel}
            {minutes.attendees && ` · ${minutes.attendees}`}
          </p>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          {canEdit && (
            <>
              <button
                type="button"
                onClick={onEdit}
                aria-label={`${minutes.title} 고치기`}
                className="rounded-lg p-1.5 text-sp-muted transition-colors hover:bg-sp-surface hover:text-sp-text"
              >
                <span className="material-symbols-outlined text-icon-sm">edit</span>
              </button>
              <button
                type="button"
                onClick={onDelete}
                aria-label={`${minutes.title} 지우기`}
                className="rounded-lg p-1.5 text-sp-muted transition-colors hover:bg-sp-surface hover:text-sp-danger"
              >
                <span className="material-symbols-outlined text-icon-sm">delete</span>
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? '접기' : '펼치기'}
            aria-expanded={open}
            className="rounded-lg p-1.5 text-sp-muted transition-colors hover:text-sp-text"
          >
            <span className="material-symbols-outlined text-icon-sm">
              {open ? 'expand_less' : 'expand_more'}
            </span>
          </button>
        </div>
      </div>

      {/* ★ 접혀 있어도 결정사항은 보인다 — 나중에 찾을 때 필요한 건 이것이다(§8-C) */}
      {!open && minutes.decisions && (
        <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-xs leading-relaxed text-sp-text">
          <span className="font-sp-semibold">결정: </span>
          {minutes.decisions}
        </p>
      )}

      {open && (
        <div className="mt-3 space-y-3 border-t border-sp-border pt-3">
          {[
            { label: '안건', value: minutes.agenda },
            { label: '논의', value: minutes.discussion },
            { label: '결정사항', value: minutes.decisions },
          ].map(
            (section) =>
              section.value && (
                <div key={section.label}>
                  <h4 className="text-xs font-sp-semibold text-sp-muted">{section.label}</h4>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-sp-text">
                    {section.value}
                  </p>
                </div>
              ),
          )}
        </div>
      )}
    </div>
  );
}

export function MinutesView({ departmentId, moduleId }: MinutesViewProps) {
  const minutes = useStaffRoomRoomsStore((s) => s.minutes);
  const isLoading = useStaffRoomRoomsStore((s) => s.isLoading);
  const error = useStaffRoomRoomsStore((s) => s.error);
  const loadMinutes = useStaffRoomRoomsStore((s) => s.loadMinutes);
  const removeMinutes = useStaffRoomRoomsStore((s) => s.removeMinutes);
  const clearError = useStaffRoomRoomsStore((s) => s.clearError);

  const myEmail = useGoogleAccountStore((s) => s.email) ?? '';
  const myRole = useStaffRoomStore((s) => s.currentDepartment?.myRole) ?? null;

  const [writing, setWriting] = useState(false);
  const [editing, setEditing] = useState<StaffRoomMinutes | null>(null);

  useEffect(() => {
    void loadMinutes(departmentId, moduleId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, moduleId]);

  const handleDelete = async (item: StaffRoomMinutes) => {
    if (window.confirm(`"${item.title}" 회의록을 지울까요?`)) {
      await removeMinutes(departmentId, item.id);
    }
  };

  if (writing || editing) {
    return (
      <MinutesEditor
        departmentId={departmentId}
        moduleId={moduleId}
        minutesId={editing?.id}
        initial={
          editing
            ? {
                title: editing.title,
                metOn: editing.metOn,
                attendees: editing.attendees,
                agenda: editing.agenda,
                discussion: editing.discussion,
                decisions: editing.decisions,
                fromDiscussionId: editing.fromDiscussionId,
              }
            : EMPTY
        }
        onDone={() => {
          setWriting(false);
          setEditing(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
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

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setWriting(true)}
          className="flex items-center gap-1.5 rounded-xl bg-sp-accent px-4 py-2.5 text-sm font-sp-semibold text-white transition-all duration-sp-base ease-sp-out hover:shadow-sp-md"
        >
          <span className="material-symbols-outlined text-icon-sm">add</span>
          회의록 쓰기
        </button>
      </div>

      {isLoading && minutes.length === 0 && (
        <p className="py-8 text-center text-sm text-sp-muted">불러오는 중…</p>
      )}

      {!isLoading && minutes.length === 0 && (
        <div className="rounded-xl border border-dashed border-sp-border bg-sp-card px-6 py-12 text-center">
          <span className="material-symbols-outlined text-icon-xl text-sp-muted">gavel</span>
          <p className="mt-3 text-sm font-sp-medium text-sp-text">아직 회의록이 없습니다</p>
          <p className="mt-1 text-xs leading-relaxed text-sp-muted">
            안건·논의·결정사항을 나눠 적어두면, 나중에 &ldquo;그때 뭘로 정했더라&rdquo;를 찾기가
            훨씬 쉽습니다.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {minutes.map((item) => (
          <MinutesCard
            key={item.id}
            minutes={item}
            canEdit={canEditRoomItem(myEmail, myRole, item.authorEmail)}
            onEdit={() => setEditing(item)}
            onDelete={() => void handleDelete(item)}
          />
        ))}
      </div>
    </div>
  );
}
