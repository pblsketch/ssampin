import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { EvidenceMapGroupModel } from './EvidenceMapView';
import type { MapLayout } from './evidenceMapLayout';
import { placeSceneAfter } from '@domain/rules/narrativeSceneOrder';

export type MapConnectionChange =
  | { kind: 'order'; threadId: string; anchorId: string; sceneId: string }
  | { kind: 'attach'; threadId: string; sceneId: string; evidenceId: string }
  | { kind: 'move'; threadId: string; sceneId: string; evidenceId: string; fromSceneId: string }
  | { kind: 'detach'; threadId: string; sceneId: string; evidenceId: string }
  | { kind: 'focus'; threadId: string; sceneId: string; evidenceId: string; note: string };
type Start = { threadId: string; x: number; y: number } & (
  | { kind: 'order'; anchorId: string }
  | { kind: 'attach' | 'move'; evidenceId: string; fromSceneId?: string }
);
type Target = {
  threadId: string;
  sceneId: string;
  x: number;
  y: number;
  label: string;
  kind: 'order' | 'evidence';
};
type Edge = {
  threadId: string;
  sceneId: string;
  evidenceId: string;
  label: string;
  note: string;
  x: number;
  y: number;
  nx: number;
  ny: number;
  locked: boolean;
};
const curve = (x: number, y: number, nx: number, ny: number): string =>
  `M ${x} ${y} C ${x + 28} ${y}, ${nx - 28} ${ny}, ${nx} ${ny}`;
export function EvidenceMapConnections({
  groups,
  layout,
  onChange,
  onEditingChange,
}: {
  groups: readonly EvidenceMapGroupModel[];
  layout: MapLayout;
  onChange: (change: MapConnectionChange) => Promise<void>;
  onEditingChange?: (editing: boolean) => void;
}): ReactElement {
  const [start, setStart] = useState<Start | null>(null);
  const [hover, setHover] = useState<Target | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [selected, setSelected] = useState<Edge | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const targets: Target[] = [];
  const edges: Edge[] = [];
  const sources: { source: Start; label: string }[] = [];
  for (const g of groups) {
    const box = layout.groups.find((b) => b.key === g.key);
    if (!g.thread || !box || g.collapsed) continue;
    for (const c of g.columns ?? []) {
      const cb = box.columns?.find((b) => b.key === c.key);
      if (!c.scene || !cb) continue;
      const label = c.detail ? `${c.slot} · ${c.detail}` : c.slot;
      if (!g.closed && !c.virtual) {
        targets.push({
          threadId: g.thread.id,
          sceneId: c.scene.id,
          x: cb.x + 24,
          y: box.y + cb.y,
          label,
          kind: 'order',
        });
        targets.push({
          threadId: g.thread.id,
          sceneId: c.scene.id,
          x: cb.x + cb.w,
          y: box.y + cb.y + 44,
          label,
          kind: 'evidence',
        });
        sources.push({
          source: {
            kind: 'order',
            threadId: g.thread.id,
            anchorId: c.scene.id,
            x: cb.x + 24,
            y: box.y + cb.y + cb.h,
          },
          label: `${label} 다음 연결점`,
        });
      }
      for (const id of c.scene.evidenceIds) {
        const n = box.nodes.find((node) => node.id === id);
        if (!n) continue;
        edges.push({
          threadId: g.thread.id,
          sceneId: c.scene.id,
          evidenceId: id,
          label,
          note: c.scene.evidenceFocus?.find((f) => f.evidenceId === id)?.note ?? '',
          x: cb.x + cb.w,
          y: box.y + cb.y + 44,
          nx: n.x,
          ny: n.y + n.h / 2,
          locked: g.closed === true,
        });
      }
    }
    if (!g.closed && (g.thread.scenes?.length ?? 0) > 0)
      for (const n of box.nodes)
        sources.push({
          source: {
            kind: 'attach',
            threadId: g.thread.id,
            evidenceId: n.id,
            x: n.x,
            y: n.y + n.h / 2,
          },
          label: `${g.items.find((e) => e.id === n.id)?.content.slice(0, 20) ?? '근거'} 연결 추가`,
        });
  }
  if (selected && !selected.locked)
    sources.push({
      source: {
        kind: 'move',
        threadId: selected.threadId,
        evidenceId: selected.evidenceId,
        fromSceneId: selected.sceneId,
        x: selected.x + 16,
        y: selected.y,
      },
      label: '이 연결의 장면 쪽 끝점 옮기기',
    });
  const valid = (target: Target): boolean =>
    start !== null &&
    start.threadId === target.threadId &&
    (start.kind === 'order'
      ? target.kind === 'order' && target.sceneId !== start.anchorId
      : target.kind === 'evidence' && target.sceneId !== start.fromSceneId);
  const dirty = selected !== null && draft !== selected.note;
  useEffect(() => {
    onEditingChange?.(dirty);
    return () => onEditingChange?.(false);
  }, [dirty, onEditingChange]);
  const run = async (change: MapConnectionChange): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await onChange(change);
      setStart(null);
      setHover(null);
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };
  const finish = (target: Target): void => {
    if (!start || !valid(target) || busy) return;
    if (start.kind === 'order')
      void run({
        kind: 'order',
        threadId: start.threadId,
        anchorId: start.anchorId,
        sceneId: target.sceneId,
      });
    else if (start.kind === 'move' && start.fromSceneId)
      void run({
        kind: 'move',
        threadId: start.threadId,
        evidenceId: start.evidenceId,
        fromSceneId: start.fromSceneId,
        sceneId: target.sceneId,
      });
    else
      void run({
        kind: 'attach',
        threadId: start.threadId,
        evidenceId: start.evidenceId,
        sceneId: target.sceneId,
      });
  };
  useEffect(() => {
    const up = (event: PointerEvent): void => {
      const p = pointer.current;
      pointer.current = null;
      if (!p || Math.hypot(event.clientX - p.x, event.clientY - p.y) < 5) return;
      suppressClick.current = true;
      const el = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest('[data-connection-target]');
      const index = Number(el?.getAttribute('data-connection-target'));
      const target = el ? targets[index] : undefined;
      if (target && valid(target)) finish(target);
      else {
        setStart(null);
        setHover(null);
      }
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 0);
    };
    const move = (event: PointerEvent): void => {
      lastPointer.current = { x: event.clientX, y: event.clientY };
      const svg = svgRef.current;
      if (!start || !svg) return;
      const point = svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const matrix = svg.getScreenCTM();
      if (matrix) {
        const local = point.matrixTransform(matrix.inverse());
        setCursor({ x: local.x, y: local.y });
      }
    };
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && start) {
        event.preventDefault();
        event.stopImmediatePropagation();
        pointer.current = null;
        setStart(null);
        setHover(null);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', key, true);
    };
  });
  useEffect(() => {
    if (!start) return;
    let frame = 0;
    const scroll = (): void => {
      const viewport = svgRef.current?.closest<HTMLElement>('[data-map-viewport]');
      const p = lastPointer.current;
      if (viewport && p && pointer.current) {
        const rect = viewport.getBoundingClientRect();
        const delta = (value: number, lo: number, hi: number): number =>
          value < lo + 40 ? -10 : value > hi - 40 ? 10 : 0;
        viewport.scrollLeft += delta(p.x, rect.left, rect.right);
        viewport.scrollTop += delta(p.y, rect.top, rect.bottom);
      }
      frame = requestAnimationFrame(scroll);
    };
    frame = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(frame);
  }, [start]);
  const begin = (source: Start): void => {
    if (busy || dirty) {
      setError('연결 메모를 먼저 저장하거나 취소해 주세요.');
      return;
    }
    setSelected(null);
    setError('');
    setCursor({ x: source.x, y: source.y });
    setStart(source);
  };
  const preview =
    start?.kind === 'order' && hover && valid(hover)
      ? placeSceneAfter(
          groups.find((g) => g.thread?.id === start.threadId)?.thread?.scenes ?? [],
          start.anchorId,
          hover.sceneId,
        )
      : null;
  const buttonClass =
    'absolute z-10 h-8 w-8 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full bg-transparent text-sp-muted hover:text-sp-accent focus:ring-2 focus:ring-sp-accent';
  return (
    <>
      <svg
        ref={svgRef}
        className="pointer-events-none absolute left-0 top-0 overflow-visible"
        width={layout.width}
        height={layout.height}
      >
        {edges.map((edge) => (
          <path
            key={`${edge.sceneId}:${edge.evidenceId}`}
            data-map-evidence-edge={`${edge.sceneId}:${edge.evidenceId}`}
            d={curve(edge.x, edge.y, edge.nx, edge.ny)}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            className="text-sp-muted"
          />
        ))}
        {edges.map((edge) => (
          <path
            key={`hit:${edge.sceneId}:${edge.evidenceId}`}
            d={curve(edge.x, edge.y, edge.nx, edge.ny)}
            fill="none"
            stroke="transparent"
            strokeWidth="12"
            className="pointer-events-auto cursor-pointer"
            role="button"
            tabIndex={0}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={`${edge.label} 근거 연결 편집`}
            onClick={() => {
              if (!dirty) {
                setSelected(edge);
                setDraft(edge.note);
                setStart(null);
              }
            }}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !dirty) {
                e.preventDefault();
                setSelected(edge);
                setDraft(edge.note);
              }
            }}
          />
        ))}
        {start && cursor && (
          <path
            data-map-connection-preview
            d={`M ${start.x} ${start.y} L ${hover && valid(hover) ? hover.x : cursor.x} ${hover && valid(hover) ? hover.y : cursor.y}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeDasharray="5 4"
            className="text-sp-accent"
          />
        )}
      </svg>
      {sources.map(({ source, label }) => (
        <button
          key={`${source.kind}:${source.kind === 'order' ? source.anchorId : source.evidenceId}`}
          type="button"
          aria-label={label}
          title={label}
          className={buttonClass}
          style={{ left: source.x, top: source.y }}
          disabled={busy}
          onPointerDown={(e) => {
            e.stopPropagation();
            pointer.current = { x: e.clientX, y: e.clientY };
            begin(source);
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (!suppressClick.current) begin(source);
          }}
        >
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-full border border-current bg-sp-card"
          />
        </button>
      ))}
      {targets.map((target, i) => (
        <button
          key={`${target.sceneId}:${target.kind}`}
          data-connection-target={i}
          type="button"
          aria-label={`${target.label} ${target.kind === 'order' ? '시작 연결점' : '근거 받는 연결점'}`}
          title={target.label}
          disabled={busy || (start !== null && !valid(target))}
          className={`${buttonClass} ${valid(target) ? 'ring-2 ring-sp-accent' : ''}`}
          style={{ left: target.x, top: target.y }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerEnter={() => setHover(target)}
          onFocus={() => setHover(target)}
          onClick={(e) => {
            e.stopPropagation();
            if (!suppressClick.current) finish(target);
          }}
        >
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-full border border-current bg-sp-card"
          />
        </button>
      ))}
      {(start || selected || error) && (
        <div
          data-map-connection-editor
          data-sp-floating
          className="absolute left-6 top-24 z-20 w-72 rounded-xl border border-sp-border bg-sp-card p-3 text-sm text-sp-text shadow-lg"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {start && (
            <>
              <p>
                {start.kind === 'order'
                  ? '다음에 올 장면의 시작점을 선택하세요.'
                  : '같은 주제의 장면 오른쪽 연결점을 선택하세요.'}
              </p>
              <p className="mt-2 text-xs text-sp-muted">
                {start.kind === 'attach'
                  ? '기존 연결은 유지하고 새 연결을 추가합니다.'
                  : '빈 곳에 놓거나 Esc를 누르면 취소합니다.'}
              </p>
              {preview && (
                <p role="status" className="mt-2 text-sp-accent">
                  {preview.scenes
                    .map(
                      (s) =>
                        s.label ??
                        groups.flatMap((g) => g.columns ?? []).find((c) => c.scene?.id === s.id)
                          ?.slot ??
                        s.role,
                    )
                    .join(' → ')}
                </p>
              )}
            </>
          )}
          {selected && (
            <>
              <p className="font-medium">{selected.label}에서 쓸 부분</p>
              <textarea
                aria-label="이 장면에서 쓸 부분"
                className="mt-2 w-full rounded border border-sp-border bg-sp-surface p-2"
                value={draft}
                maxLength={200}
                disabled={selected.locked || busy}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="자료의 어느 부분을 참고하는지 적어 주세요"
              />
              {!selected.locked && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run({ kind: 'focus', ...selected, note: draft })}
                  >
                    메모 저장
                  </button>
                  <button
                    type="button"
                    disabled={busy || dirty}
                    onClick={() =>
                      begin({
                        kind: 'move',
                        threadId: selected.threadId,
                        fromSceneId: selected.sceneId,
                        evidenceId: selected.evidenceId,
                        x: selected.nx,
                        y: selected.ny,
                      })
                    }
                  >
                    연결 옮기기
                  </button>
                  <button
                    type="button"
                    disabled={busy || dirty}
                    onClick={() => void run({ kind: 'detach', ...selected })}
                  >
                    연결 해제
                  </button>
                </div>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="mt-2 text-sp-error">
              {error}
            </p>
          )}
          <button
            type="button"
            className="mt-3 text-sp-muted"
            disabled={busy}
            onClick={() => {
              setStart(null);
              setHover(null);
              setSelected(null);
              setError('');
            }}
          >
            취소
          </button>
        </div>
      )}
    </>
  );
}
