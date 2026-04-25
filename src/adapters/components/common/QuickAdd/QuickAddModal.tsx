import { useEffect, useRef, useState } from 'react';
import { Kbd } from '@adapters/components/common/Kbd';
import { useQuickAddStore } from '@adapters/stores/useQuickAddStore';
import type { QuickAddKind } from '@adapters/stores/useQuickAddStore';
import { QuickAddTodoForm } from './QuickAddTodoForm';
import { QuickAddEventForm } from './QuickAddEventForm';
import { QuickAddMemoForm } from './QuickAddMemoForm';
import { QuickAddNoteForm } from './QuickAddNoteForm';
import { QuickAddBookmarkForm } from './QuickAddBookmarkForm';

interface KindMeta {
  readonly label: string;
  readonly icon: string;
  readonly barClass: string;
  readonly iconClass: string;
}

const KIND_META: Record<QuickAddKind, KindMeta> = {
  todo: {
    label: '할일',
    icon: 'check_circle',
    barClass: 'bg-sp-accent',
    iconClass: 'text-sp-accent',
  },
  event: {
    label: '일정',
    icon: 'event',
    barClass: 'bg-sp-highlight',
    iconClass: 'text-sp-highlight',
  },
  memo: {
    label: '메모',
    icon: 'sticky_note_2',
    barClass: 'bg-emerald-400',
    iconClass: 'text-emerald-400',
  },
  note: {
    label: '노트 새 페이지',
    icon: 'description',
    barClass: 'bg-violet-400',
    iconClass: 'text-violet-400',
  },
  bookmark: {
    label: '즐겨찾기',
    icon: 'bookmark',
    barClass: 'bg-amber-400',
    iconClass: 'text-amber-400',
  },
};

interface QuickAddModalProps {
  /** 독립 BrowserWindow에서 띄우는 팝업 모드. 오버레이 제거 + 카드 100% 폭. */
  standalone?: boolean;
}

export function QuickAddModal({ standalone = false }: QuickAddModalProps = {}): JSX.Element | null {
  const isOpen = useQuickAddStore((s) => s.isOpen);
  const kind = useQuickAddStore((s) => s.kind);
  const swapToken = useQuickAddStore((s) => s.swapToken);
  const close = useQuickAddStore((s) => s.close);
  const cardRef = useRef<HTMLDivElement>(null);
  const [flashKey, setFlashKey] = useState(0);

  // 연속 트리거 시 카드에 짧은 ring flash
  useEffect(() => {
    if (swapToken === 0) return;
    setFlashKey((k) => k + 1);
  }, [swapToken]);

  // ESC 닫기
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, close]);

  if (!isOpen || !kind) return null;
  const meta = KIND_META[kind];

  // 카드 본체 (in-app/standalone 공용)
  const card = (
    <div
      ref={cardRef}
      key={`${kind}-${flashKey}`}
      className={
        standalone
          ? 'h-full w-full bg-sp-card border border-sp-border rounded-2xl shadow-sp-lg ring-1 ring-white/10 overflow-hidden flex flex-col'
          : 'w-[min(480px,calc(100vw-32px))] bg-sp-card border border-sp-border rounded-xl shadow-sp-lg ring-1 ring-white/5 overflow-hidden animate-scale-in motion-reduce:animate-none'
      }
      onClick={(e) => e.stopPropagation()}
    >
      {/* 헤더 — standalone 모드에서는 창 드래그 가능 */}
      <div
        className="flex items-stretch border-b border-sp-border"
        style={standalone ? { WebkitAppRegion: 'drag' } as React.CSSProperties : undefined}
      >
        <div className={`w-[3px] ${meta.barClass}`} aria-hidden="true" />
        <div className="flex-1 flex items-center gap-2.5 px-4 py-3">
          <span className={`material-symbols-outlined text-icon-md ${meta.iconClass}`}>{meta.icon}</span>
          <h2 className="text-[13px] font-sp-semibold text-sp-muted uppercase tracking-wider">
            빠른 추가 · {meta.label}
          </h2>
          <div className="ml-auto" />
          <button
            type="button"
            onClick={close}
            aria-label="닫기"
            style={standalone ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}
            className="text-sp-muted hover:text-sp-text transition-colors"
          >
            <span className="material-symbols-outlined text-icon-md">close</span>
          </button>
        </div>
      </div>

      {/* 본문: kind별 form */}
      <div className="p-5 flex-1 overflow-y-auto">
        {kind === 'todo' && <QuickAddTodoForm onClose={close} />}
        {kind === 'event' && <QuickAddEventForm onClose={close} />}
        {kind === 'memo' && <QuickAddMemoForm onClose={close} />}
        {kind === 'note' && <QuickAddNoteForm onClose={close} />}
        {kind === 'bookmark' && <QuickAddBookmarkForm onClose={close} />}
      </div>

      {/* 푸터 키 힌트 */}
      <div className="border-t border-sp-border/60 bg-sp-bg/30 px-4 py-2 flex items-center justify-between text-[11px] text-sp-muted font-sp-medium">
        <span className="flex items-center gap-1">
          <Kbd>Esc</Kbd>
          <span className="ml-1">닫기</span>
        </span>
        <span className="flex items-center gap-1">
          <Kbd combo="Ctrl+Enter" />
          <span className="ml-1">저장</span>
        </span>
      </div>
    </div>
  );

  // standalone: 오버레이 없이 카드만 (창 자체가 모달)
  if (standalone) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`빠른 추가 ${meta.label}`}
        className="h-screen w-screen bg-transparent p-0"
      >
        {card}
      </div>
    );
  }

  // 인앱 모드: 어두운 오버레이 + 클릭으로 닫기. flex로 centering해서
  // 카드의 animate-scale-in transform이 위치 계산과 충돌하지 않도록 한다.
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`빠른 추가 ${meta.label}`}
      className="fixed inset-0 bg-black/55 backdrop-blur-sm z-[110] flex items-start justify-center pt-[28vh] animate-fade-in motion-reduce:animate-none"
      onClick={close}
    >
      {card}
    </div>
  );
}
