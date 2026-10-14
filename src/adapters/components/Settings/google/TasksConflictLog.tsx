import { useState } from 'react';
import { useTasksSyncStore } from '@adapters/stores/useTasksSyncStore';
import type {
  ConflictContent,
  TasksSyncConflict,
  TasksSyncConflictKind,
} from '@domain/entities/TasksSyncConflict';

/** 충돌 종류별로 선생님께 보여 줄 한 줄 설명. */
const KIND_LABEL: Readonly<Record<TasksSyncConflictKind, string>> = {
  'edit-edit': '구글과 쌤핀에서 둘 다 고쳤어요 · 쌤핀 내용을 남겼어요',
  'remote-deleted': '구글에서 지웠지만 쌤핀에서 고쳐서 구글에 다시 만들었어요',
  'local-deleted': '쌤핀에서 보관해서 구글에서도 지웠어요 · 구글에서 고친 내용은 아래에 남겨요',
};

/** "2026-10-14" → "2026년 10월 14일". 모양이 다르면 받은 그대로 보여 준다. */
function formatDueDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return `${match[1]}년 ${Number(match[2])}월 ${Number(match[3])}일`;
}

function formatDetectedAt(value: string): string {
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? '' : time.toLocaleString('ko-KR');
}

function RemoteContent({ remote }: { readonly remote: ConflictContent | undefined }) {
  if (!remote) {
    return <p className="text-xs text-sp-text">구글에서 이미 지워진 항목이에요</p>;
  }
  return (
    <dl className="space-y-1 text-xs">
      <div className="flex gap-2">
        <dt className="w-12 shrink-0 text-sp-muted">제목</dt>
        <dd className="min-w-0 flex-1 break-words text-sp-text">{remote.text || '(제목 없음)'}</dd>
      </div>
      {remote.notes ? (
        <div className="flex gap-2">
          <dt className="w-12 shrink-0 text-sp-muted">메모</dt>
          <dd className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sp-text">
            {remote.notes}
          </dd>
        </div>
      ) : null}
      {remote.dueDate ? (
        <div className="flex gap-2">
          <dt className="w-12 shrink-0 text-sp-muted">마감일</dt>
          <dd className="min-w-0 flex-1 text-sp-text">{formatDueDate(remote.dueDate)}</dd>
        </div>
      ) : null}
      <div className="flex gap-2">
        <dt className="w-12 shrink-0 text-sp-muted">상태</dt>
        <dd className="min-w-0 flex-1 text-sp-text">
          {remote.completed ? '완료' : '아직 안 했어요'}
        </dd>
      </div>
    </dl>
  );
}

interface ConflictRowProps {
  readonly conflict: TasksSyncConflict;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}

function ConflictRow({ conflict, expanded, onToggle }: ConflictRowProps) {
  const detailId = `tasks-conflict-${conflict.id}`;
  const detectedAt = formatDetectedAt(conflict.detectedAt);

  return (
    <li className="rounded-lg bg-sp-surface">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={detailId}
        className="flex w-full items-start gap-2 rounded-lg p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-sp-text">
            {conflict.local.text || '(제목 없음)'}
          </p>
          <p className="mt-0.5 text-xs text-sp-text">{KIND_LABEL[conflict.kind]}</p>
          {detectedAt ? <p className="mt-0.5 text-xs text-sp-muted">{detectedAt}</p> : null}
        </div>
        <span
          aria-hidden="true"
          className={`material-symbols-outlined mt-0.5 shrink-0 text-icon-md text-sp-muted transition-transform ${
            expanded ? 'rotate-180' : ''
          }`}
        >
          expand_more
        </span>
      </button>
      {expanded ? (
        <div id={detailId} className="mx-3 mb-3 border-t border-sp-border pt-3">
          <p className="mb-2 text-xs font-medium text-sp-text">구글에 있던 내용</p>
          <RemoteContent remote={conflict.remote} />
        </div>
      ) : null}
    </li>
  );
}

/**
 * 최근 충돌 기록 — 쌤핀과 구글에서 같은 할 일이 다르게 바뀌어 쌤핀 쪽이 이겼을 때,
 * 덮이거나 사라진 구글 쪽 내용을 남겨 보여 준다. 기록이 없으면 아무것도 그리지 않는다.
 *
 * 승자를 고르거나 되돌리는 기능은 두지 않는다. 구글에서 받은 내용이므로 화면에만 보이고
 * 다른 곳으로 보내지 않는다.
 */
export function TasksConflictLog() {
  const conflicts = useTasksSyncStore((s) => s.conflicts);
  const clearConflicts = useTasksSyncStore((s) => s.clearConflicts);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());

  if (conflicts.length === 0) return null;

  const toggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-sp-text">최근 충돌 기록</p>
          <p className="mt-0.5 text-xs text-sp-muted">
            쌤핀에서 한 변경이 구글을 덮었을 때 구글에 있던 내용을 남겨 둬요.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void clearConflicts()}
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-sp-muted transition-colors hover:text-sp-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent"
        >
          기록 지우기
        </button>
      </div>
      <ul className="max-h-60 space-y-2 overflow-y-auto">
        {conflicts.map((conflict) => (
          <ConflictRow
            key={conflict.id}
            conflict={conflict}
            expanded={expandedIds.has(conflict.id)}
            onToggle={() => toggle(conflict.id)}
          />
        ))}
      </ul>
    </div>
  );
}
