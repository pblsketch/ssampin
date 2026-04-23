import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { ToolLayout } from './ToolLayout';
import { ResultSaveButton, PastResultsView } from './TemplateManager';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import { useBoardSessionStore } from '@adapters/stores/useBoardSessionStore';
import { LiveSessionClient } from '@infrastructure/supabase/LiveSessionClient';
import type {
  RealtimeWallLayoutMode,
  RealtimeWallPost,
} from '@domain/entities/RealtimeWall';
import {
  buildRealtimeWallColumns,
  createDefaultFreeformPosition,
  DEFAULT_REALTIME_WALL_COLUMNS,
  normalizeRealtimeWallLink,
  REALTIME_WALL_MAX_TEXT_LENGTH,
} from '@domain/rules/realtimeWallRules';
import { RealtimeWallCard } from './RealtimeWall/RealtimeWallCard';
import { RealtimeWallKanbanBoard } from './RealtimeWall/RealtimeWallKanbanBoard';
import { RealtimeWallFreeformBoard } from './RealtimeWall/RealtimeWallFreeformBoard';

interface ToolRealtimeWallProps {
  onBack: () => void;
  isFullscreen: boolean;
}

type ViewMode = 'create' | 'running' | 'results';

function copyText(text: string): void {
  void navigator.clipboard.writeText(text);
}

function openExternalLink(url: string): void {
  if (window.electronAPI?.openExternal) {
    void window.electronAPI.openExternal(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

function formatAbsoluteTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface CreateViewProps {
  readonly title: string;
  readonly layoutMode: RealtimeWallLayoutMode;
  readonly columnInputs: string[];
  readonly onTitleChange: (value: string) => void;
  readonly onLayoutModeChange: (value: RealtimeWallLayoutMode) => void;
  readonly onColumnChange: (index: number, value: string) => void;
  readonly onAddColumn: () => void;
  readonly onRemoveColumn: (index: number) => void;
  readonly onStart: () => void;
  readonly onShowPastResults: () => void;
}

function CreateView({
  title,
  layoutMode,
  columnInputs,
  onTitleChange,
  onLayoutModeChange,
  onColumnChange,
  onAddColumn,
  onRemoveColumn,
  onStart,
  onShowPastResults,
}: CreateViewProps) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      {/* 단계 1: 레이아웃 선택 */}
      <section className="rounded-xl border border-sp-border bg-sp-card p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sp-accent text-xs font-bold text-white">1</span>
            <h2 className="text-base font-bold text-sp-text">보드 형태 선택</h2>
          </div>
          <button
            type="button"
            onClick={onShowPastResults}
            className="flex items-center gap-1.5 rounded-lg border border-sp-border bg-sp-surface px-3 py-1.5 text-xs text-sp-muted transition hover:border-sp-accent hover:text-sp-accent"
          >
            <span className="material-symbols-outlined text-[14px]">history</span>
            지난 결과
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onLayoutModeChange('kanban')}
            className={`relative rounded-xl border p-4 text-left transition ${
              layoutMode === 'kanban'
                ? 'border-sp-accent bg-sp-accent/10 ring-1 ring-sp-accent/30'
                : 'border-sp-border bg-sp-surface hover:border-sp-accent/40'
            }`}
          >
            {layoutMode === 'kanban' && (
              <span className="absolute right-3 top-3 flex h-4 w-4 items-center justify-center rounded-full bg-sp-accent">
                <span className="material-symbols-outlined text-[11px] text-white">check</span>
              </span>
            )}
            <div className="mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-sp-accent">view_kanban</span>
              <p className="font-bold text-sp-text">칸반형</p>
            </div>
            <p className="text-sm leading-relaxed text-sp-muted">
              주제별 컬럼에 카드를 나눠 토론 흐름을 정리합니다.
            </p>
          </button>
          <button
            type="button"
            onClick={() => onLayoutModeChange('freeform')}
            className={`relative rounded-xl border p-4 text-left transition ${
              layoutMode === 'freeform'
                ? 'border-sp-accent bg-sp-accent/10 ring-1 ring-sp-accent/30'
                : 'border-sp-border bg-sp-surface hover:border-sp-accent/40'
            }`}
          >
            {layoutMode === 'freeform' && (
              <span className="absolute right-3 top-3 flex h-4 w-4 items-center justify-center rounded-full bg-sp-accent">
                <span className="material-symbols-outlined text-[11px] text-white">check</span>
              </span>
            )}
            <div className="mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-sp-accent">dashboard</span>
              <p className="font-bold text-sp-text">자유 배치형</p>
            </div>
            <p className="text-sm leading-relaxed text-sp-muted">
              보드 위에서 카드를 옮기고 크기를 바꾸며 자유롭게 정리합니다.
            </p>
          </button>
        </div>
      </section>

      {/* 단계 2: 제목 입력 */}
      <section className="rounded-xl border border-sp-border bg-sp-card p-5">
        <div className="mb-3 flex items-center gap-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sp-accent text-xs font-bold text-white">2</span>
          <h2 className="text-base font-bold text-sp-text">담벼락 제목</h2>
        </div>
        <input
          type="text"
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          maxLength={50}
          placeholder="예: 2학년 3반 주장 모으기"
          className="w-full rounded-lg border border-sp-border bg-sp-bg px-4 py-3 text-sp-text outline-none transition focus:border-sp-accent"
        />
        <p className="mt-2 text-xs text-sp-muted">비워두면 '실시간 담벼락'으로 표시됩니다.</p>
      </section>

      {/* 단계 3: 컬럼 설정 (칸반만) */}
      {layoutMode === 'kanban' && (
        <section className="rounded-xl border border-sp-border bg-sp-card p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sp-accent text-xs font-bold text-white">3</span>
              <h2 className="text-base font-bold text-sp-text">컬럼 이름</h2>
            </div>
            <button
              type="button"
              onClick={onAddColumn}
              disabled={columnInputs.length >= 6}
              className="flex items-center gap-1 rounded-lg border border-sp-border bg-sp-surface px-3 py-1.5 text-xs text-sp-muted transition hover:border-sp-accent hover:text-sp-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[14px]">add</span>
              컬럼 추가
            </button>
          </div>
          <div className="space-y-2">
            {columnInputs.map((value, index) => (
              <div key={`column-input-${index}`} className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-center text-xs font-bold text-sp-muted">
                  {index + 1}
                </span>
                <input
                  type="text"
                  value={value}
                  onChange={(event) => onColumnChange(index, event.target.value)}
                  placeholder={`컬럼 ${index + 1}`}
                  maxLength={20}
                  className="flex-1 rounded-lg border border-sp-border bg-sp-bg px-3 py-2 text-sm text-sp-text outline-none transition focus:border-sp-accent"
                />
                <button
                  type="button"
                  onClick={() => onRemoveColumn(index)}
                  disabled={columnInputs.length <= 2}
                  className="rounded-lg p-2 text-sp-muted/60 transition hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
                  title="삭제"
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 사용 안내 + 시작 버튼 */}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="rounded-xl border border-sp-border/60 bg-sp-surface px-4 py-3 text-xs text-sp-muted">
          <p className="mb-1 font-semibold text-sp-muted">이렇게 진행돼요</p>
          <p>담벼락 열기 → 학생에게 링크 공유 → 제출된 카드 승인 → 보드에서 정리</p>
          <p className="mt-1 text-sp-muted/60">교사 PC가 인터넷에 연결되어 있어야 학생이 참여할 수 있습니다.</p>
        </div>
        <button
          type="button"
          onClick={onStart}
          className="rounded-xl bg-sp-accent px-6 py-3 text-sm font-bold text-white shadow-lg shadow-sp-accent/20 transition hover:bg-sp-accent/85"
        >
          담벼락 열기
        </button>
      </div>
    </div>
  );
}

interface LiveSharePanelProps {
  readonly title: string;
  readonly connectedStudents: number;
  readonly displayUrl: string | null;
  readonly fullUrl: string | null;
  readonly shortUrl: string | null;
  readonly shortCode: string | null;
  readonly tunnelLoading: boolean;
  readonly tunnelError: string | null;
  readonly customCodeInput: string;
  readonly customCodeError: string | null;
  readonly showQRFullscreen: boolean;
  readonly onToggleQRFullscreen: () => void;
  readonly onStop: () => void;
  readonly onRetryTunnel: () => void;
  readonly onCustomCodeChange: (value: string) => void;
  readonly onSetCustomCode: () => void;
}

function LiveSharePanel({
  title,
  connectedStudents,
  displayUrl,
  fullUrl,
  shortUrl,
  shortCode,
  tunnelLoading,
  tunnelError,
  customCodeInput,
  customCodeError,
  showQRFullscreen,
  onToggleQRFullscreen,
  onStop,
  onRetryTunnel,
  onCustomCodeChange,
  onSetCustomCode,
}: LiveSharePanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fullscreenCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !displayUrl || showQRFullscreen) return;
    void QRCode.toCanvas(canvasRef.current, displayUrl, {
      width: 170,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });
  }, [displayUrl, showQRFullscreen]);

  useEffect(() => {
    if (!fullscreenCanvasRef.current || !displayUrl || !showQRFullscreen) return;
    void QRCode.toCanvas(fullscreenCanvasRef.current, displayUrl, {
      width: 360,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });
  }, [displayUrl, showQRFullscreen]);

  if (showQRFullscreen && displayUrl) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white text-center"
        onClick={onToggleQRFullscreen}
      >
        <canvas ref={fullscreenCanvasRef} />
        <p className="mt-6 text-2xl font-bold text-gray-900">{title}</p>
        <p className="mt-2 font-mono text-lg text-gray-600">{displayUrl}</p>
        <p className="mt-4 text-sm text-gray-400">화면을 클릭하면 돌아갑니다.</p>
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-sp-border bg-sp-card p-4">
      {/* 헤더: 접속 현황 + 버튼 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.4)]" />
          <h2 className="text-sm font-bold text-sp-text">학생 참여 중</h2>
          <span className="rounded-full bg-sp-surface px-2 py-0.5 text-xs tabular-nums text-sp-muted">
            {connectedStudents}명 접속
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleQRFullscreen}
            disabled={!displayUrl}
            className="flex items-center gap-1.5 rounded-lg border border-sp-border bg-sp-surface px-3 py-1.5 text-xs text-sp-muted transition hover:border-sp-accent hover:text-sp-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-[14px]">qr_code</span>
            QR 크게 보기
          </button>
          <button
            type="button"
            onClick={onStop}
            className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/15"
          >
            <span className="material-symbols-outlined text-[14px]">stop_circle</span>
            참여 종료
          </button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[160px_minmax(0,1fr)]">
        {/* QR 코드 */}
        <div className="flex items-center justify-center rounded-lg bg-white p-2">
          {displayUrl ? (
            <canvas ref={canvasRef} />
          ) : tunnelLoading ? (
            <div className="py-4 text-xs text-gray-500">QR 준비 중...</div>
          ) : (
            <div className="px-3 py-4 text-center text-xs text-gray-500">주소 생성 실패</div>
          )}
        </div>

        {/* 주소 정보 */}
        <div className="space-y-2.5">
          {tunnelLoading && (
            <div className="flex items-center gap-2 rounded-lg border border-sp-border bg-sp-surface px-3 py-2.5 text-xs text-sp-muted">
              <span className="material-symbols-outlined animate-spin text-[14px] text-blue-400">progress_activity</span>
              외부 접속 주소를 만드는 중입니다. 잠시만 기다려주세요.
            </div>
          )}

          {/* primary 주소 — 크게 강조 */}
          {displayUrl && (
            <div className="rounded-lg border border-sp-accent/30 bg-sp-accent/5 px-3 py-2.5">
              <p className="mb-1 text-[11px] font-medium text-sp-accent/70">학생에게 공유할 주소</p>
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate font-mono text-sm font-bold text-sp-accent">
                  {displayUrl}
                </p>
                <button
                  type="button"
                  onClick={() => copyText(displayUrl)}
                  className="shrink-0 rounded-md border border-sp-accent/30 bg-sp-accent/10 px-2.5 py-1 text-xs font-medium text-sp-accent transition hover:bg-sp-accent/20"
                >
                  복사
                </button>
              </div>
            </div>
          )}

          {/* 전체 주소 — 보조 */}
          {fullUrl && fullUrl !== shortUrl && (
            <div className="rounded-lg border border-sp-border bg-sp-surface px-3 py-2">
              <p className="mb-0.5 text-[10px] text-sp-muted/70">원본 주소</p>
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate font-mono text-xs text-sp-muted">
                  {fullUrl}
                </p>
                <button
                  type="button"
                  onClick={() => copyText(fullUrl)}
                  className="shrink-0 rounded-md border border-sp-border px-2 py-1 text-[10px] text-sp-muted transition hover:border-sp-accent hover:text-sp-accent"
                >
                  복사
                </button>
              </div>
            </div>
          )}

          {/* 짧은 주소 커스텀 */}
          {shortUrl && (
            <div className="rounded-lg border border-sp-border bg-sp-surface px-3 py-2.5">
              <div className="mb-2 flex items-center gap-2">
                <p className="text-[11px] text-sp-muted">짧은 코드 변경</p>
                {shortCode && (
                  <span className="rounded-full border border-sp-accent/20 bg-sp-accent/10 px-2 py-0.5 text-[10px] font-bold text-sp-accent">
                    현재: {shortCode}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={customCodeInput}
                  onChange={(event) => onCustomCodeChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') onSetCustomCode();
                  }}
                  placeholder="예: 2반-토론"
                  maxLength={30}
                  className="min-w-0 flex-1 rounded-lg border border-sp-border bg-sp-bg px-3 py-1.5 text-xs text-sp-text outline-none transition focus:border-sp-accent"
                />
                <button
                  type="button"
                  onClick={onSetCustomCode}
                  disabled={!customCodeInput.trim()}
                  className="shrink-0 rounded-lg border border-sp-accent/40 bg-sp-accent/10 px-3 py-1.5 text-xs font-medium text-sp-accent transition hover:bg-sp-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  변경
                </button>
              </div>
              {customCodeError && (
                <p className="mt-1.5 text-[11px] text-red-400">{customCodeError}</p>
              )}
            </div>
          )}

          {tunnelError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-300">
              <p>{tunnelError}</p>
              <button
                type="button"
                onClick={onRetryTunnel}
                className="mt-1.5 rounded-md border border-red-400/40 px-2.5 py-1 text-[11px] font-medium text-red-200 transition hover:bg-red-500/10"
              >
                다시 시도
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

interface QueuePanelProps {
  readonly pendingPosts: readonly RealtimeWallPost[];
  readonly hiddenPosts: readonly RealtimeWallPost[];
  readonly onApprove: (postId: string) => void;
  readonly onHide: (postId: string) => void;
  readonly onRestore: (postId: string) => void;
  readonly onOpenLink: (url: string) => void;
}

function QueuePanel({
  pendingPosts,
  hiddenPosts,
  onApprove,
  onHide,
  onRestore,
  onOpenLink,
}: QueuePanelProps) {
  return (
    <aside className="flex h-full min-h-[560px] flex-col gap-3 rounded-xl border border-sp-border bg-sp-card p-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <h3 className="text-sm font-bold text-sp-text">대기열</h3>
        <div className="flex items-center gap-1.5">
          {pendingPosts.length > 0 && (
            <span className="rounded-full bg-sp-accent/15 px-2 py-0.5 text-[11px] font-bold text-sp-accent">
              {pendingPosts.length}건 대기
            </span>
          )}
          {hiddenPosts.length > 0 && (
            <span className="rounded-full bg-sp-surface px-2 py-0.5 text-[11px] text-sp-muted">
              숨김 {hiddenPosts.length}
            </span>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto pr-0.5">
        {/* 승인 대기 */}
        <section>
          <div className="mb-2 flex items-center gap-1.5 px-1">
            <span className="material-symbols-outlined text-[14px] text-sp-accent">inbox</span>
            <p className="text-xs font-semibold text-sp-text">승인 대기</p>
          </div>
          <div className="space-y-2.5">
            {pendingPosts.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-sp-border/40 px-4 py-5 text-center">
                <span className="material-symbols-outlined text-[22px] text-sp-muted/30">hourglass_empty</span>
                <p className="text-xs text-sp-muted/60">아직 제출된 카드가 없어요</p>
              </div>
            ) : (
              pendingPosts.map((post) => (
                <div
                  key={post.id}
                  className="rounded-lg border border-sp-accent/15 bg-sp-accent/5 p-2.5"
                >
                  <RealtimeWallCard post={post} compact onOpenLink={onOpenLink} />
                  <div className="mt-2 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => onApprove(post.id)}
                      className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-sp-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sp-accent/85"
                    >
                      <span className="material-symbols-outlined text-[13px]">check</span>
                      보드에 올리기
                    </button>
                    <button
                      type="button"
                      onClick={() => onHide(post.id)}
                      className="rounded-lg border border-sp-border px-2.5 py-1.5 text-xs text-sp-muted transition hover:border-red-400/50 hover:text-red-400"
                      title="숨기기"
                    >
                      <span className="material-symbols-outlined text-[13px]">visibility_off</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* 숨김 카드 */}
        {hiddenPosts.length > 0 && (
          <section>
            <div className="mb-2 flex items-center gap-1.5 px-1">
              <span className="material-symbols-outlined text-[14px] text-sp-muted/60">visibility_off</span>
              <p className="text-xs font-semibold text-sp-muted">숨김 카드</p>
            </div>
            <div className="space-y-2">
              {hiddenPosts.map((post) => (
                <div key={post.id} className="opacity-60">
                  <RealtimeWallCard post={post} compact onOpenLink={onOpenLink} />
                  <button
                    type="button"
                    onClick={() => onRestore(post.id)}
                    className="mt-1.5 w-full rounded-lg border border-sp-border px-3 py-1.5 text-xs text-sp-muted transition hover:border-sp-accent/40 hover:text-sp-accent"
                  >
                    다시 표시
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}

interface ResultViewProps {
  readonly title: string;
  readonly layoutMode: RealtimeWallLayoutMode;
  readonly columns: ReturnType<typeof buildRealtimeWallColumns>;
  readonly posts: readonly RealtimeWallPost[];
  readonly onNewBoard: () => void;
}

function ResultView({
  title,
  layoutMode,
  columns,
  posts,
  onNewBoard,
}: ResultViewProps) {
  const approvedCount = posts.filter((post) => post.status === 'approved').length;
  const pendingCount = posts.filter((post) => post.status === 'pending').length;
  const hiddenCount = posts.filter((post) => post.status === 'hidden').length;

  const resultData = useMemo(
    () => ({
      type: 'realtime-wall' as const,
      title,
      layoutMode,
      columns,
      posts,
      totalParticipants: posts.length,
    }),
    [columns, layoutMode, posts, title],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <section className="rounded-xl border border-sp-border bg-sp-card px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h2 className="text-lg font-bold text-sp-text">{title}</h2>
            <p className="mt-0.5 text-xs text-sp-muted">
              {layoutMode === 'kanban' ? '칸반형' : '자유 배치형'} · 수업 결과 복기
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-400">
              승인 {approvedCount}
            </span>
            {pendingCount > 0 && (
              <span className="rounded-full bg-sp-surface px-2.5 py-1 text-xs text-sp-muted">
                대기 {pendingCount}
              </span>
            )}
            {hiddenCount > 0 && (
              <span className="rounded-full bg-sp-surface px-2.5 py-1 text-xs text-sp-muted">
                숨김 {hiddenCount}
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="min-h-0 flex-1">
        {layoutMode === 'kanban' ? (
          <RealtimeWallKanbanBoard
            columns={columns}
            posts={posts}
            readOnly
            onOpenLink={openExternalLink}
          />
        ) : (
          <RealtimeWallFreeformBoard
            posts={posts}
            readOnly
            onOpenLink={openExternalLink}
          />
        )}
      </section>

      <div className="flex flex-wrap items-center justify-end gap-2.5">
        <button
          type="button"
          onClick={onNewBoard}
          className="rounded-lg border border-sp-border px-4 py-2.5 text-sm text-sp-muted transition hover:border-sp-accent hover:text-sp-accent"
        >
          새 담벼락 만들기
        </button>
        <ResultSaveButton
          toolType="realtime-wall"
          defaultName={title}
          resultData={resultData}
        />
      </div>
    </div>
  );
}

export function ToolRealtimeWall({ onBack, isFullscreen }: ToolRealtimeWallProps) {
  const { track } = useAnalytics();
  const [viewMode, setViewMode] = useState<ViewMode>('create');
  const [showPastResults, setShowPastResults] = useState(false);
  const [title, setTitle] = useState('');
  const [layoutMode, setLayoutMode] = useState<RealtimeWallLayoutMode>('kanban');
  const [columnInputs, setColumnInputs] = useState<string[]>([...DEFAULT_REALTIME_WALL_COLUMNS]);
  const [posts, setPosts] = useState<RealtimeWallPost[]>([]);

  const [isLiveMode, setIsLiveMode] = useState(false);
  const [connectedStudents, setConnectedStudents] = useState(0);
  const [showQRFullscreen, setShowQRFullscreen] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [tunnelLoading, setTunnelLoading] = useState(false);
  const [tunnelError, setTunnelError] = useState<string | null>(null);
  const [shortUrl, setShortUrl] = useState<string | null>(null);
  const [shortCode, setShortCode] = useState<string | null>(null);
  const [customCodeInput, setCustomCodeInput] = useState('');
  const [customCodeError, setCustomCodeError] = useState<string | null>(null);

  const liveSessionClientRef = useRef(new LiveSessionClient());

  const normalizedTitle = title.trim() || '실시간 담벼락';
  const columns = useMemo(() => buildRealtimeWallColumns(columnInputs), [columnInputs]);

  const pendingPosts = useMemo(
    () =>
      posts
        .filter((post) => post.status === 'pending')
        .sort((a, b) => b.submittedAt - a.submittedAt),
    [posts],
  );
  const hiddenPosts = useMemo(
    () =>
      posts
        .filter((post) => post.status === 'hidden')
        .sort((a, b) => b.submittedAt - a.submittedAt),
    [posts],
  );

  useEffect(() => {
    track('tool_use', { tool: 'realtime-wall' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectTunnel = useCallback(async () => {
    if (!window.electronAPI) return;

    setTunnelLoading(true);
    setTunnelError(null);

    try {
      const available = await window.electronAPI.realtimeWallTunnelAvailable();
      if (!available) {
        await window.electronAPI.realtimeWallTunnelInstall();
      }

      const result = await window.electronAPI.realtimeWallTunnelStart();
      setTunnelUrl(result.tunnelUrl);
      setShortUrl(null);
      setShortCode(null);

      const liveSession = await liveSessionClientRef.current.registerSession(result.tunnelUrl);
      if (liveSession) {
        setShortUrl(liveSession.shortUrl);
        setShortCode(liveSession.code);
      }
    } catch {
      setTunnelError('외부 접속 주소를 만들지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해주세요.');
    } finally {
      setTunnelLoading(false);
    }
  }, []);

  const handleStartLive = useCallback(async () => {
    if (!window.electronAPI?.startRealtimeWall) {
      setLiveError('실시간 담벼락은 데스크톱 앱에서만 열 수 있습니다.');
      return;
    }

    if (useBoardSessionStore.getState().active !== null) {
      setLiveError('협업 보드가 실행 중입니다. 먼저 보드를 종료해주세요.');
      return;
    }

    try {
      setLiveError(null);
      await window.electronAPI.startRealtimeWall({
        title: normalizedTitle,
        maxTextLength: REALTIME_WALL_MAX_TEXT_LENGTH,
      });

      setIsLiveMode(true);
      setConnectedStudents(0);
      await connectTunnel();
    } catch {
      setLiveError('실시간 담벼락 서버를 시작할 수 없습니다.');
    }
  }, [connectTunnel, normalizedTitle]);

  const handleStopLive = useCallback(async () => {
    if (window.electronAPI?.stopRealtimeWall) {
      await window.electronAPI.stopRealtimeWall();
    }
    setIsLiveMode(false);
    setConnectedStudents(0);
    setShowQRFullscreen(false);
    setLiveError(null);
    setTunnelUrl(null);
    setTunnelLoading(false);
    setTunnelError(null);
    setShortUrl(null);
    setShortCode(null);
    setCustomCodeInput('');
    setCustomCodeError(null);
  }, []);

  const handleSetCustomCode = useCallback(async () => {
    if (!tunnelUrl || !customCodeInput.trim()) return;
    setCustomCodeError(null);
    try {
      const liveSession = await liveSessionClientRef.current.setCustomCode(
        tunnelUrl,
        customCodeInput.trim(),
      );
      setShortUrl(liveSession.shortUrl);
      setShortCode(liveSession.code);
      setCustomCodeInput('');
    } catch (error) {
      setCustomCodeError(error instanceof Error ? error.message : '짧은 주소를 바꾸지 못했습니다.');
    }
  }, [customCodeInput, tunnelUrl]);

  const handleStartBoard = useCallback(() => {
    setPosts([]);
    setConnectedStudents(0);
    setLiveError(null);
    setTunnelUrl(null);
    setTunnelError(null);
    setShortUrl(null);
    setShortCode(null);
    setCustomCodeInput('');
    setCustomCodeError(null);
    setViewMode('running');
    setShowPastResults(false);
  }, []);

  const handleFinish = useCallback(async () => {
    if (isLiveMode) {
      await handleStopLive();
    }
    setViewMode('results');
  }, [handleStopLive, isLiveMode]);

  const handleNewBoard = useCallback(() => {
    setViewMode('create');
    setTitle('');
    setLayoutMode('kanban');
    setColumnInputs([...DEFAULT_REALTIME_WALL_COLUMNS]);
    setPosts([]);
    setShowPastResults(false);
  }, []);

  const handleApprovePost = useCallback((postId: string) => {
    setPosts((prev) => {
      const targetPost = prev.find((post) => post.id === postId);
      const fallbackColumnId = columns[0]?.id ?? 'column-1';
      const columnId = targetPost && columns.some((column) => column.id === targetPost.kanban.columnId)
        ? targetPost.kanban.columnId
        : fallbackColumnId;
      const nextOrder = prev.filter(
        (post) =>
          post.id !== postId &&
          post.status === 'approved' &&
          post.kanban.columnId === columnId,
      ).length;
      const nextZIndex = prev.reduce((maxZ, post) => Math.max(maxZ, post.freeform.zIndex), 0) + 1;

      return prev.map((post) => {
        if (post.id !== postId) return post;
        return {
          ...post,
          status: 'approved',
          kanban: {
            columnId,
            order: nextOrder,
          },
          freeform: {
            ...post.freeform,
            zIndex: nextZIndex,
          },
        };
      });
    });
  }, [columns]);

  const handleHidePost = useCallback((postId: string) => {
    setPosts((prev) =>
      prev.map((post) =>
        post.id === postId
          ? { ...post, status: 'hidden' }
          : post,
      ),
    );
  }, []);

  const handleRestorePost = useCallback((postId: string) => {
    setPosts((prev) => {
      const targetPost = prev.find((post) => post.id === postId);
      const fallbackColumnId = columns[0]?.id ?? 'column-1';
      const columnId = targetPost && columns.some((column) => column.id === targetPost.kanban.columnId)
        ? targetPost.kanban.columnId
        : fallbackColumnId;
      const nextOrder = prev.filter(
        (post) =>
          post.id !== postId &&
          post.status === 'approved' &&
          post.kanban.columnId === columnId,
      ).length;
      const nextZIndex = prev.reduce((maxZ, post) => Math.max(maxZ, post.freeform.zIndex), 0) + 1;

      return prev.map((post) => {
        if (post.id !== postId) return post;
        return {
          ...post,
          status: 'approved',
          kanban: {
            columnId,
            order: nextOrder,
          },
          freeform: {
            ...post.freeform,
            zIndex: nextZIndex,
          },
        };
      });
    });
  }, [columns]);

  const handleTogglePin = useCallback((postId: string) => {
    setPosts((prev) => {
      const nextZIndex = prev.reduce((maxZ, post) => Math.max(maxZ, post.freeform.zIndex), 0) + 1;
      return prev.map((post) => {
        if (post.id !== postId) return post;
        return {
          ...post,
          pinned: !post.pinned,
          freeform: {
            ...post.freeform,
            zIndex: nextZIndex,
          },
        };
      });
    });
  }, []);

  const handleChangeColumnInput = useCallback((index: number, value: string) => {
    setColumnInputs((prev) => prev.map((entry, currentIndex) => (
      currentIndex === index ? value : entry
    )));
  }, []);

  const handleAddColumn = useCallback(() => {
    setColumnInputs((prev) => (
      prev.length >= 6 ? prev : [...prev, `컬럼 ${prev.length + 1}`]
    ));
  }, []);

  const handleRemoveColumn = useCallback((index: number) => {
    setColumnInputs((prev) => (
      prev.length <= 2 ? prev : prev.filter((_, currentIndex) => currentIndex !== index)
    ));
  }, []);

  useEffect(() => {
    if (!isLiveMode || !window.electronAPI) return;

    const unsubscribeSubmitted = window.electronAPI.onRealtimeWallStudentSubmitted((data) => {
      setPosts((prev) => {
        const nextIndex = prev.length;
        const initialColumnId = columns[0]?.id ?? 'column-1';
        const normalizedLink = data.post.linkUrl
          ? normalizeRealtimeWallLink(data.post.linkUrl)
          : undefined;

        const nextPost: RealtimeWallPost = {
          id: data.post.id,
          nickname: data.post.nickname,
          text: data.post.text,
          ...(normalizedLink ? { linkUrl: normalizedLink } : {}),
          status: 'pending',
          pinned: false,
          submittedAt: data.post.submittedAt,
          kanban: {
            columnId: initialColumnId,
            order: prev.filter(
              (post) => post.status === 'approved' && post.kanban.columnId === initialColumnId,
            ).length,
          },
          freeform: createDefaultFreeformPosition(nextIndex),
        };

        return [nextPost, ...prev];
      });
    });

    const unsubscribeCount = window.electronAPI.onRealtimeWallConnectionCount((data) => {
      setConnectedStudents(data.count);
    });

    return () => {
      unsubscribeSubmitted();
      unsubscribeCount();
    };
  }, [columns, isLiveMode]);

  useEffect(() => {
    return () => {
      if (window.electronAPI?.stopRealtimeWall) {
        void window.electronAPI.stopRealtimeWall();
      }
    };
  }, []);

  const boardView = (
    layoutMode === 'kanban' ? (
      <RealtimeWallKanbanBoard
        columns={columns}
        posts={posts}
        onChangePosts={setPosts}
        onTogglePin={handleTogglePin}
        onHidePost={handleHidePost}
        onOpenLink={openExternalLink}
      />
    ) : (
      <RealtimeWallFreeformBoard
        posts={posts}
        onChangePosts={setPosts}
        onTogglePin={handleTogglePin}
        onHidePost={handleHidePost}
        onOpenLink={openExternalLink}
      />
    )
  );

  return (
    <ToolLayout title="실시간 담벼락" emoji="🗂️" onBack={onBack} isFullscreen={isFullscreen}>
      {showPastResults ? (
        <PastResultsView toolType="realtime-wall" onClose={() => setShowPastResults(false)} />
      ) : null}

      {!showPastResults && viewMode === 'create' && (
        <CreateView
          title={title}
          layoutMode={layoutMode}
          columnInputs={columnInputs}
          onTitleChange={setTitle}
          onLayoutModeChange={setLayoutMode}
          onColumnChange={handleChangeColumnInput}
          onAddColumn={handleAddColumn}
          onRemoveColumn={handleRemoveColumn}
          onStart={handleStartBoard}
          onShowPastResults={() => setShowPastResults(true)}
        />
      )}

      {!showPastResults && viewMode === 'running' && (
        <div className="flex h-full min-h-0 flex-col gap-4">
          {isLiveMode ? (
            <LiveSharePanel
              title={normalizedTitle}
              connectedStudents={connectedStudents}
              displayUrl={shortUrl ?? tunnelUrl}
              fullUrl={tunnelUrl}
              shortUrl={shortUrl}
              shortCode={shortCode}
              tunnelLoading={tunnelLoading}
              tunnelError={tunnelError}
              customCodeInput={customCodeInput}
              customCodeError={customCodeError}
              showQRFullscreen={showQRFullscreen}
              onToggleQRFullscreen={() => setShowQRFullscreen((prev) => !prev)}
              onStop={() => {
                void handleStopLive();
              }}
              onRetryTunnel={() => {
                void connectTunnel();
              }}
              onCustomCodeChange={setCustomCodeInput}
              onSetCustomCode={() => {
                void handleSetCustomCode();
              }}
            />
          ) : (
            <section className="rounded-xl border border-sp-border bg-sp-card px-5 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-sp-accent">wifi</span>
                  <div>
                    <h2 className="text-sm font-bold text-sp-text">학생 참여 준비 완료</h2>
                    <p className="mt-0.5 text-xs text-sp-muted">
                      참여 시작 버튼을 누르면 외부 접속 주소가 만들어집니다.
                    </p>
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setViewMode('create')}
                    className="rounded-lg border border-sp-border px-3 py-2 text-xs text-sp-muted transition hover:border-sp-accent hover:text-sp-accent"
                  >
                    설정 수정
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleStartLive();
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-sp-accent px-4 py-2 text-sm font-bold text-white transition hover:bg-sp-accent/85"
                  >
                    <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                    학생 참여 시작
                  </button>
                </div>
              </div>
              {liveError && (
                <p className="mt-2.5 text-xs text-red-400">{liveError}</p>
              )}
            </section>
          )}

          <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[300px_minmax(0,1fr)]">
            <QueuePanel
              pendingPosts={pendingPosts}
              hiddenPosts={hiddenPosts}
              onApprove={handleApprovePost}
              onHide={handleHidePost}
              onRestore={handleRestorePost}
              onOpenLink={openExternalLink}
            />

            <section className="flex min-h-0 flex-col rounded-xl border border-sp-border bg-sp-card p-3">
              <div className="mb-3 flex flex-wrap items-center gap-2.5 px-1">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-bold text-sp-text">{normalizedTitle}</h2>
                  <p className="mt-0.5 text-xs text-sp-muted">
                    <span className="text-emerald-400">{posts.filter((post) => post.status === 'approved').length}장</span> 보드에 있음
                    {posts[0] && (
                      <span className="ml-2">· 마지막 제출 {formatAbsoluteTime(posts[0].submittedAt)}</span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void handleFinish();
                  }}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-sp-accent/40 bg-sp-accent/10 px-3 py-1.5 text-xs font-semibold text-sp-accent transition hover:bg-sp-accent/20"
                >
                  <span className="material-symbols-outlined text-[14px]">flag</span>
                  수업 마무리
                </button>
              </div>
              <div className="min-h-0 flex-1">{boardView}</div>
            </section>
          </div>
        </div>
      )}

      {!showPastResults && viewMode === 'results' && (
        <ResultView
          title={normalizedTitle}
          layoutMode={layoutMode}
          columns={columns}
          posts={posts}
          onNewBoard={handleNewBoard}
        />
      )}
    </ToolLayout>
  );
}
