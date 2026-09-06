/**
 * 근거 정리 보드의 **카드 한 장** — 본문·메타·유형 칩·[AI 제외][수정][삭제]·"이것도 이 주제?".
 *
 * 스토어를 구독하지 않는다. 무엇을 보여 줄지와 눌렀을 때 무엇을 할지는 전부 부모(`RecordEvidenceBoard`)가
 * props 로 준다 — 저장 관문은 부모가 지킨다(ADR-085 보강).
 * 카드 클릭 = 선택. 단추 줄은 전파를 끊어 선택과 겹치지 않게 한다.
 *
 * **거울 카드**(`mirror`) = 아직 근거로 저장되지 않은 원본 기록(설계서 §4-1). 배경만 한 단계 가라앉히고(`bg-sp-surface`)
 * 별도 배지는 없다 — 출처 칩과 배경 톤만으로 구분한다. [삭제]가 없다(지울 것은 원본이고 그 자리는 관찰 탭이다). 영역 칩도 없다(아직 영역이 없다).
 *
 * **끌 수 있다**(`useDraggable`, 설계서 §4-4 · ADR-085 보강 2 R3). 포인터 센서는 보드가 6px 이동 제약으로 달아
 * 클릭(선택)과 끌기(이동)를 가른다. 키보드 끌기 센서는 없다 — Enter/Space 는 지금처럼 선택이고, 키보드 경로는 하단 바다.
 * 단추 줄은 pointerdown 도 끊어 단추를 누르다가 끌리지 않게 한다.
 *
 * [AI 제외]는 겉에 있다(설계서 §4-5). 예전에는 [ … ]를 눌러야 스위치가 펼쳐졌고, 오너는 "여기서 켜고 끌 수 없다"고
 * 봤다 — 숨긴 조작은 없는 조작이다. 켜진 카드에는 왜 자동으로 켜졌는지 한 줄을 붙인다(교사가 직접 켠 것에는 없음).
 */
import type { ReactElement } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { RECORD_AREA_LABELS, type RecordArea } from '@domain/entities/RecordDraft';
import { EVIDENCE_SOURCE_LABELS, type RecordEvidence } from '@domain/entities/RecordEvidence';
import type { ThreadMatch } from '@domain/rules/threadSuggest';
import { detectProhibitedTerms, summarizeProhibited } from '@domain/rules/prohibitedRecordTerms';
import {
  boardBtn,
  boardChip,
  shortDate,
} from '@adapters/components/RecordDraft/evidenceBoardStyles';

export interface EvidenceCardProps {
  readonly evidence: RecordEvidence;
  readonly selected: boolean;
  /** 이 컨텍스트의 영역 목록 — 유형 칩. 하나뿐이면 칩을 그리지 않는다(뺄 수도 없는 칩, 설계서 §5-b). */
  readonly areas: readonly RecordArea[];
  /** "이것도 이 주제?" 칩(미분류 카드에만 부모가 넣어 준다). */
  readonly alsoHits: readonly ThreadMatch[];
  /** 거울 카드(저장 안 된 원본). 기본 false. */
  readonly mirror?: boolean;
  onToggleSelect: () => void;
  onToggleArea: (area: RecordArea) => void;
  onEdit: () => void;
  onRemove: () => void;
  onSetExcludedFromAi: (excluded: boolean) => void;
  onSendTo: (threadId: string) => void;
}

/** 자동 판정 갈래("학원·기관명" 등). 비어 있으면 교사가 직접 켠 것이다. */
function autoExclusionWhy(evidence: RecordEvidence): string[] {
  if (!evidence.excludedFromAi) return [];
  return summarizeProhibited(detectProhibitedTerms(evidence.content));
}

/** AI 제외 토글의 안내 문구 — 켜져 있으면 왜 빠졌는지(갈래)를 함께 알려 준다. */
function exclusionTitle(evidence: RecordEvidence, why: readonly string[]): string {
  if (!evidence.excludedFromAi) return '이 근거를 AI에게 보내지 않도록 합니다.';
  const reason = why.length > 0 ? `: ${why.join(', ')}가 들어 있습니다` : '';
  return `이 근거는 AI에게 보내지 않습니다${reason}. 눌러서 보내도록 바꿉니다.`;
}

export function EvidenceCard({
  evidence: ev,
  selected: on,
  areas,
  alsoHits,
  mirror = false,
  onToggleSelect,
  onToggleArea,
  onEdit,
  onRemove,
  onSetExcludedFromAi,
  onSendTo,
}: EvidenceCardProps): ReactElement {
  const excluded = ev.excludedFromAi === true;
  const why = autoExclusionWhy(ev);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: ev.id });
  /** 단추 줄 — 클릭·키·포인터 전부 끊는다(카드 선택·끌기와 겹치지 않게). */
  const stop = {
    onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
    onKeyDown: (e: { stopPropagation: () => void }) => e.stopPropagation(),
    onPointerDown: (e: { stopPropagation: () => void }) => e.stopPropagation(),
  };
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-pressed={on}
      aria-label={`${ev.content.slice(0, 20)} 근거 카드`}
      onClick={onToggleSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggleSelect();
        }
      }}
      className={`flex cursor-pointer flex-col gap-2 rounded-xl px-3 py-2.5 ring-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sp-accent ${
        on
          ? 'bg-blue-500/10 ring-sp-accent'
          : `${mirror ? 'bg-sp-surface' : 'bg-sp-card'} ring-sp-border hover:ring-sp-muted`
      } ${isDragging ? 'opacity-40' : ''}`}
      data-mirror={mirror ? '' : undefined}
    >
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-sp-text">{ev.content}</p>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-sp-muted">
        {ev.date ? <span>{shortDate(ev.date)}</span> : null}
        <span className="rounded bg-sp-surface px-1.5 py-0.5">
          {EVIDENCE_SOURCE_LABELS[ev.sourceType ?? 'manual']}
        </span>
      </div>
      {/* 유형 토글 · AI 제외 · 수정 · 삭제 — 카드 클릭(선택)·끌기와 겹치지 않게 전파를 끊는다. */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-sp-border pt-2" {...stop}>
        {areas.length > 1 &&
          !mirror &&
          areas.map((area) => {
            const has = ev.areas.includes(area);
            return (
              <button
                key={area}
                type="button"
                aria-pressed={has}
                onClick={() => onToggleArea(area)}
                className={boardChip(has)}
              >
                {RECORD_AREA_LABELS[area]}
              </button>
            );
          })}
        <div className="flex-1" />
        {/* 기재 금지 항목이 섞이면 저장 시 자동으로 켜지고, 자동 판정은 오탐이 나므로 되돌릴 수 있다(ADR-072 결정 5). */}
        <button
          type="button"
          aria-pressed={excluded}
          onClick={() => onSetExcludedFromAi(!excluded)}
          title={exclusionTitle(ev, why)}
          className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium ring-1 transition-colors ${
            excluded
              ? 'bg-amber-500/15 text-amber-600 ring-amber-500/30 hover:bg-amber-500/25'
              : 'text-sp-muted ring-sp-border hover:bg-sp-surface hover:text-sp-text'
          }`}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-sm">
            block
          </span>
          AI 제외
        </button>
        <button
          type="button"
          onClick={onEdit}
          className={`${boardBtn} text-sp-muted hover:text-sp-text`}
        >
          수정
        </button>
        {!mirror && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg px-2.5 py-1 text-xs font-medium text-red-500 ring-1 ring-red-500/20 hover:bg-red-500/10"
          >
            삭제
          </button>
        )}
      </div>
      {why.length > 0 && (
        <p className="text-xs leading-snug text-amber-600">
          {why.join(', ')} 언급이 있어 자동으로 제외했습니다.
        </p>
      )}
      {alsoHits.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-1.5 border-t border-dashed border-sp-border pt-2"
          {...stop}
        >
          <span className="text-xs text-sp-muted">이것도 이 주제?</span>
          {alsoHits.map((h) => (
            <button
              key={h.threadId}
              type="button"
              onClick={() => onSendTo(h.threadId)}
              title={`겹친 낱말: ${h.matched.join(', ')}`}
              className="rounded-full px-2 py-0.5 text-xs font-medium text-sp-accent ring-1 ring-blue-500/30 transition-colors hover:bg-blue-500/10"
            >
              {h.title}
              <span className="ml-1 text-sp-muted">{h.matched[0]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
