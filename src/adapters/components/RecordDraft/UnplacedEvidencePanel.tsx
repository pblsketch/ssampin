import { useState } from 'react';
import type { RecordEvidence } from '@domain/entities/RecordEvidence';

interface Props {
  items: readonly { evidence: RecordEvidence; group: string }[];
  targets: readonly {
    id: string;
    title: string;
    scenes: readonly { id: string; label: string }[];
  }[];
  onPlace: (evidenceId: string, threadId: string, sceneId: string) => Promise<boolean>;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export function UnplacedEvidencePanel({
  items,
  targets,
  onPlace,
  onSelect,
  onClose,
}: Props): React.JSX.Element {
  const [targetId, setTargetId] = useState(targets[0]?.id ?? '');
  const [sceneId, setSceneId] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const target = targets.find((item) => item.id === targetId);
  const validScene = sceneId === '' || target?.scenes.some((scene) => scene.id === sceneId);
  const put = async (id: string): Promise<void> => {
    if (!target || !validScene || busy) return;
    setBusy(id);
    setError(null);
    try {
      if (!(await onPlace(id, target.id, sceneId)))
        setError('넣지 못한 근거를 확인하고 다시 시도해 주세요. 원래 기록은 지우지 않습니다.');
    } catch {
      setError('저장하지 못했습니다. 근거는 그대로 남아 있습니다. 다시 시도해 주세요.');
    } finally {
      setBusy(null);
    }
  };
  return (
    <aside
      aria-label="미분류와 자리 미정 근거"
      className="flex w-80 min-w-64 max-w-[45%] shrink-0 flex-col border-l border-sp-border bg-sp-surface"
    >
      <header className="flex items-center justify-between p-3">
        <h3 className="text-sm font-semibold text-sp-text">
          아직 배치하지 않은 근거 {items.length}건
        </h3>
        <button
          type="button"
          aria-label="미분류 근거 목록 닫기"
          onClick={onClose}
          className="rounded p-1 text-sp-muted"
        >
          ×
        </button>
      </header>
      <div className="flex flex-col gap-2 border-b border-sp-border px-3 pb-3">
        <p className="text-xs text-sp-muted">
          넣을 주제와 장면을 고른 뒤 근거의 [넣기]를 누르세요. 원본에서 온 자료도 바로 넣을 수
          있습니다.
        </p>
        <label className="text-xs text-sp-muted">
          넣을 주제
          <select
            aria-label="미분류 근거를 넣을 주제"
            disabled={busy !== null}
            value={target ? targetId : ''}
            onChange={(event) => {
              setTargetId(event.target.value);
              setSceneId('');
            }}
            className="mt-1 w-full rounded bg-sp-card p-2 text-sp-text ring-1 ring-sp-border"
          >
            <option value="">주제 선택</option>
            {targets.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-sp-muted">
          넣을 장면
          <select
            aria-label="미분류 근거를 넣을 장면"
            disabled={!target || busy !== null}
            value={sceneId}
            onChange={(event) => setSceneId(event.target.value)}
            className="mt-1 w-full rounded bg-sp-card p-2 text-sp-text ring-1 ring-sp-border"
          >
            <option value="">주제만 정하기 (장면은 나중에)</option>
            {target?.scenes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <input
          aria-label="미분류 근거 검색"
          placeholder="근거 내용 검색"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="rounded bg-sp-card p-2 text-xs text-sp-text ring-1 ring-sp-border"
        />
        {targets.length === 0 && (
          <p className="text-xs text-sp-muted">지도에서 [+ 주제]로 주제를 먼저 만들어 주세요.</p>
        )}
        {error && (
          <p role="alert" className="text-xs text-sp-text">
            {error}
          </p>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
        {items.length === 0 && (
          <p className="text-xs text-sp-muted">
            미분류나 자리 미정에 있는 근거가 없습니다. 장면의 연결을 해제하면 여기에서 다시 찾을 수
            있습니다.
          </p>
        )}
        {items.length > 0 &&
          !items.some((item) => item.evidence.content.includes(query.trim())) && (
            <p className="text-xs text-sp-muted">검색 결과가 없습니다. 다른 말로 찾아보세요.</p>
          )}
        {items
          .filter((item) => item.evidence.content.includes(query.trim()))
          .map(({ evidence, group }) => (
            <article key={evidence.id} className="rounded-lg bg-sp-card p-3 ring-1 ring-sp-border">
              <p className="mb-1 text-xs text-sp-muted">
                {group}
                {evidence.date ? ` · ${evidence.date}` : ''}
              </p>
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-sp-text">
                {evidence.content}
              </p>
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => onSelect(evidence.id)}
                  className="rounded px-2 py-1 text-xs text-sp-muted ring-1 ring-sp-border"
                >
                  상세 보기
                </button>
                <button
                  type="button"
                  disabled={!target || !validScene || busy !== null}
                  onClick={() => void put(evidence.id)}
                  className="rounded bg-sp-accent px-2 py-1 text-xs text-sp-accent-fg disabled:opacity-40"
                >
                  {busy === evidence.id ? '넣는 중…' : '넣기'}
                </button>
              </div>
            </article>
          ))}
      </div>
    </aside>
  );
}
