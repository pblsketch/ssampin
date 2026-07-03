import { useMemo, useState } from 'react';
import type { MiniApp, MiniAppIcon } from '@domain/entities/MiniApp';
import { listMiniApps } from '@usecases/miniapp/ListMiniApps';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useMiniAppStore } from '@adapters/stores/useMiniAppStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { Modal } from '@adapters/components/common/Modal';
import { IconButton } from '@adapters/components/common/IconButton';
import { MiniAppRegisterModal } from '@adapters/components/Tools/MiniApps/MiniAppRegisterModal';

/**
 * "내가 만든 앱" 섹션 — 쌤도구 화면 오른쪽의 전용 세로 열(고정 폭)에 렌더되는 미니앱 목록.
 * 하단에 묻혀 있으면 발견성이 떨어진다는 판단으로 왼쪽 도구 그리드 옆 고정 폭 레일로 옮겼다
 * (배치는 ToolsGrid가 담당, 이 컴포넌트는 자기 폭·세로 스택만 책임진다).
 *
 * 메타 원천은 settings.miniApps ('settings' 동기화 도메인에 편승). 발견성을 높이기 위해
 * 앱 개수와 무관하게 목록 맨 끝에 점선 "＋ 앱 추가" 타일을 상시 노출한다(0개일 때도 부담
 * 없이 타일 하나 + 한 줄 안내만, 비바이브코딩 교사 배려). 카드는 좁은 세로 열에 맞춰
 * 아이콘+이름(+설명 한 줄)을 가로로 나열하는 컴팩트한 행(row) 형태를 쓴다 — 정사각 타일이던
 * 예전 그리드 카드와 달리 폭이 좁고 긴 열에 맞춘 전용 레이아웃.
 */
interface MiniAppsSectionProps {
  onOpen: (app: MiniApp) => void;
}

const EMPTY_MINIAPPS: readonly MiniApp[] = [];

export function MiniAppsSection({ onOpen }: MiniAppsSectionProps) {
  const miniApps = useSettingsStore((s) => s.settings.miniApps) ?? EMPTY_MINIAPPS;
  const hiddenSection = useSettingsStore((s) => s.settings.hiddenMiniAppSection) ?? false;
  const removeApp = useMiniAppStore((s) => s.remove);
  const reorder = useMiniAppStore((s) => s.reorder);
  const toggleSectionHidden = useMiniAppStore((s) => s.toggleSectionHidden);
  const showToast = useToastStore((s) => s.show);

  const [registerOpen, setRegisterOpen] = useState(false);
  const [editApp, setEditApp] = useState<MiniApp | null>(null);
  const [infoApp, setInfoApp] = useState<MiniApp | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const sortedApps = useMemo(() => listMiniApps(miniApps), [miniApps]);

  const handleDelete = async (app: MiniApp) => {
    if (
      !window.confirm(
        `"${app.name}" 앱을 삭제할까요? 등록된 파일도 함께 삭제되며 되돌릴 수 없습니다.`,
      )
    ) {
      return;
    }
    try {
      await removeApp(app.id);
      showToast('앱을 삭제했습니다', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '삭제에 실패했습니다', 'error');
    }
  };

  const handleDrop = (targetId: string) => {
    const droppedId = draggedId;
    setDraggedId(null);
    setDragOverId(null);
    if (!droppedId || droppedId === targetId) return;

    const ids = sortedApps.map((a) => a.id);
    const dragIdx = ids.indexOf(droppedId);
    const targetIdx = ids.indexOf(targetId);
    if (dragIdx === -1 || targetIdx === -1) return;
    ids.splice(dragIdx, 1);
    ids.splice(targetIdx, 0, droppedId);

    void reorder(ids).catch((err) => {
      showToast(err instanceof Error ? err.message : '순서 변경에 실패했습니다', 'error');
    });
  };

  // 섹션 숨김 — 얇은 링크 한 줄만 남겨 언제든 다시 켤 수 있게 한다.
  // 고정 폭(xl:w-64) 클래스를 주지 않아 오른쪽 열이 접히고, flex-1인 왼쪽 그리드가 남는 폭을 차지한다.
  if (hiddenSection) {
    return (
      <div>
        <button
          type="button"
          onClick={() => void toggleSectionHidden()}
          className="inline-flex items-center gap-1.5 text-xs text-sp-muted hover:text-sp-text transition-colors whitespace-nowrap"
        >
          <span className="material-symbols-outlined text-icon-sm">visibility</span>
          내가 만든 앱 보기
        </button>
      </div>
    );
  }

  return (
    <div className="xl:w-64 xl:shrink-0">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-sp-semibold text-sp-muted uppercase tracking-wider">
            내가 만든 앱
          </h2>
          {sortedApps.length > 0 && (
            <span className="text-caption text-sp-muted/60 tabular-nums">
              {sortedApps.length}개
            </span>
          )}
        </div>
        {sortedApps.length > 0 && (
          <IconButton
            icon="visibility_off"
            label="내가 만든 앱 섹션 숨기기"
            title="이 섹션 숨기기"
            variant="ghost"
            size="sm"
            onClick={() => void toggleSectionHidden()}
          />
        )}
      </div>

      {sortedApps.length === 0 && (
        <p className="text-xs text-sp-muted mb-3">
          AI로 만든 나만의 웹앱을 등록해 쌤도구에서 바로 실행해 보세요.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {sortedApps.map((app) => (
          <MiniAppCard
            key={app.id}
            app={app}
            isDragged={draggedId === app.id}
            isDragOver={dragOverId === app.id && draggedId !== app.id}
            onOpen={() => onOpen(app)}
            onEdit={() => setEditApp(app)}
            onDelete={() => void handleDelete(app)}
            onShowInfo={() => setInfoApp(app)}
            onDragStart={(e) => {
              setDraggedId(app.id);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', app.id);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (draggedId !== app.id) setDragOverId(app.id);
            }}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(app.id);
            }}
            onDragEnd={() => {
              setDraggedId(null);
              setDragOverId(null);
            }}
            onDragLeave={() => setDragOverId((cur) => (cur === app.id ? null : cur))}
          />
        ))}
        <AddAppTile onClick={() => setRegisterOpen(true)} />
      </div>

      {registerOpen && <MiniAppRegisterModal onClose={() => setRegisterOpen(false)} />}
      {editApp && (
        <MiniAppRegisterModal key={editApp.id} editApp={editApp} onClose={() => setEditApp(null)} />
      )}
      {infoApp && <MiniAppInfoModal app={infoApp} onClose={() => setInfoApp(null)} />}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// 추가 타일 — 세로 목록 맨 끝에 항상 보이는 점선 "＋ 앱 추가" 행.
// 앱 개수와 무관하게 상시 노출해 발견성을 높인다(등록 진입점을 헤더에서 목록으로 이동).
// ──────────────────────────────────────────────────────────

function AddAppTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-sp-border px-3 py-3 text-sp-muted hover:border-sp-accent/40 hover:text-sp-text hover:bg-sp-card/40 transition-colors"
    >
      <span className="material-symbols-outlined text-icon" aria-hidden="true">
        add_circle
      </span>
      <span className="text-xs font-sp-semibold">앱 추가</span>
    </button>
  );
}

// ──────────────────────────────────────────────────────────
// 미니앱 카드 — 세로 레일에 맞춘 컴팩트 행(row). 아이콘 + 이름(+설명 한 줄)을 가로로 나열하고
// 드래그 재정렬 힌트·더보기(정보/삭제)는 평소 숨겨 뒀다가 호버·포커스 시에만 드러난다.
// ──────────────────────────────────────────────────────────

interface MiniAppCardProps {
  app: MiniApp;
  isDragged: boolean;
  isDragOver: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onShowInfo: () => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onDragLeave: () => void;
}

function MiniAppCard({
  app,
  isDragged,
  isDragOver,
  onOpen,
  onEdit,
  onDelete,
  onShowInfo,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onDragLeave,
}: MiniAppCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onDragLeave={onDragLeave}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      title={app.description ? `${app.name} — ${app.description}` : app.name}
      className={`group relative flex items-center gap-2.5 bg-sp-card rounded-xl py-2 pl-2 pr-1.5 border cursor-pointer select-none transition-all ${
        isDragged
          ? 'opacity-30'
          : isDragOver
            ? 'border-sp-accent ring-2 ring-sp-accent/30'
            : 'border-transparent hover:border-blue-500/30 hover:bg-sp-card/70'
      }`}
    >
      <MiniAppIconView icon={app.icon} appId={app.id} size="sm" />

      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-bold text-sp-text group-hover:text-sp-accent transition-colors truncate">
          {app.name}
        </h3>
        {app.description && <p className="text-[11px] text-sp-muted truncate">{app.description}</p>}
      </div>

      {/* 드래그 힌트 + 더보기 메뉴 — 마우스 호버·키보드 포커스 시에만 은은하게 */}
      <div className="flex items-center shrink-0 gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
        <span
          aria-hidden="true"
          className="material-symbols-outlined text-icon-sm text-sp-muted cursor-grab active:cursor-grabbing"
        >
          drag_indicator
        </span>

        <div className="relative">
          <button
            type="button"
            aria-label={`${app.name} 메뉴`}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-text/10 transition-colors"
          >
            <span className="material-symbols-outlined text-icon-sm">more_vert</span>
          </button>
          {menuOpen && (
            <>
              {/* 바깥 클릭으로 닫기 */}
              <div
                className="fixed inset-0 z-sp-dropdown"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                }}
              />
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-full mt-1 w-28 bg-sp-surface border border-sp-border rounded-lg shadow-sp-lg overflow-hidden z-sp-dropdown"
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onEdit();
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-sp-text hover:bg-sp-bg"
                >
                  수정
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onShowInfo();
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-sp-text hover:bg-sp-bg"
                >
                  정보
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onDelete();
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-sp-bg"
                >
                  삭제
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// 아이콘 렌더 — emoji는 항상 표시, image는 miniapp:// 프로토콜로 로드 시도 후
// 실패하면(현재 렌더러 세션에서 로드 실패 가능) 자리표시 아이콘으로 조용히 대체.
// ──────────────────────────────────────────────────────────

function MiniAppIconView({
  icon,
  appId,
  size = 'md',
}: {
  icon: MiniAppIcon;
  appId: string;
  /** 카드 밀도에 맞춘 크기 — 'sm'은 촘촘한 목록 행(row), 'md'(기본)는 정보 모달 헤더용 */
  size?: 'sm' | 'md';
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const emojiClass = size === 'sm' ? 'text-3xl' : 'text-4xl';
  const boxClass = size === 'sm' ? 'w-9 h-9' : 'w-11 h-11';

  if (icon.kind === 'emoji') {
    return (
      <div className={`${emojiClass} leading-none`} aria-hidden="true">
        {icon.value}
      </div>
    );
  }

  if (imgFailed) {
    return (
      <div
        className={`${boxClass} rounded-xl bg-sp-bg flex items-center justify-center text-sp-muted`}
        aria-hidden="true"
      >
        <span className="material-symbols-outlined text-icon-lg">widgets</span>
      </div>
    );
  }

  return (
    <img
      src={`miniapp://${appId}/${icon.fileName}`}
      alt=""
      className={`${boxClass} rounded-xl object-cover bg-sp-bg`}
      onError={() => setImgFailed(true)}
    />
  );
}

// ──────────────────────────────────────────────────────────
// 정보 모달 — 읽기 전용 (이름·설명·등록일 + 격리 안내)
// ──────────────────────────────────────────────────────────

function MiniAppInfoModal({ app, onClose }: { app: MiniApp; onClose: () => void }) {
  const createdLabel = new Date(app.createdAt).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <Modal isOpen onClose={onClose} title={`${app.name} 정보`} srOnlyTitle size="sm">
      <div className="flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-sp-border">
          <div className="flex items-center gap-3 min-w-0">
            <MiniAppIconView icon={app.icon} appId={app.id} />
            <div className="min-w-0">
              <h3 className="text-base font-bold text-sp-text truncate">{app.name}</h3>
              <p className="text-xs text-sp-muted">{createdLabel} 등록</p>
            </div>
          </div>
          <IconButton icon="close" label="닫기" variant="ghost" size="md" onClick={onClose} />
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-sp-text">{app.description || '설명이 없어요.'}</p>
          <div className="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-sp-card border border-sp-border text-xs text-sp-text leading-relaxed">
            <span className="flex-shrink-0" aria-hidden="true">
              💬
            </span>
            <div className="flex-1 min-w-0">
              이 앱은 격리된 화면에서 실행돼요. PC 파일이나 학생 정보에 접근할 수 없어요.
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-sp-border flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </Modal>
  );
}
