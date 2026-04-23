import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ToolLayout } from './ToolLayout';
import { PastResultsView } from './TemplateManager';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import { useBoardSessionStore } from '@adapters/stores/useBoardSessionStore';
import { wallBoardRepository } from '@adapters/di/container';
import { LiveSessionClient } from '@infrastructure/supabase/LiveSessionClient';
import type {
  RealtimeWallLayoutMode,
  RealtimeWallLinkPreview,
  RealtimeWallPost,
  WallBoard,
  WallBoardId,
} from '@domain/entities/RealtimeWall';
import {
  approveRealtimeWallPost,
  buildRealtimeWallColumns,
  createPendingRealtimeWallPost,
  createWallBoard,
  DEFAULT_REALTIME_WALL_COLUMNS,
  extractYoutubeVideoId,
  generateUniqueWallShortCode,
  heartRealtimeWallPost,
  hideRealtimeWallPost,
  normalizeRealtimeWallLink,
  REALTIME_WALL_MAX_TEXT_LENGTH,
  togglePinRealtimeWallPost,
} from '@domain/rules/realtimeWallRules';
import { RealtimeWallKanbanBoard } from './RealtimeWall/RealtimeWallKanbanBoard';
import { RealtimeWallFreeformBoard } from './RealtimeWall/RealtimeWallFreeformBoard';
import { RealtimeWallGridBoard } from './RealtimeWall/RealtimeWallGridBoard';
import { RealtimeWallStreamBoard } from './RealtimeWall/RealtimeWallStreamBoard';
import { RealtimeWallCreateView } from './RealtimeWall/RealtimeWallCreateView';
import { RealtimeWallLiveSharePanel } from './RealtimeWall/RealtimeWallLiveSharePanel';
import { RealtimeWallQueuePanel } from './RealtimeWall/RealtimeWallQueuePanel';
import { RealtimeWallResultView } from './RealtimeWall/RealtimeWallResultView';
import { WallBoardListView } from './RealtimeWall/WallBoardListView';
import { formatAbsoluteTime, openExternalLink } from './RealtimeWall/realtimeWallHelpers';

const AUTO_SAVE_DEBOUNCE_MS = 2000;

/** crypto.randomUUID → WallBoardId branded type 캐스팅 */
function newWallBoardId(): WallBoardId {
  const raw = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `wb-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return raw as WallBoardId;
}

interface ToolRealtimeWallProps {
  onBack: () => void;
  isFullscreen: boolean;
}

type ViewMode = 'list' | 'create' | 'running' | 'results';

export function ToolRealtimeWall({ onBack, isFullscreen }: ToolRealtimeWallProps) {
  const { track } = useAnalytics();
  // v1.13 Stage A: 기본 진입점을 '보드 목록'으로. 사용자가 이전 담벼락을
  // 재사용할 수 있도록. 새 보드는 list → create로 진입.
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [showPastResults, setShowPastResults] = useState(false);
  const [title, setTitle] = useState('');
  const [layoutMode, setLayoutMode] = useState<RealtimeWallLayoutMode>('kanban');
  const [columnInputs, setColumnInputs] = useState<string[]>([...DEFAULT_REALTIME_WALL_COLUMNS]);
  const [posts, setPosts] = useState<RealtimeWallPost[]>([]);
  // 현재 열려있는 영속 보드. list→open 또는 create→start 시점에 set.
  // 자동 저장 및 결과 저장 시 이 식별자로 repo 반영.
  const [currentBoard, setCurrentBoard] = useState<WallBoard | null>(null);

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

  // v1.13 Stage A: 자동 저장. running 모드에서 posts/title/layoutMode/columns
  // 변경을 debounce 2s로 repo에 반영. currentBoard가 없으면 no-op
  // (아직 새 보드를 start하지 않은 상태 — create 화면 등).
  useEffect(() => {
    if (!currentBoard || viewMode !== 'running') return;

    const timer = window.setTimeout(() => {
      const next: WallBoard = {
        ...currentBoard,
        title: normalizedTitle,
        layoutMode,
        columns,
        posts,
        updatedAt: Date.now(),
      };
      // 저장 실패는 조용히 무시 — 다음 주기에 재시도.
      // 토스트는 수동 "저장/종료" 시에만 노출.
      void wallBoardRepository.save(next).then(() => {
        setCurrentBoard(next);
      }).catch(() => {});
    }, AUTO_SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
    // currentBoard를 dep에 넣으면 save → setCurrentBoard → 재-schedule 무한
    // 루프가 되므로 의도적으로 제외 (currentBoard는 최신 저장본을 보관할 뿐
    // dependency로서는 stable하게 다뤄야 함).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, normalizedTitle, layoutMode, columns, viewMode]);

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

  const handleStartBoard = useCallback(async () => {
    // create → running 진입 시 새 WallBoard 생성·영속화. 이미 currentBoard가
    // 있으면(list→open 후 설정 수정 경로) 새로 만들지 않고 재사용.
    let board = currentBoard;
    if (!board) {
      const existingMetas = await wallBoardRepository.listAllMeta();
      const existingCodes = new Set(
        existingMetas.map((m) => m.shortCode).filter((c): c is string => Boolean(c)),
      );
      board = createWallBoard({
        id: newWallBoardId(),
        title: normalizedTitle,
        layoutMode,
        columns,
        shortCode: generateUniqueWallShortCode(existingCodes),
      });
      await wallBoardRepository.save(board);
      setCurrentBoard(board);
    }
    setPosts([...board.posts]);
    setConnectedStudents(0);
    setLiveError(null);
    setTunnelUrl(null);
    setTunnelError(null);
    setShortUrl(null);
    setShortCode(board.shortCode ?? null);
    setCustomCodeInput('');
    setCustomCodeError(null);
    setViewMode('running');
    setShowPastResults(false);
  }, [columns, currentBoard, layoutMode, normalizedTitle]);

  const handleFinish = useCallback(async () => {
    if (isLiveMode) {
      await handleStopLive();
    }
    // 마지막 세션 종료 시각 기록 + 현재 상태 즉시 저장.
    if (currentBoard) {
      const finalBoard: WallBoard = {
        ...currentBoard,
        title: normalizedTitle,
        layoutMode,
        columns,
        posts,
        updatedAt: Date.now(),
        lastSessionAt: Date.now(),
      };
      await wallBoardRepository.save(finalBoard);
      setCurrentBoard(finalBoard);
    }
    setViewMode('results');
  }, [columns, currentBoard, handleStopLive, isLiveMode, layoutMode, normalizedTitle, posts]);

  const handleNewBoard = useCallback(() => {
    // 결과 화면 → 목록으로. "새 담벼락 만들기"는 목록 내 버튼이 담당.
    setViewMode('list');
    setTitle('');
    setLayoutMode('kanban');
    setColumnInputs([...DEFAULT_REALTIME_WALL_COLUMNS]);
    setPosts([]);
    setCurrentBoard(null);
    setShortCode(null);
    setShowPastResults(false);
  }, []);

  // 목록 → "+ 새 담벼락" → create 진입 (신규 보드)
  const handleOpenCreate = useCallback(() => {
    setCurrentBoard(null);
    setTitle('');
    setLayoutMode('kanban');
    setColumnInputs([...DEFAULT_REALTIME_WALL_COLUMNS]);
    setPosts([]);
    setShortCode(null);
    setViewMode('create');
  }, []);

  // 목록 → 보드 선택 → 복원 후 running 진입
  const handleOpenBoard = useCallback(async (id: WallBoardId) => {
    const board = await wallBoardRepository.load(id);
    if (!board) {
      setLiveError('담벼락을 불러오지 못했습니다. 파일이 손상되었을 수 있습니다.');
      return;
    }
    setCurrentBoard(board);
    setTitle(board.title);
    setLayoutMode(board.layoutMode);
    setColumnInputs(board.columns.map((c) => c.title));
    setPosts([...board.posts]);
    setShortCode(board.shortCode ?? null);
    setViewMode('running');
  }, []);

  const handleApprovePost = useCallback((postId: string) => {
    setPosts((prev) => approveRealtimeWallPost(prev, postId, columns));
  }, [columns]);

  const handleHidePost = useCallback((postId: string) => {
    setPosts((prev) => hideRealtimeWallPost(prev, postId));
  }, []);

  const handleRestorePost = useCallback((postId: string) => {
    setPosts((prev) => approveRealtimeWallPost(prev, postId, columns));
  }, [columns]);

  const handleHeartPost = useCallback(
    (postId: string) => {
      // heartRealtimeWallPost는 (prev, postId) 순수 함수이며 컨테이너 외부 상태
      // (columns 등)에 의존하지 않음. setState updater가 최신 prev를 보장하므로
      // deps는 의도적으로 빈 배열.
      setPosts((prev) => heartRealtimeWallPost(prev, postId));
    },
    [],
  );

  const handleTogglePin = useCallback((postId: string) => {
    setPosts((prev) => togglePinRealtimeWallPost(prev, postId));
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
        const nextPost = createPendingRealtimeWallPost(
          {
            id: data.post.id,
            nickname: data.post.nickname,
            text: data.post.text,
            ...(data.post.linkUrl ? { linkUrl: data.post.linkUrl } : {}),
            submittedAt: data.post.submittedAt,
          },
          prev,
          columns,
        );
        return [nextPost, ...prev];
      });

      // webpage 링크는 Main에서 OG fetch 후 비동기 upsert.
      // createPendingRealtimeWallPost 내부와 동일한 normalize + classify를 한 번 더
      // 수행해 '웹페이지 여부' 분기만 얻음. (post.linkPreview 직접 읽는 건 setPosts
      // 콜백 밖이라 신뢰 불가.)
      const normalizedLink = data.post.linkUrl
        ? normalizeRealtimeWallLink(data.post.linkUrl)
        : undefined;
      if (
        normalizedLink &&
        !extractYoutubeVideoId(normalizedLink) &&
        window.electronAPI?.fetchRealtimeWallLinkPreview
      ) {
        void window.electronAPI
          .fetchRealtimeWallLinkPreview(normalizedLink)
          .then((og) => {
            if (!og) return;
            const nextPreview: RealtimeWallLinkPreview = {
              kind: 'webpage',
              ...(og.ogTitle ? { ogTitle: og.ogTitle } : {}),
              ...(og.ogDescription ? { ogDescription: og.ogDescription } : {}),
              ...(og.ogImageUrl ? { ogImageUrl: og.ogImageUrl } : {}),
            };
            setPosts((curr) =>
              curr.map((post) =>
                post.id === data.post.id ? { ...post, linkPreview: nextPreview } : post,
              ),
            );
          })
          .catch(() => undefined);
      }
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

  const boardView = (() => {
    switch (layoutMode) {
      case 'kanban':
        return (
          <RealtimeWallKanbanBoard
            columns={columns}
            posts={posts}
            onChangePosts={setPosts}
            onTogglePin={handleTogglePin}
            onHidePost={handleHidePost}
            onOpenLink={openExternalLink}
            onHeart={handleHeartPost}
          />
        );
      case 'freeform':
        return (
          <RealtimeWallFreeformBoard
            posts={posts}
            onChangePosts={setPosts}
            onTogglePin={handleTogglePin}
            onHidePost={handleHidePost}
            onOpenLink={openExternalLink}
            onHeart={handleHeartPost}
          />
        );
      case 'grid':
        return (
          <RealtimeWallGridBoard
            posts={posts}
            onTogglePin={handleTogglePin}
            onHidePost={handleHidePost}
            onOpenLink={openExternalLink}
            onHeart={handleHeartPost}
          />
        );
      case 'stream':
        return (
          <RealtimeWallStreamBoard
            posts={posts}
            onTogglePin={handleTogglePin}
            onHidePost={handleHidePost}
            onOpenLink={openExternalLink}
            onHeart={handleHeartPost}
          />
        );
      default: {
        const _exhaustive: never = layoutMode;
        throw new Error(`Unknown layout mode: ${String(_exhaustive)}`);
      }
    }
  })();

  return (
    <ToolLayout title="실시간 담벼락" emoji="🗂️" onBack={onBack} isFullscreen={isFullscreen}>
      {showPastResults ? (
        <PastResultsView toolType="realtime-wall" onClose={() => setShowPastResults(false)} />
      ) : null}

      {!showPastResults && viewMode === 'list' && (
        <WallBoardListView
          repo={wallBoardRepository}
          onCreate={handleOpenCreate}
          onOpen={(id) => {
            void handleOpenBoard(id);
          }}
        />
      )}

      {!showPastResults && viewMode === 'create' && (
        <RealtimeWallCreateView
          title={title}
          layoutMode={layoutMode}
          columnInputs={columnInputs}
          onTitleChange={setTitle}
          onLayoutModeChange={setLayoutMode}
          onColumnChange={handleChangeColumnInput}
          onAddColumn={handleAddColumn}
          onRemoveColumn={handleRemoveColumn}
          onStart={() => {
            void handleStartBoard();
          }}
          onShowPastResults={() => setShowPastResults(true)}
        />
      )}

      {!showPastResults && viewMode === 'running' && (
        <div className="flex h-full min-h-0 flex-col gap-4">
          {isLiveMode ? (
            <RealtimeWallLiveSharePanel
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
            <RealtimeWallQueuePanel
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
        <RealtimeWallResultView
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
