import { useCallback, useMemo, useState } from 'react';
import type { PageId } from '@adapters/components/Layout/Sidebar';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { PageHeader } from '@adapters/components/common/PageHeader';
import { Modal } from '@adapters/components/common/Modal';
import { IconButton } from '@adapters/components/common/IconButton';

interface ToolsGridProps {
  onNavigate: (page: PageId) => void;
}

interface ToolCard {
  id: PageId;
  emoji: string;
  name: string;
  description: string;
  externalUrl?: string;
  /** 'BETA' 등 상태 배지 표시 */
  badge?: string;
  /** true 이면 릴리즈 빌드에서 그리드에 노출되지 않음 (dev 모드에서만 보임) */
  hidden?: boolean;
}

const TOOLS: ToolCard[] = [
  { id: 'tool-timer', emoji: '⏱️', name: '타이머', description: '시간 제한 활동에 딱!' },
  { id: 'tool-random', emoji: '🎲', name: '랜덤 뽑기', description: '공정한 발표자 선정' },
  { id: 'tool-traffic-light', emoji: '🚦', name: '신호등', description: '활동 시작과 멈춤' },
  { id: 'tool-scoreboard', emoji: '📊', name: '점수판', description: '팀별 점수 관리' },
  { id: 'tool-roulette', emoji: '🎯', name: '룰렛', description: '돌려서 정하기' },
  { id: 'tool-dice', emoji: '🎲', name: '주사위', description: '운에 맡겨볼까?' },
  { id: 'tool-coin', emoji: '🪙', name: '동전', description: '앞? 뒤?' },
  { id: 'tool-qrcode', emoji: '🔗', name: 'QR코드', description: '링크를 순식간에 공유' },
  { id: 'tool-work-symbols', emoji: '🤫', name: '활동 기호', description: '수업 모드를 한눈에' },
  { id: 'tool-poll', emoji: '📊', name: '객관식 설문', description: '의견을 모아봐요' },
  { id: 'tool-survey', emoji: '📝', name: '주관식 설문', description: '자유롭게 의견을 들어봐요' },
  { id: 'tool-multi-survey', emoji: '📋', name: '복합 유형 설문', description: '여러 질문 유형을 한 번에 설문' },
  { id: 'tool-wordcloud', emoji: '☁️', name: '워드클라우드 브레인스토밍', description: '떠오르는 단어를 모아봐요' },
  { id: 'tool-seat-picker', emoji: '🪑', name: '자리 뽑기', description: '내 손으로 뽑는 내 자리' },
  { id: 'tool-grouping', emoji: '👥', name: '모둠 편성기', description: '조건에 맞게 모둠을 편성' },
  { id: 'tool-assignment', emoji: '📋', name: '과제수합', description: '과제를 수합하고 제출 현황을 확인합니다' },
  { id: 'tool-valueline', emoji: '📏', name: '가치수직선 토론', description: '입장을 수직선 위에 표현' },
  { id: 'tool-traffic-discussion', emoji: '🚦', name: '신호등 토론', description: '찬성·보류·반대 의사 표현' },
  { id: 'tool-chalkboard', emoji: '🖍️', name: '칠판', description: '분필로 판서하기' },
  { id: 'tool-collab-board', emoji: '🎨', name: '협업 보드', description: '학생들과 실시간 협업 작업하기', badge: 'BETA' },
  // 실시간 담벼락: 다음 릴리즈 출시 예정 — BETA로 공개.
  { id: 'tool-realtime-wall', emoji: '🗂️', name: '실시간 담벼락', description: '학생 글을 실시간으로 모아 칸반형·자유 배치형으로 정리', badge: 'BETA' },
  { id: 'tool-forms', emoji: '📄', name: '서식', description: 'HWPX · PDF · Excel 서식 모아보기' },
  { id: 'tool-supsori', emoji: '🌳', name: '숲소리', description: '교육 웹진', externalUrl: 'https://supsori.com' },
  { id: 'tool-pblsketch', emoji: '🎯', name: 'PBL스케치', description: '수업 및 평가 설계 도구', externalUrl: 'https://pblsketch.xyz' },
];

const DEFAULT_TOOL_ORDER: readonly PageId[] = TOOLS.map((t) => t.id);

function openExternal(url: string) {
  if (window.electronAPI?.openExternal) {
    void window.electronAPI.openExternal(url);
  } else {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) {
      // Fallback: link click (e.g. popup blocked in browser dev mode)
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.click();
    }
  }
}

type ViewMode = 'mine' | 'all';

function sortByOrder(tools: ToolCard[], order: readonly string[] | undefined): ToolCard[] {
  if (!order || order.length === 0) return [...tools];
  return [...tools].sort((a, b) => {
    const ai = order.indexOf(a.id);
    const bi = order.indexOf(b.id);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

export function ToolsGrid({ onNavigate }: ToolsGridProps) {
  const toolsOrder = useSettingsStore((s) => s.settings.toolsOrder);
  const hiddenTools = useSettingsStore((s) => s.settings.hiddenTools);
  const update = useSettingsStore((s) => s.update);

  const [view, setView] = useState<ViewMode>('mine');
  const [organizing, setOrganizing] = useState(false);

  // 개발 모드(npm run dev / npm run electron:dev)에서는 hidden: true 도구도 노출해 내부 QA 가능.
  // 프로덕션 빌드에서는 hidden: true 도구는 '전체 보기'에서도 제외.
  const isDev = import.meta.env.DEV;

  const visibleTools = useMemo(() => {
    const base = isDev ? TOOLS : TOOLS.filter((t) => !t.hidden);
    if (view === 'all') return base;
    const sorted = sortByOrder(base, toolsOrder);
    const hidden = new Set(hiddenTools ?? []);
    return sorted.filter((t) => !hidden.has(t.id));
  }, [view, toolsOrder, hiddenTools, isDev]);

  return (
    <div className="flex flex-col h-full -m-8">
      <PageHeader
        icon="construction"
        iconIsMaterial
        title="쌤도구"
        leftAddon={
          <div className="inline-flex rounded-lg border border-sp-border bg-sp-surface/60 p-0.5 gap-0.5">
            <button
              type="button"
              onClick={() => setView('mine')}
              className={`px-3 xl:px-4 py-1.5 rounded-md text-xs xl:text-sm transition-all duration-sp-base ease-sp-out ${
                view === 'mine'
                  ? 'bg-sp-card shadow-sp-sm font-sp-semibold text-sp-text'
                  : 'font-sp-medium text-sp-muted hover:text-sp-text'
              }`}
            >
              내 화면
            </button>
            <button
              type="button"
              onClick={() => setView('all')}
              className={`px-3 xl:px-4 py-1.5 rounded-md text-xs xl:text-sm transition-all duration-sp-base ease-sp-out ${
                view === 'all'
                  ? 'bg-sp-card shadow-sp-sm font-sp-semibold text-sp-text'
                  : 'font-sp-medium text-sp-muted hover:text-sp-text'
              }`}
            >
              전체 보기
            </button>
          </div>
        }
        rightActions={
          <button
            type="button"
            onClick={() => setOrganizing(true)}
            className="flex items-center gap-1.5 border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-surface px-3 xl:px-4 py-2 xl:py-2.5 rounded-xl text-xs xl:text-sm font-sp-semibold transition-all duration-sp-base ease-sp-out active:scale-95"
            title="도구 순서·표시 정리"
          >
            <span className="material-symbols-outlined text-icon">tune</span>
            <span className="hidden sm:inline">정리하기</span>
          </button>
        }
      />
      <div className="flex-1 min-h-0 overflow-y-auto p-8">
      <p className="text-sp-muted text-sm mb-6">
        {view === 'all'
          ? '전체 보기 — 모든 도구를 기본 순서대로 보여줍니다'
          : '내 화면 — 정리한 순서·표시 설정으로 보여줍니다'}
      </p>

      {/* Tool Cards Grid */}
      {visibleTools.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sp-border p-10 text-center">
          <p className="text-sp-muted">표시할 도구가 없습니다. 정리하기에서 도구를 다시 표시하거나 전체 보기로 전환하세요.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {visibleTools.map((tool) => (
            <button
              key={tool.id}
              onClick={() => tool.externalUrl ? openExternal(tool.externalUrl) : onNavigate(tool.id)}
              className="bg-sp-card rounded-2xl p-6 text-left border border-transparent hover:border-blue-500/30 hover:scale-[1.02] transition-all group"
            >
              <div className="text-4xl mb-3">{tool.emoji}</div>
              <h3 className="text-lg font-bold text-sp-text group-hover:text-sp-accent transition-colors flex items-center gap-1.5 flex-wrap">
                {tool.name}
                {tool.badge && (
                  <span className="text-[10px] font-extrabold tracking-wider px-2 py-[3px] rounded-md bg-gradient-to-br from-amber-400 to-amber-500 text-amber-950 shadow-sm ring-1 ring-amber-500/50">
                    {tool.badge}
                  </span>
                )}
                {tool.externalUrl && (
                  <span className="material-symbols-outlined text-icon-sm text-sp-muted">open_in_new</span>
                )}
              </h3>
              <p className="text-sm text-sp-muted mt-1">{tool.description}</p>
            </button>
          ))}
        </div>
      )}

      </div>

      {organizing && (
        <ToolsOrganizerModal
          initialOrder={sortByOrder(TOOLS, toolsOrder).map((t) => t.id)}
          initialHidden={hiddenTools ?? []}
          onClose={() => setOrganizing(false)}
          onSave={async (nextOrder, nextHidden) => {
            await update({ toolsOrder: nextOrder, hiddenTools: nextHidden });
            setOrganizing(false);
            setView('mine');
          }}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// 정리하기 모달 — SidebarTab과 동일한 HTML5 native DnD 패턴
// ──────────────────────────────────────────────────────────

interface OrganizerProps {
  initialOrder: PageId[];
  initialHidden: readonly string[];
  onClose: () => void;
  onSave: (order: PageId[], hidden: PageId[]) => Promise<void> | void;
}

function ToolsOrganizerModal({ initialOrder, initialHidden, onClose, onSave }: OrganizerProps) {
  const [order, setOrder] = useState<PageId[]>(initialOrder);
  const [hidden, setHidden] = useState<Set<string>>(new Set(initialHidden));
  const [draggedId, setDraggedId] = useState<PageId | null>(null);
  const [dragOverId, setDragOverId] = useState<PageId | null>(null);

  const toolMap = useMemo(() => {
    const map = new Map<string, ToolCard>();
    TOOLS.forEach((t) => map.set(t.id, t));
    return map;
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, id: PageId) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, id: PageId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedId !== id) setDragOverId(id);
  }, [draggedId]);

  const handleDrop = useCallback((e: React.DragEvent, targetId: PageId) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }
    setOrder((prev) => {
      const next = [...prev];
      const dragIdx = next.indexOf(draggedId);
      const targetIdx = next.indexOf(targetId);
      if (dragIdx === -1 || targetIdx === -1) return prev;
      next.splice(dragIdx, 1);
      next.splice(targetIdx, 0, draggedId);
      return next;
    });
    setDraggedId(null);
    setDragOverId(null);
  }, [draggedId]);

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDragOverId(null);
  }, []);

  const toggleHidden = (id: PageId) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resetOrder = () => setOrder([...DEFAULT_TOOL_ORDER]);
  const showAll = () => setHidden(new Set());

  const handleSave = async () => {
    await onSave(order, [...hidden] as PageId[]);
  };

  const visibleCount = order.filter((id) => !hidden.has(id)).length;

  return (
    <Modal isOpen onClose={onClose} title="쌤도구 정리하기" srOnlyTitle size="xl">
      <div className="flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-sp-border">
          <div>
            <h3 className="text-lg font-bold text-sp-text flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px]">tune</span>
              쌤도구 정리하기
            </h3>
            <p className="text-xs text-sp-muted mt-0.5">
              드래그로 순서를 바꾸고, 토글로 표시 여부를 정합니다 · 표시 {visibleCount} / {order.length}
            </p>
          </div>
          <IconButton icon="close" label="닫기" variant="ghost" size="md" onClick={onClose} />
        </div>

        {/* 액션 */}
        <div className="px-5 py-3 border-b border-sp-border flex flex-wrap gap-2">
          <button
            type="button"
            onClick={resetOrder}
            className="text-xs text-sp-muted hover:text-sp-text transition-colors px-3 py-1.5 rounded-lg border border-sp-border hover:bg-sp-text/5"
          >
            순서 초기화
          </button>
          <button
            type="button"
            onClick={showAll}
            className="text-xs text-sp-accent hover:text-sp-accent/80 transition-colors px-3 py-1.5 rounded-lg border border-sp-accent/30 hover:bg-sp-accent/10"
          >
            모두 표시
          </button>
        </div>

        {/* 리스트 */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <div className="flex flex-col gap-1">
            {order.map((id) => {
              const tool = toolMap.get(id);
              if (!tool) return null;
              const isHidden = hidden.has(id);
              const isDragged = draggedId === id;
              const isDragOver = dragOverId === id && draggedId !== id;
              return (
                <div
                  key={id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, id)}
                  onDragOver={(e) => handleDragOver(e, id)}
                  onDrop={(e) => handleDrop(e, id)}
                  onDragEnd={handleDragEnd}
                  onDragLeave={() => { if (dragOverId === id) setDragOverId(null); }}
                  className={`flex items-center justify-between py-2.5 px-3 rounded-lg transition-all select-none ${
                    isDragged ? 'opacity-30' : ''
                  } ${isDragOver ? 'ring-2 ring-sp-accent/50 bg-sp-accent/5' : 'hover:bg-sp-surface/50'}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="material-symbols-outlined text-icon text-sp-muted/40 cursor-grab active:cursor-grabbing">
                      drag_indicator
                    </span>
                    <span className="text-xl shrink-0">{tool.emoji}</span>
                    <div className="min-w-0">
                      <div className={`text-sm font-medium flex items-center gap-1.5 ${isHidden ? 'text-sp-muted/50' : 'text-sp-text'}`}>
                        <span className="truncate">{tool.name}</span>
                        {tool.badge && (
                          <span className="text-[9px] font-extrabold tracking-wider px-1.5 py-[2px] rounded bg-amber-500/20 text-amber-500">
                            {tool.badge}
                          </span>
                        )}
                      </div>
                      <p className={`text-xs mt-0.5 truncate ${isHidden ? 'text-sp-muted/30' : 'text-sp-muted'}`}>
                        {tool.description}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleHidden(id)}
                    role="switch"
                    aria-checked={!isHidden}
                    aria-label={isHidden ? '표시' : '숨김'}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                      isHidden ? 'bg-sp-border' : 'bg-sp-accent'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                        isHidden ? 'translate-x-0.5' : 'translate-x-[18px]'
                      }`}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* 푸터 */}
        <div className="px-5 py-3 border-t border-sp-border flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 text-sm rounded-lg bg-sp-accent text-sp-accent-fg hover:brightness-110 transition-colors"
          >
            저장
          </button>
        </div>
      </div>
    </Modal>
  );
}
