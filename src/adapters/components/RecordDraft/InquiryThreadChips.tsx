import type { ReactNode } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { InquiryThread } from '@domain/entities/InquiryThread';

/** 주제 축의 가상 칩 — '전체'(축 미선택)와 '미분류'. 실제 주제는 `InquiryThread.id`. */
export const THREAD_ALL = '__thread_all__';
export const THREAD_UNCLASSIFIED = '__thread_unclassified__';

/** 선택된 주제 칩. 전체/미분류는 가상 값이다. */
export type ActiveThread = typeof THREAD_ALL | typeof THREAD_UNCLASSIFIED | string;

/** 끌어다 놓기 과녁 id — 근거 카드 id 와 섞이지 않게 접두사를 붙인다. */
export const THREAD_DROP_PREFIX = 'thread-drop:';
/** 끌리는 근거 카드 id 접두사. */
export const EVIDENCE_DRAG_PREFIX = 'evidence-drag:';

/** 과녁 id → 주제 id(또는 미분류). 과녁이 아니면 null. */
export function parseThreadDropId(id: string): string | null {
  return id.startsWith(THREAD_DROP_PREFIX) ? id.slice(THREAD_DROP_PREFIX.length) : null;
}

/** 끌린 카드 id → 근거 id. 근거 카드가 아니면 null. */
export function parseEvidenceDragId(id: string): string | null {
  return id.startsWith(EVIDENCE_DRAG_PREFIX) ? id.slice(EVIDENCE_DRAG_PREFIX.length) : null;
}

/**
 * 근거 카드를 끌 수 있게 감싸는 껍데기.
 *
 * ★활성 제약(거리 5px)은 부모 `DndContext` 의 센서가 정한다 — 그게 없으면 카드 안의 단추를
 * 누를 때마다 드래그가 시작돼 수정·삭제를 못 누른다(할 일 칸반에서 쓰는 것과 같은 설정).
 */
export function DraggableEvidence({
  evidenceId,
  disabled,
  children,
}: {
  readonly evidenceId: string;
  readonly disabled?: boolean;
  readonly children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${EVIDENCE_DRAG_PREFIX}${evidenceId}`,
    disabled: disabled === true,
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={isDragging ? 'opacity-40' : undefined}
    >
      {children}
    </div>
  );
}

/** 칩 하나 — 과녁이면서 필터 단추. */
function ThreadChip({
  id,
  label,
  count,
  active,
  droppable,
  onSelect,
  title,
}: {
  readonly id: string;
  readonly label: string;
  readonly count?: number;
  readonly active: boolean;
  readonly droppable: boolean;
  readonly onSelect: () => void;
  readonly title?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${THREAD_DROP_PREFIX}${id}`,
    disabled: !droppable,
  });
  const base =
    'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[0.7rem] font-medium ring-1 transition-colors';
  const tone = isOver
    ? 'bg-sp-accent/20 text-sp-accent ring-sp-accent'
    : active
      ? 'bg-sp-accent/15 text-sp-accent ring-sp-accent/30'
      : 'text-sp-muted ring-sp-border hover:text-sp-text';
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      {...(title !== undefined ? { title } : {})}
      className={`${base} ${tone}`}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold ${
            active ? 'bg-sp-accent/20' : 'bg-sp-surface'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

interface InquiryThreadChipsProps {
  readonly threads: readonly InquiryThread[];
  readonly active: ActiveThread;
  readonly totalCount: number;
  readonly unclassifiedCount: number;
  /** 주제별 근거 건수(threadId → 건수). */
  readonly countByThread: ReadonlyMap<string, number>;
  onSelect: (next: ActiveThread) => void;
  onNewThread: () => void;
}

/**
 * 근거 창고의 **주제 축** — 영역 탭 아래 한 줄.
 *
 * 왜 칸반 칼럼이 아니라 칩 줄인가: 창고는 이미 [학생 목록 | 근거 목록] 2열이라 주제마다 세로 칼럼을
 * 두면 근거 본문이 반토막 난다. 칩 자체를 **끌어다 놓는 과녁**으로 만들면 폭을 안 먹으면서
 * 묶기 동작은 그대로 살아난다(오너 결정 2026-09-04).
 *
 * ★주제는 **선택**이다. 축을 안 쓰면 '전체'에 머물러 지금까지와 똑같이 동작한다.
 */
export function InquiryThreadChips({
  threads,
  active,
  totalCount,
  unclassifiedCount,
  countByThread,
  onSelect,
  onNewThread,
}: InquiryThreadChipsProps) {
  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label="주제(탐구 흐름)로 나눠 보기"
    >
      <span className="text-xs text-sp-muted">주제</span>
      <ThreadChip
        id={THREAD_ALL}
        label="전체"
        count={totalCount}
        active={active === THREAD_ALL}
        droppable={false}
        onSelect={() => onSelect(THREAD_ALL)}
        title="주제와 상관없이 이 영역의 근거를 모두 봅니다."
      />
      <ThreadChip
        id={THREAD_UNCLASSIFIED}
        label="미분류"
        count={unclassifiedCount}
        active={active === THREAD_UNCLASSIFIED}
        droppable
        onSelect={() => onSelect(THREAD_UNCLASSIFIED)}
        title="아직 주제로 묶지 않은 근거입니다. 여기로 끌어다 놓으면 주제에서 빠집니다."
      />
      {threads.map((t) => (
        <ThreadChip
          key={t.id}
          id={t.id}
          label={t.status === 'closed' ? `${t.title} (닫힘)` : t.title}
          count={countByThread.get(t.id) ?? 0}
          active={active === t.id}
          droppable
          onSelect={() => onSelect(t.id)}
          title="근거를 여기로 끌어다 놓으면 이 주제로 묶입니다."
        />
      ))}
      <button
        type="button"
        onClick={onNewThread}
        className="inline-flex items-center gap-0.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[0.7rem] font-medium text-sp-accent ring-1 ring-dashed ring-sp-accent/40 transition-colors hover:bg-sp-accent/10"
      >
        <span className="material-symbols-outlined text-sm">add</span>새 주제
      </button>
    </div>
  );
}
