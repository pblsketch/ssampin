/**
 * 근거 정리 보드의 **카드 한 장** — 겉면은 본문·날짜·출처·상태, 조작은 **골랐을 때**(ADR-093 결정 5).
 *
 * 스토어를 구독하지 않는다. 무엇을 보여 줄지와 눌렀을 때 무엇을 할지는 전부 부모(`RecordEvidenceBoard`)가
 * props 로 준다 — 저장 관문은 부모가 지킨다(ADR-085 보강).
 * 카드 클릭 = 선택. 단추 줄은 전파를 끊어 선택과 겹치지 않게 한다.
 *
 * **겉면(항상)**: 본문 · 날짜 · 출처 칩 · 상태 배지(`AI 제외됨`, `원본과 내용이 달라요` + [비교하기], 자동 제외 이유) ·
 *   "이것도 이 주제?" 칩. 상태와 중요한 경고는 숨기지 않는다.
 * **골랐을 때**: 영역 칩(2개 이상일 때) · [AI 제외]/[AI 제외 해제] 토글 · [수정] · [원본 보기·수정] · [삭제 | 정리한 근거 삭제].
 *   마우스 올리기만으로 나타나는 것은 없다 — 클릭·Enter/Space 로 고르면 Tab 으로 들어갈 수 있다.
 *   ★ADR-085 보강 2 §4-5("토글은 겉에")를 ADR-093 이 바꿨다: 카드마다 5~7개 단추가 늘 붙어 근거 본문이 묻혔다.
 *     상태는 배지로 겉에 남아 "모르게 되는" 일은 없고, 여러 장은 하단 바에서 한 번에 바꾼다.
 *
 * **거울 카드**(`mirror`) = 아직 근거로 저장되지 않은 원본 기록(설계서 §4-1). 배경만 한 단계 가라앉히고(`bg-sp-surface`)
 * 별도 배지는 없다. [삭제]가 없다(지울 것은 원본이고 그 자리는 관찰 탭이다). 영역 칩도 없다(아직 영역이 없다).
 *
 * **끌 수 있다**(`useDraggable`, 설계서 §4-4 · ADR-085 보강 2 R3). 포인터 센서는 보드가 6px 이동 제약으로 달아
 * 클릭(선택)과 끌기(이동)를 가른다. 키보드 끌기 센서는 없다 — Enter/Space 는 선택이고, 키보드 경로는 하단 바다.
 */
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { RECORD_AREA_LABELS, type RecordArea } from '@domain/entities/RecordDraft';
import { EVIDENCE_SOURCE_LABELS, type RecordEvidence } from '@domain/entities/RecordEvidence';
import { NARRATIVE_NOTE_MAX } from '@domain/entities/InquiryThread';
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
  readonly showActions?: boolean;
  onNoteEditingChange?: (editing: boolean) => void;
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
  /**
   * [원본 보기·수정] - 이 근거가 온 원본 기록으로 이동한다(계획 §4.3).
   * 원본이 없는 직접 입력 근거에는 부모가 넘기지 않는다.
   */
  onOpenSource?: () => void;
  /**
   * 지금 원본과 내용이 다른가(계획 §5.3). **다를 때만 표시한다** -
   * '같음'은 카드가 아니라 상세(근거 수정 폼)에서만 말한다. 목록에 "같음"이 줄줄이 붙으면
   * 정작 봐야 할 "다름"이 묻힌다.
   * 확인 중·확인 실패·원본 없음은 `false` 다. 모르는 것을 "다르다"고 말하지 않는다.
   */
  readonly differsFromSource?: boolean;
  /** [비교하기] - 비교 대화상자를 연다. 없으면 배지 줄을 그리지 않는다. */
  onCompareSource?: () => void;
  /**
   * 좁은 자리용 압축 겉면(ADR-103, 옛 흐름 보기의 장면 칸이 쓰던 것). 본문을 3줄로 줄인다.
   * ★상태 배지·경고는 **줄이지 않는다** — 좁다고 숨기면 "끌 수 없는 필터"와 같은 사고가 된다.
   */
  readonly compact?: boolean;
  /**
   * 교사 메모 고치기(ADR-103 D4). 없으면 메모 칸을 아예 그리지 않는다.
   * ★메모는 **카드를 따라간다** — 주제를 옮기든 장면을 옮기든 같이 간다(근거 파일에 산다).
   */
  onChangeNote?: (note: string) => void | Promise<void>;
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
  showActions = false,
  onNoteEditingChange,
  areas,
  alsoHits,
  mirror = false,
  onToggleSelect,
  onToggleArea,
  onEdit,
  onRemove,
  onSetExcludedFromAi,
  onSendTo,
  onOpenSource,
  differsFromSource = false,
  onCompareSource,
  compact = false,
  onChangeNote,
}: EvidenceCardProps): ReactElement {
  const excluded = ev.excludedFromAi === true;
  // null 이면 보기 상태. 빈 문자열은 "메모를 지우는 중"이라 null 과 구별한다.
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState(false);
  const saveNote = async (): Promise<void> => {
    if (noteDraft === null || !onChangeNote || noteSaving) return;
    setNoteSaving(true);
    setNoteError(false);
    try {
      await onChangeNote(noteDraft.trim());
      setNoteDraft(null);
    } catch {
      setNoteError(true);
    } finally {
      setNoteSaving(false);
    }
  };
  const note = ev.note?.trim() ?? '';
  const editingCallback = useRef(onNoteEditingChange);
  editingCallback.current = onNoteEditingChange;
  const noteDirty = noteDraft !== null && noteDraft.trim() !== note;
  useEffect(() => {
    editingCallback.current?.(noteDirty);
    return () => editingCallback.current?.(false);
  }, [noteDirty]);
  const why = autoExclusionWhy(ev);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: ev.id });
  /** 단추 줄 — 클릭·키·포인터 전부 끊는다(카드 선택·끌기와 겹치지 않게). */
  const stop = {
    onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
    onKeyDown: (e: { stopPropagation: () => void }) => e.stopPropagation(),
    onPointerDown: (e: { stopPropagation: () => void }) => e.stopPropagation(),
  };
  const showDiffers = !mirror && differsFromSource && onCompareSource !== undefined;
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
      // 저장 직후 이동이 이 표시로 카드를 찾아 스크롤·포커스한다(계획 §4.3).
      data-evidence-id={ev.id}
    >
      {/* 좁은 칸에서는 세 줄로 자르되, 카드를 고르면(클릭·Enter) 전문을 펼친다. 고르지 않아도
          마우스를 올리면 툴팁으로 전문이 보인다. 새 단추를 늘리지 않는다(ADR-093 — 조작은 고를 때만). */}
      <p
        title={compact && !on ? ev.content : undefined}
        className={`whitespace-pre-wrap text-sm leading-relaxed text-sp-text ${
          compact && !on ? 'line-clamp-3' : ''
        }`}
      >
        {ev.content}
      </p>
      {/* 교사 메모 — 겉면에 남는다(골라야 보이면 카드를 따라간다는 뜻이 안 산다). */}
      {note.length > 0 && noteDraft === null && (
        <p className="flex items-start gap-1 text-xs leading-relaxed text-sp-muted">
          <span aria-hidden="true" className="material-symbols-outlined text-sm">
            sticky_note_2
          </span>
          <span
            title={compact && !on ? note : undefined}
            className={`whitespace-pre-wrap ${compact && !on ? 'line-clamp-2' : ''}`}
          >
            {note}
          </span>
        </p>
      )}
      {/* 겉면 메타 — 날짜 · 출처 · 상태 배지. 제외 상태는 골라야 보이는 것이 아니다. */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-sp-muted">
        {ev.date ? <span>{shortDate(ev.date)}</span> : null}
        <span className="rounded bg-sp-surface px-1.5 py-0.5">
          {EVIDENCE_SOURCE_LABELS[ev.sourceType ?? 'manual']}
        </span>
        {!mirror &&
          ev.areas.length > 0 &&
          areas.length > 1 &&
          ev.areas.map((a) => (
            <span key={a} className="rounded bg-sp-surface px-1.5 py-0.5">
              {RECORD_AREA_LABELS[a]}
            </span>
          ))}
        {excluded && (
          <span
            className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-600"
            title={exclusionTitle(ev, why)}
            data-testid="evidence-excluded-badge"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-xs">
              block
            </span>
            AI 제외됨
          </span>
        )}
      </div>
      {/* 원본과 다를 때만. 어느 쪽이 언제 바뀌었다고 말하지 않는다(ADR-086 결정 5).
          거울 카드는 원본 그 자체라 비교 대상이 아니다. 중요한 경고라 겉면에 남는다. */}
      {showDiffers && (
        <div
          className="flex flex-wrap items-center gap-1.5 border-t border-dashed border-amber-500/30 pt-2"
          {...stop}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-sm text-amber-600">
            sync_problem
          </span>
          <span className="text-xs font-medium text-amber-600">원본과 내용이 달라요</span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onCompareSource}
            aria-label={`${ev.content.slice(0, 20)} 근거의 원본과 비교`}
            className="rounded-lg px-2.5 py-1 text-xs font-medium text-amber-600 ring-1 ring-amber-500/30 transition-colors hover:bg-amber-500/10"
          >
            비교하기
          </button>
        </div>
      )}
      {why.length > 0 && (
        <p className="text-xs leading-snug text-amber-600">
          {why.join(', ')} 언급이 있어 자동으로 제외했습니다.
        </p>
      )}
      {/* 조작 줄 — 골랐을 때만. 유형 토글 · AI 제외 · 수정 · 원본 · 삭제. 전파를 끊어 선택·끌기와 겹치지 않게. */}
      {(on || showActions) && (
        <div
          className="flex flex-wrap items-center gap-1.5 border-t border-sp-border pt-2"
          data-testid="evidence-card-actions"
          {...stop}
        >
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
            {excluded ? 'AI 제외 해제' : 'AI 제외'}
          </button>
          {onChangeNote !== undefined && (
            <button
              type="button"
              onClick={() => setNoteDraft(note)}
              className={`${boardBtn} text-sp-muted hover:text-sp-text`}
              title="이 근거에 선생님 메모를 답니다. 메모는 카드를 따라가고 초안 요청서에도 실립니다."
            >
              {note.length > 0 ? '메모 고치기' : '메모'}
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            className={`${boardBtn} text-sp-muted hover:text-sp-text`}
          >
            수정
          </button>
          {/* 근거를 다듬는 일([수정])과 원본을 고치는 일을 구별한다(계획 §5.3). */}
          {onOpenSource !== undefined && (
            <button
              type="button"
              onClick={onOpenSource}
              className={`${boardBtn} text-sp-muted hover:text-sp-text`}
              title="이 근거가 온 원본 기록으로 갑니다. 근거 내용은 그대로 둡니다."
            >
              원본 보기·수정
            </button>
          )}
          {!mirror && ev.threadId !== undefined && (
            <button
              type="button"
              onClick={onRemove}
              title="주제와 장면 배치만 해제합니다. 근거 내용·메모·원본 기록은 그대로 보존합니다."
              className={`${boardBtn} text-sp-muted hover:text-sp-text`}
            >
              {/* 원본에서 온 근거는 "지우는 것이 원본이 아니다"를 라벨에서 먼저 말한다(계획 §5.3). */}
              미분류로 돌리기
            </button>
          )}
        </div>
      )}
      {noteDraft !== null && onChangeNote !== undefined && (
        <div className="flex flex-col gap-1 border-t border-sp-border pt-2" {...stop}>
          <textarea
            autoFocus
            value={noteDraft}
            disabled={noteSaving}
            rows={2}
            maxLength={NARRATIVE_NOTE_MAX}
            placeholder="이 근거에서 무엇을 읽었는지 한 줄"
            aria-label="근거 메모"
            onChange={(e) => setNoteDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setNoteDraft(null);
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                void saveNote();
              }
            }}
            className="w-full resize-none rounded-lg border border-sp-border bg-sp-surface px-2 py-1.5 text-xs leading-relaxed text-sp-text focus:border-sp-accent focus:outline-none"
          />
          {noteError && (
            <p role="alert" className="text-xs text-sp-text">
              메모를 저장하지 못했습니다. 입력한 내용을 확인하고 다시 저장해 주세요.
            </p>
          )}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-sp-muted">
              {noteDraft.length}/{NARRATIVE_NOTE_MAX}
            </span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setNoteDraft(null)}
              disabled={noteSaving}
              className={`${boardBtn} text-sp-muted hover:text-sp-text`}
            >
              그만두기
            </button>
            <button
              type="button"
              onClick={() => void saveNote()}
              disabled={noteSaving}
              className="rounded-lg bg-sp-accent px-2.5 py-1 text-xs font-semibold text-sp-accent-fg transition-colors hover:opacity-90"
            >
              저장
            </button>
          </div>
        </div>
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
