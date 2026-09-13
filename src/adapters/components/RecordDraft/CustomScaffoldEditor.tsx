import { useRef, useState } from 'react';
import {
  frameRoleLabel,
  type NarrativeFrameId,
  type RecordScaffold,
  type RecordScaffoldScene,
} from '@domain/rules/narrativeFrames';
import { addScaffold, SCAFFOLD_ERROR_MESSAGES } from '@domain/rules/recordScaffoldStore';
import type { NarrativeRole } from '@domain/rules/narrativeParagraphs';
import { NARRATIVE_SCENE_MAX } from '@domain/entities/InquiryThread';

interface Props {
  frame: NarrativeFrameId;
  scaffolds: readonly RecordScaffold[];
  onSave: (next: readonly RecordScaffold[]) => void | Promise<void>;
  onDone: (id: string) => void;
  onCancel: () => void;
}

const roles: readonly NarrativeRole[] = ['evaluation', 'motive', 'process', 'result'];
const inputClass =
  'min-w-0 rounded-lg bg-sp-surface px-2 py-1.5 text-sm text-sp-text ring-1 ring-sp-border';
const buttonClass =
  'rounded-lg px-2 py-1.5 text-xs text-sp-text ring-1 ring-sp-border hover:bg-sp-surface disabled:opacity-40';

export function CustomScaffoldEditor({
  frame,
  scaffolds,
  onSave,
  onDone,
  onCancel,
}: Props): React.JSX.Element {
  const [name, setName] = useState('');
  const [rows, setRows] = useState<readonly (RecordScaffoldScene & { key: number })[]>([
    { key: 0, role: 'evaluation', label: '' },
  ]);
  const nextKey = useRef(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const change = (key: number, patch: Partial<RecordScaffoldScene>): void =>
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const move = (index: number, direction: number): void =>
    setRows((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      const row = next.splice(index, 1)[0];
      if (row) next.splice(target, 0, row);
      return next;
    });
  const save = async (): Promise<void> => {
    if (busy) return;
    const result = addScaffold(scaffolds, {
      name,
      frame,
      now: Date.now(),
      scenes: rows.map(({ role, label }) => ({
        role,
        ...(label?.trim() ? { label: label.trim() } : {}),
      })),
    });
    if (!result.ok || !result.id) {
      setError(result.error ? SCAFFOLD_ERROR_MESSAGES[result.error] : '저장할 수 없습니다.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(result.scaffolds);
      onDone(result.id);
    } catch {
      setError('저장하지 못했습니다. 입력한 내용은 그대로입니다. 다시 저장해 주세요.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className="rounded-xl bg-sp-card p-3 ring-1 ring-sp-border"
      aria-label="새 뼈대 만들기"
    >
      <fieldset disabled={busy} className="flex min-w-0 flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs text-sp-muted">
          뼈대 이름
          <input
            autoFocus
            required
            maxLength={80}
            aria-label="직접 만든 뼈대 이름"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={inputClass}
            placeholder="예: 자료 비교 후 생각을 고친 흐름"
          />
        </label>
        <p className="text-xs text-sp-muted">
          장면을 추가하고 이름과 차례를 정하세요. 교사 판단 자리는 하나를 유지하며 원하는 차례로
          옮길 수 있습니다.
        </p>
        <ol className="flex flex-col gap-2">
          {rows.map((row, index) => (
            <li key={row.key} className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-sp-muted">{index + 1}</span>
              <select
                aria-label={`${index + 1}번째 장면 역할`}
                value={row.role}
                disabled={row.role === 'evaluation'}
                onChange={(event) => change(row.key, { role: event.target.value as NarrativeRole })}
                className={inputClass}
              >
                {roles.map((role) => (
                  <option
                    key={role}
                    value={role}
                    disabled={role === 'evaluation' && row.role !== 'evaluation'}
                  >
                    {frameRoleLabel(frame, role)}
                  </option>
                ))}
              </select>
              <input
                aria-label={`${index + 1}번째 장면 이름`}
                maxLength={60}
                value={row.label ?? ''}
                onChange={(event) => change(row.key, { label: event.target.value })}
                placeholder={frameRoleLabel(frame, row.role)}
                className={`${inputClass} flex-1`}
              />
              <button
                type="button"
                aria-label={`${index + 1}번째 장면 위로`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
                className={buttonClass}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`${index + 1}번째 장면 아래로`}
                disabled={index === rows.length - 1}
                onClick={() => move(index, 1)}
                className={buttonClass}
              >
                ↓
              </button>
              <button
                type="button"
                aria-label={`${index + 1}번째 장면 삭제`}
                disabled={row.role === 'evaluation'}
                onClick={() => setRows((prev) => prev.filter((item) => item.key !== row.key))}
                className={buttonClass}
              >
                삭제
              </button>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={rows.length >= NARRATIVE_SCENE_MAX}
            onClick={() => {
              const key = nextKey.current++;
              setRows((prev) => [...prev, { key, role: 'process', label: '' }]);
            }}
            className={buttonClass}
          >
            + 장면 추가
          </button>
          <span className="flex-1" />
          <button type="button" onClick={onCancel} className={buttonClass}>
            취소
          </button>
          <button
            type="submit"
            className="rounded-lg bg-sp-accent px-3 py-1.5 text-xs font-semibold text-sp-accent-fg"
          >
            {busy ? '저장 중…' : '뼈대 저장'}
          </button>
        </div>
        <p className="text-xs text-sp-muted">
          저장 후 [이 뼈대 깔기]를 눌러 선택한 주제에 적용합니다. 저장만으로 현재 장면이나 근거는
          바뀌지 않습니다.
        </p>
      </fieldset>
      {error && (
        <p role="alert" className="mt-2 text-xs text-sp-text">
          {error}
        </p>
      )}
    </form>
  );
}
