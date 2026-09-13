/**
 * 근거 지도의 **카드 노드**(ADR-106) — 지도 위에 절대 좌표로 놓이는 압축 겉면.
 *
 * 겉면 우선순위(디자이너 검토 2026-09-11): 본문 2줄 → 날짜·출처 → 상태 아이콘(AI 제외·원본 다름·메모).
 * 상태는 색만으로 말하지 않는다 — 아이콘마다 `title` 과 읽는 이름이 있다.
 *
 * 조작: 클릭·Enter·Space = 고르기(오른쪽에 상세가 열린다). 끌기 = 옮기기(`useDraggable`, 부모의 DndContext) —
 * 장면 열로 끌면 그 장면에 놓이고, 장면이 없는 묶음 안에서는 자리만 민다.
 * ★근거 사이 연결 손잡이는 없다(ADR-108). 근거의 앞뒤는 장면 안 차례가 말한다.
 *
 * ★전문은 여기 없다. 고르면 오른쪽에서 기존 근거 카드(전문·메모·원본 비교·AI 제외)를 그대로 본다.
 */
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { CSSProperties, ReactElement } from 'react';

import { EVIDENCE_SOURCE_LABELS, type RecordEvidence } from '@domain/entities/RecordEvidence';
import { shortDate } from '@adapters/components/RecordDraft/evidenceBoardStyles';

export interface EvidenceMapNodeProps {
  readonly evidence: RecordEvidence;
  readonly selected: boolean;
  /** 오른쪽 상세가 이 카드를 보고 있는가. */
  readonly focused: boolean;
  /** 거울 카드(아직 근거로 저장되지 않은 원본). */
  readonly mirror: boolean;
  readonly differsFromSource: boolean;
  readonly style: CSSProperties;
  onSelect: () => void;
  onToggleSelected?: () => void;
  readonly locked?: boolean;
}

export function evidenceHead(content: string, n = 16): string {
  const t = content.trim().replace(/\s+/g, ' ');
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

export function EvidenceMapNode({
  evidence: ev,
  selected,
  focused,
  mirror,
  differsFromSource,
  style,
  onSelect,
  onToggleSelected,
  locked = false,
}: EvidenceMapNodeProps): ReactElement {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: ev.id,
    disabled: locked,
  });
  const drop = useDroppable({
    id: `drop:before:${ev.id}`,
    disabled: locked || isDragging,
    data: { label: '이 근거 앞에 놓기' },
  });
  const excluded = ev.excludedFromAi === true;
  const note = ev.note?.trim() ?? '';
  const states: string[] = [];
  if (excluded) states.push('AI 제외됨');
  if (differsFromSource) states.push('원본과 내용이 다름');
  if (note.length > 0) states.push('메모 있음');
  if (mirror) states.push('아직 근거로 저장되지 않은 원본');

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        drop.setNodeRef(node);
      }}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${evidenceHead(ev.content, 20)} 근거${states.length > 0 ? `, ${states.join(', ')}` : ''}`}
      data-map-node={ev.id}
      data-evidence-id={ev.id}
      data-mirror={mirror ? '' : undefined}
      // 지도 위 카드는 유리 모드에서도 불투명해야 읽힌다. 떠 있는 면 표시를 단다.
      data-sp-floating
      style={style}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`group/node absolute flex cursor-pointer flex-col gap-1 rounded-xl px-3 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sp-accent ${
        selected
          ? 'bg-sp-card ring-2 ring-sp-accent'
          : `${mirror ? 'bg-sp-surface' : 'bg-sp-card'} ring-1 ring-sp-border hover:ring-sp-muted`
      } ${focused && !selected ? 'ring-2 ring-sp-accent' : ''} ${isDragging ? 'opacity-40' : ''}`}
    >
      {onToggleSelected && (
        <input
          type="checkbox"
          checked={selected}
          aria-label={`${evidenceHead(ev.content, 20)} 초안 근거 선택`}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onChange={onToggleSelected}
          className="absolute right-2 top-2 h-4 w-4 accent-sp-accent"
        />
      )}
      {drop.isOver && (
        <span className="absolute -top-2 inset-x-0 border-t-2 border-sp-accent text-xs text-sp-accent">
          이 근거 앞에 놓기
        </span>
      )}
      <p className="line-clamp-2 pr-5 text-sm leading-snug text-sp-text" title={ev.content}>
        {ev.content}
      </p>
      <div className="mt-auto flex items-center gap-1.5 text-xs text-sp-muted">
        {ev.date ? <span>{shortDate(ev.date)}</span> : null}
        <span className="truncate rounded bg-sp-surface px-1.5 py-0.5">
          {EVIDENCE_SOURCE_LABELS[ev.sourceType ?? 'manual']}
        </span>
        {mirror && (
          <span
            className="truncate rounded bg-sp-card px-1.5 py-0.5 text-sp-muted"
            title="주제로 끌어 놓으면 근거로 저장됩니다"
          >
            아직 근거 아님
          </span>
        )}
        <span className="flex-1" />
        {excluded && (
          <span
            className="material-symbols-outlined text-sm text-amber-600"
            title="AI 제외됨: 초안 요청서에 실리지 않습니다"
            aria-hidden="true"
          >
            block
          </span>
        )}
        {differsFromSource && (
          <span
            className="material-symbols-outlined text-sm text-amber-600"
            title="원본과 내용이 달라요: 상세에서 비교할 수 있습니다"
            aria-hidden="true"
          >
            sync_problem
          </span>
        )}
        {note.length > 0 && (
          <span
            className="material-symbols-outlined text-sm text-sp-muted"
            title={`메모: ${note}`}
            aria-hidden="true"
          >
            sticky_note_2
          </span>
        )}
      </div>
    </div>
  );
}
