/**
 * 근거 정리 보드의 **열 하나** — 머리(제목·건수·주제 단추)와 카드 목록. 미분류 열과 주제 열이 같은 껍데기를 쓴다.
 *
 * 스토어를 구독하지 않는다. 카드는 부모가 `renderCard` 로 그려 주고, 주제 단추의 동작도 부모가 props 로 준다.
 *  - 제목은 두 줄까지 감싼다(긴 주제 이름이 잘리던 문제, 설계서 §4-2). 두 번 클릭하면 그 자리에서 고친다.
 *  - 열 머리에는 [줄기 보기]·[주제 닫기/다시 열기]만 둔다. 파괴 동작(주제 삭제)은 서랍 안에만 있다(§5-c).
 *  - 닫힌 주제 열은 접을 수 있다(`collapsed`).
 *  - 카드를 놓을 수 있다(`useDroppable`, 설계서 §4-4). ★닫힌 주제 열은 받지 않는다 — 끌리는 동안 흐려지고,
 *    놓아도 보드에 `over` 가 오지 않아 저장 0회다. 받는 열은 위에 있는 동안만 테두리가 강조색이다(동작에 답하는 움직임만).
 */
import { useState, type ReactElement, type ReactNode } from 'react';
import { useDndContext, useDroppable } from '@dnd-kit/core';
import type { RecordEvidence } from '@domain/entities/RecordEvidence';
import type { InquiryThread } from '@domain/entities/InquiryThread';
import { boardBtn } from '@adapters/components/RecordDraft/evidenceBoardStyles';

/** 놓는 곳 id — 보드의 onDragEnd 가 이 값으로 어느 열인지 되짚는다. */
export const UNCLASSIFIED_DROP_ID = 'drop:unclassified';
export const threadDropId = (threadId: string): string => `drop:thread:${threadId}`;

export interface EvidenceColumnProps {
  readonly title: string;
  readonly items: readonly RecordEvidence[];
  /** 카드가 0장일 때 보여 줄 것(문장 또는 초대 단추). */
  readonly empty: ReactNode;
  /** 주제 열이면 그 주제. 미분류 열은 없음. */
  readonly thread?: InquiryThread;
  /** 닫힌 주제 열을 접어 둔 상태. */
  readonly collapsed: boolean;
  /** AI 제안 고스트 카드(점선). 부모가 그려 준다. */
  readonly ghost: ReactElement | null;
  /** 미분류 열은 주제 열보다 조금 넓다(받은편지함). */
  readonly wide?: boolean;
  /** 카드 한 장. 반환 요소에 `key` 를 달아 준다. */
  renderCard: (evidence: RecordEvidence) => ReactElement;
  onToggleCollapsed: () => void;
  onOpenThread: () => void;
  onToggleStatus: () => void;
  /** 제목을 두 번 클릭해 고쳤을 때. 빈 값·같은 값이면 부르지 않는다. */
  onRename: (title: string) => void;
  /**
   * [관찰 이어 쓰기] - 이 주제로 **빈 본문** 입력을 연다(계획 §4.3).
   * 기존 글을 복사하지 않는다. 없으면 단추를 그리지 않는다.
   */
  onComposeObservation?: () => void;
}

export function EvidenceColumn({
  title,
  items,
  empty,
  thread,
  collapsed,
  ghost,
  wide = false,
  renderCard,
  onToggleCollapsed,
  onOpenThread,
  onToggleStatus,
  onComposeObservation,
  onRename,
}: EvidenceColumnProps): ReactElement {
  const closed = thread !== undefined && thread.status === 'closed';
  const showCollapsed = closed && collapsed;
  const { setNodeRef, isOver } = useDroppable({
    id: thread ? threadDropId(thread.id) : UNCLASSIFIED_DROP_ID,
    disabled: closed,
  });
  const dragActive = useDndContext().active !== null;
  /** 제목 고치기 — null 이면 보기 상태. `InquiryThreadPanel` 의 titleDraft 와 같은 패턴. */
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const commitTitle = (): void => {
    if (titleDraft === null) return;
    const v = titleDraft.trim();
    if (v.length > 0 && v !== title) onRename(v);
    setTitleDraft(null);
  };
  return (
    <section
      ref={setNodeRef}
      aria-label={`${title} 열`}
      data-drop-over={isOver && !closed ? '' : undefined}
      className={`flex shrink-0 flex-col rounded-xl bg-sp-surface ring-1 ${
        isOver && !closed ? 'ring-2 ring-sp-accent' : 'ring-sp-border'
      } ${showCollapsed ? 'w-44' : wide ? 'w-80' : 'w-72'} ${
        closed ? (dragActive ? 'opacity-40' : 'opacity-80') : ''
      }`}
    >
      <header className="flex flex-col gap-1.5 border-b border-sp-border px-3 py-2">
        <div className="flex items-start gap-2">
          {titleDraft === null ? (
            <h4
              className={`min-w-0 flex-1 break-keep text-sm font-semibold leading-snug text-sp-text ${
                showCollapsed ? 'truncate' : 'line-clamp-2'
              } ${thread ? 'cursor-text' : ''}`}
              title={thread ? `${title} (두 번 클릭해 이름 고치기)` : title}
              onDoubleClick={thread ? () => setTitleDraft(title) : undefined}
            >
              {title}
            </h4>
          ) : (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitTitle();
                } else if (e.key === 'Escape') {
                  setTitleDraft(null);
                }
              }}
              aria-label="주제 이름"
              className="min-w-0 flex-1 rounded-lg border border-sp-border bg-sp-card px-2 py-0.5 text-sm font-semibold text-sp-text focus:border-sp-accent focus:outline-none"
            />
          )}
          <span className="rounded-full bg-sp-card px-1.5 py-0.5 text-xs font-semibold text-sp-muted">
            {items.length}
          </span>
          {closed && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-label={showCollapsed ? `${title} 펼치기` : `${title} 접기`}
              className="rounded-lg p-0.5 text-sp-muted transition-colors hover:bg-sp-card hover:text-sp-text"
            >
              <span className="material-symbols-outlined text-base">
                {showCollapsed ? 'unfold_more' : 'unfold_less'}
              </span>
            </button>
          )}
        </div>
        {closed && <span className="text-xs text-sp-muted">닫힌 주제</span>}
        {!showCollapsed && thread !== undefined && (
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={onOpenThread}
              className={`${boardBtn} text-sp-muted hover:text-sp-text`}
              title="시간순 줄기·키워드·다음 메모를 옆 서랍으로 엽니다. 주제 삭제도 거기 있습니다."
            >
              줄기 보기
            </button>
            {/* 마친 주제에는 이어 쓰지 않는다 - 다시 열어야 새 근거를 묶을 수 있다. */}
            {onComposeObservation !== undefined && !closed && (
              <button
                type="button"
                onClick={onComposeObservation}
                className={`${boardBtn} text-sp-muted hover:text-sp-text`}
                title="이 학생·이 주제로 빈 관찰 입력을 엽니다. 기존 글을 복사하지 않습니다."
              >
                관찰 이어 쓰기
              </button>
            )}
            <button
              type="button"
              onClick={onToggleStatus}
              className={`${boardBtn} text-sp-muted hover:text-sp-text`}
              title={
                closed
                  ? '다시 열면 새 근거를 이 주제로 묶을 수 있습니다.'
                  : '학기가 끝난 주제를 닫습니다. 근거는 그대로 남습니다.'
              }
            >
              {closed ? '다시 열기' : '주제 닫기'}
            </button>
          </div>
        )}
      </header>
      {!showCollapsed && (
        <div className="flex min-h-[80px] flex-1 flex-col gap-2 overflow-y-auto p-2">
          {items.length === 0 && ghost === null ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center text-xs text-sp-muted">
              {empty}
            </div>
          ) : (
            items.map((e) => renderCard(e))
          )}
          {ghost}
        </div>
      )}
    </section>
  );
}
