import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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
  WallApprovalMode,
  WallBoard,
  WallBoardId,
} from '@domain/entities/RealtimeWall';
import {
  approveRealtimeWallPost,
  buildRealtimeWallColumns,
  bulkApproveWallPosts,
  createWallBoard,
  createWallPost,
  DEFAULT_REALTIME_WALL_COLUMNS,
  extractYoutubeVideoId,
  generateUniqueWallShortCode,
  heartRealtimeWallPost,
  hideRealtimeWallPost,
  moderationModeFromApprovalMode,
  normalizeRealtimeWallLink,
  REALTIME_WALL_MAX_COLUMNS,
  REALTIME_WALL_MAX_TEXT_LENGTH_V2,
  togglePinRealtimeWallPost,
  type RealtimeWallStudentSubmission,
} from '@domain/rules/realtimeWallRules';
import { DEFAULT_REALTIME_WALL_BOARD_SETTINGS } from '@domain/entities/RealtimeWallBoardSettings';
import {
  DEFAULT_WALL_BOARD_THEME,
  type WallBoardTheme,
} from '@domain/entities/RealtimeWallBoardTheme';
import { buildWallStateForStudents } from '@usecases/realtimeWall/BroadcastWallState';
import { RealtimeWallKanbanBoard } from './RealtimeWall/RealtimeWallKanbanBoard';
import { RealtimeWallFreeformBoard } from './RealtimeWall/RealtimeWallFreeformBoard';
import { RealtimeWallGridBoard } from './RealtimeWall/RealtimeWallGridBoard';
import { RealtimeWallStreamBoard } from './RealtimeWall/RealtimeWallStreamBoard';
import { RealtimeWallBoardThemeWrapper } from './RealtimeWall/RealtimeWallBoardThemeWrapper';
import { resolveBoardThemeVariant } from './RealtimeWall/RealtimeWallBoardThemePresets';
import { RealtimeWallCreateView } from './RealtimeWall/RealtimeWallCreateView';
import { RealtimeWallQueuePanel } from './RealtimeWall/RealtimeWallQueuePanel';
import { RealtimeWallBoardSettingsDrawer } from './RealtimeWall/RealtimeWallBoardSettingsDrawer';
import { RealtimeWallCardDetailModal } from './RealtimeWall/RealtimeWallCardDetailModal';
import type {
  BoardSettingsSection,
  ExportSectionProps,
  ShareSectionProps,
} from './RealtimeWall/RealtimeWallBoardSettingsDrawer';
import {
  exportRealtimeWallBoard,
  sanitizeRealtimeWallFileBase,
  type RealtimeWallExportOptions,
} from '@usecases/realtimeWall/ExportRealtimeWallBoard';
import {
  exportRealtimeWallToExcel,
  exportRealtimeWallToPdf,
} from '@infrastructure/export';
import { useToastStore } from '@adapters/components/common/Toast';
import { RealtimeWallTeacherActionBar } from './RealtimeWall/RealtimeWallTeacherActionBar';
import { WallBoardListView } from './RealtimeWall/WallBoardListView';
import { RealtimeWallTeacherStudentTrackerPanel } from './RealtimeWall/RealtimeWallTeacherStudentTrackerPanel';
import { openExternalLink } from './RealtimeWall/realtimeWallHelpers';
import { StudentSubmitForm } from '@student/StudentSubmitForm';
import QRCode from 'qrcode';

const AUTO_SAVE_DEBOUNCE_MS = 2000;
/** 30초마다 강제 저장 — debounce 실패 시 safety net. Design §3.3. */
const AUTO_SAVE_INTERVAL_MS = 30_000;

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

// 2026-04-26 결함 #5 — "수업 마무리" 제거에 따라 'results' 진입 경로 삭제.
// RealtimeWallResultView는 별도 PR에서 보드 목록 메뉴 등 새 진입점에 재배치 예정.
type ViewMode = 'list' | 'create' | 'running';

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

  // v1.13 Stage C: 승인 정책 state.
  // CreateView에서 선택 → handleStartBoard에서 createWallBoard에 주입.
  // handleOpenBoard에서는 board.approvalMode를 복원.
  // 라이브 중 통합 드로어에서 전환 가능(handleChangeApprovalMode).
  // v2.1 student-ux: 기본값 'auto' (Plan §7.2 결정 #4 — moderation OFF 프리셋 정합).
  // 학생이 카드 추가 시 즉시 보드에 표시되어 Padlet 동일 UX. 교사가 필요하면 드로어에서 'manual' 전환.
  const [approvalMode, setApprovalMode] = useState<WallApprovalMode>('auto');
  // v1.13: 통합 설정 드로어. null = 닫힘, 'basic'/'columns'/'approval' = 해당 섹션 열림.
  const [boardSettingsDrawer, setBoardSettingsDrawer] = useState<BoardSettingsSection | null>(null);

  const [isLiveMode, setIsLiveMode] = useState(false);
  const [connectedStudents, setConnectedStudents] = useState(0);
  /**
   * v1.14 P3 — 학생 카드 추가 잠금 상태.
   *
   * BoardSettingsDrawer §4에서 토글. 변경 시 IPC로 Main에 전달 → 모든 학생에게
   * student-form-locked broadcast + wall-state snapshot 다음 업데이트 시 반영.
   * 라이브 세션 종료 시 reset.
   */
  const [studentFormLocked, setStudentFormLocked] = useState(false);
  /**
   * v1.16.x Phase 2 (Design §3.2 / §5.3) — 보드 디자인 테마.
   *
   * - Drawer §5에서 즉시 갱신 + boardSettings-changed broadcast (100ms 디바운스는 Drawer 내부).
   * - 보드 wrapper(교사·학생)에 inline style/className spread.
   * - WallBoard.settings.theme로 영속 — handleStartBoard / handleOpenBoard에서 복원.
   *   자동저장 effect가 변경 시점에 보드에 다시 부착해 디스크 저장.
   */
  const [boardTheme, setBoardTheme] = useState<WallBoardTheme>(DEFAULT_WALL_BOARD_THEME);
  const [showQRFullscreen, setShowQRFullscreen] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [tunnelLoading, setTunnelLoading] = useState(false);
  const [tunnelError, setTunnelError] = useState<string | null>(null);
  const [shortUrl, setShortUrl] = useState<string | null>(null);
  const [shortCode, setShortCode] = useState<string | null>(null);
  const [customCodeInput, setCustomCodeInput] = useState('');
  const [customCodeError, setCustomCodeError] = useState<string | null>(null);

  // 2026-04-26 결함 #5 — 내보내기 진행 상태 (PDF/Excel 생성 중 spinner).
  const [isExporting, setIsExporting] = useState(false);

  // Step 1 — 교사 카드 추가 모달 열림/닫힘 상태.
  const [teacherFormOpen, setTeacherFormOpen] = useState(false);

  // 2026-04-26 결함 fix — 카드 더블클릭 상세 모달 (교사, Padlet 동일뷰 §0.1).
  const [detailPostId, setDetailPostId] = useState<string | null>(null);

  const showToast = useToastStore((s) => s.show);

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

  // 최신 상태를 interval 루프에서 stale 없이 참조하기 위한 ref.
  // currentBoard는 save 성공 시 setCurrentBoard로 갱신되어 의존성 순환이
  // 걱정되므로, interval 경로에선 effect deps에 넣지 않고 ref로 읽는다.
  const latestStateRef = useRef({
    currentBoard,
    title: normalizedTitle,
    layoutMode,
    columns,
    approvalMode,
    posts,
    boardTheme,
  });
  latestStateRef.current = {
    currentBoard,
    title: normalizedTitle,
    layoutMode,
    columns,
    approvalMode,
    posts,
    boardTheme,
  };

  // v1.13 Stage A: 자동 저장. running 모드에서 posts/title/layoutMode/columns/
  // approvalMode 변경을 debounce 2s + interval 30s safety net으로 repo에 반영.
  // currentBoard가 없으면 no-op (아직 새 보드를 start하지 않은 상태 — create 등).
  // Design §3.3.
  //
  // 추가로 변경 즉시 Main에 stage-dirty IPC를 fire-and-forget으로 푸시해
  // 강제 종료(before-quit) 시점에도 최신 스냅샷이 동기 저장되도록 보장한다.
  useEffect(() => {
    if (!currentBoard || viewMode !== 'running') return;

    const buildSnapshot = (): WallBoard | null => {
      const s = latestStateRef.current;
      if (!s.currentBoard) return null;
      // v1.16.x Phase 2 — settings.theme 영속 (Design §3.2). 다른 settings 필드는 보존.
      const prevSettings = s.currentBoard.settings ?? DEFAULT_REALTIME_WALL_BOARD_SETTINGS;
      const nextSettings = { ...prevSettings, theme: s.boardTheme };
      return {
        ...s.currentBoard,
        title: s.title,
        layoutMode: s.layoutMode,
        columns: s.columns,
        approvalMode: s.approvalMode,
        posts: s.posts,
        settings: nextSettings,
        updatedAt: Date.now(),
      };
    };

    // 변경 즉시 Main에 dirty 스냅샷 푸시 (before-quit 안전망).
    const dirty = buildSnapshot();
    if (dirty && window.electronAPI?.wallBoards?.stageDirty) {
      void window.electronAPI.wallBoards
        .stageDirty({ board: dirty })
        .catch(() => {});
    }

    const saveSnapshot = () => {
      const next = buildSnapshot();
      if (!next) return;
      // 저장 실패는 조용히 무시 — 다음 주기에 재시도.
      // 토스트는 수동 "저장/종료" 시에만 노출.
      void wallBoardRepository.save(next).then(() => {
        setCurrentBoard(next);
      }).catch(() => {});
    };

    const debounceTimer = window.setTimeout(saveSnapshot, AUTO_SAVE_DEBOUNCE_MS);
    const intervalTimer = window.setInterval(saveSnapshot, AUTO_SAVE_INTERVAL_MS);

    return () => {
      window.clearTimeout(debounceTimer);
      window.clearInterval(intervalTimer);
    };
    // currentBoard를 dep에 넣으면 save → setCurrentBoard → 재-schedule 무한
    // 루프가 되므로 의도적으로 제외 (latestStateRef로 최신값 참조).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, normalizedTitle, layoutMode, columns, approvalMode, viewMode, boardTheme]);

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

      // v1.13 [A] Design §1.1 / §3.7#8: 영속 보드의 고정 shortCode 재적용.
      // currentBoard.shortCode가 있으면 setCustomCode로 학생 접속 URL을 보드
      // 고유 코드로 고정 (교사가 학기 내내 동일 코드로 안내 가능).
      // Supabase 상에 이미 다른 세션이 이 코드를 쓰고 있어 setCustomCode가
      // 실패하면 registerSession 기본값(랜덤)로 폴백하고 board.shortCode를
      // 새 코드로 업데이트해 다음 세션부터 충돌 회피.
      const persistentCode = currentBoard?.shortCode;
      if (persistentCode) {
        try {
          const liveSession = await liveSessionClientRef.current.setCustomCode(
            result.tunnelUrl,
            persistentCode,
          );
          setShortUrl(liveSession.shortUrl);
          setShortCode(liveSession.code);
          return;
        } catch {
          // 코드 충돌 — 아래 registerSession fallback으로 진행
        }
      }

      const liveSession = await liveSessionClientRef.current.registerSession(result.tunnelUrl);
      if (liveSession) {
        setShortUrl(liveSession.shortUrl);
        setShortCode(liveSession.code);
        // 고정 코드 부재(신규 보드 첫 라이브) 또는 코드 충돌 fallback → 서버가
        // 발급한 코드를 board.shortCode로 승격. 다음 세션부터 동일 코드 재사용.
        if (currentBoard && currentBoard.shortCode !== liveSession.code) {
          const updatedBoard: WallBoard = {
            ...currentBoard,
            shortCode: liveSession.code,
            updatedAt: Date.now(),
          };
          void wallBoardRepository.save(updatedBoard).then(() => {
            setCurrentBoard(updatedBoard);
          }).catch(() => {});
        }
      }
    } catch {
      setTunnelError('외부 접속 주소를 만들지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해주세요.');
    } finally {
      setTunnelLoading(false);
    }
  }, [currentBoard]);

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
        maxTextLength: REALTIME_WALL_MAX_TEXT_LENGTH_V2,
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
    setStudentFormLocked(false);
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
        approvalMode,
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
  }, [approvalMode, columns, currentBoard, layoutMode, normalizedTitle]);

  // 2026-04-26 결함 #5 — "수업 마무리" 제거 + "내보내기" 신설.
  //
  // 흐름:
  //   1) usecase로 도메인 → 평면 export 행 변환
  //   2) infrastructure exporter (PDF or Excel)로 ArrayBuffer 생성
  //   3) Electron showSaveDialog → writeFile (브라우저는 Blob 다운로드 폴백)
  //
  // 기존 handleFinish의 라이브 종료 책임은 공유 Drawer §0 "참여 종료" 버튼
  // (`onStopLive` → `handleStopLive`)으로 충분히 처리됨. 마지막 세션 시각 기록은
  // 자동 저장 effect와 onStopLive에서 다음 라이브 시점에 갱신되므로 추가 처리 불필요.
  const handleExport = useCallback(
    async (format: 'pdf' | 'excel', options: RealtimeWallExportOptions) => {
      if (isExporting) return;
      setIsExporting(true);
      try {
        const rows = exportRealtimeWallBoard({
          title: normalizedTitle,
          layoutMode,
          columns,
          posts,
          options,
        });

        const buffer = format === 'pdf'
          ? await exportRealtimeWallToPdf(rows)
          : await exportRealtimeWallToExcel(rows);

        const ext = format === 'pdf' ? 'pdf' : 'xlsx';
        const filterName = format === 'pdf' ? 'PDF 파일' : 'Excel 파일';
        const fileBase = sanitizeRealtimeWallFileBase(normalizedTitle);
        const defaultFileName = `${fileBase}_담벼락.${ext}`;

        if (window.electronAPI) {
          const filePath = await window.electronAPI.showSaveDialog({
            title: '실시간 담벼락 내보내기',
            defaultPath: defaultFileName,
            filters: [{ name: filterName, extensions: [ext] }],
          });
          if (filePath) {
            await window.electronAPI.writeFile(filePath, buffer);
            showToast('파일을 저장했어요', 'success', {
              label: '파일 열기',
              onClick: () => window.electronAPI?.openFile(filePath),
            });
          }
        } else {
          const mime = format === 'pdf'
            ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          const blob = new Blob([buffer], { type: mime });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = defaultFileName;
          a.click();
          URL.revokeObjectURL(url);
          showToast('파일을 다운로드했어요', 'success');
        }
      } catch (err) {
        console.error('[ToolRealtimeWall] export failed', err);
        showToast('내보내기에 실패했어요. 다시 시도해주세요.', 'error');
      } finally {
        setIsExporting(false);
      }
    },
    [columns, isExporting, layoutMode, normalizedTitle, posts, showToast],
  );

  // 목록 → "+ 새 담벼락" → create 진입 (신규 보드)
  const handleOpenCreate = useCallback(() => {
    setCurrentBoard(null);
    setTitle('');
    setLayoutMode('kanban');
    setColumnInputs([...DEFAULT_REALTIME_WALL_COLUMNS]);
    // v2.1 student-ux: 기본 'auto' (Padlet 정합)
    setApprovalMode('auto');
    setPosts([]);
    setShortCode(null);
    setViewMode('create');
    // v1.16.x — theme default
    setBoardTheme(DEFAULT_WALL_BOARD_THEME);
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
    setApprovalMode(board.approvalMode);
    setPosts([...board.posts]);
    setShortCode(board.shortCode ?? null);
    // v1.16.x Phase 2 — 보드 settings.theme 복원 (미설정 시 default)
    setBoardTheme(board.settings?.theme ?? DEFAULT_WALL_BOARD_THEME);
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
      prev.length >= REALTIME_WALL_MAX_COLUMNS ? prev : [...prev, `컬럼 ${prev.length + 1}`]
    ));
  }, []);

  // 2026-04-26 결함 #4 — Padlet 동일 인라인 "+ 섹션 추가" (Kanban 보드 우측 ghost 카드).
  // 사용자가 입력한 title 그대로 push (트림은 컴포넌트에서 수행).
  // 상한 REALTIME_WALL_MAX_COLUMNS(=50, 사실상 무제한) 도달 시 무시 (no-op).
  // 빈 문자열은 컴포넌트가 미호출.
  const handleAddColumnInline = useCallback((title: string) => {
    setColumnInputs((prev) => (
      prev.length >= REALTIME_WALL_MAX_COLUMNS ? prev : [...prev, title]
    ));
  }, []);

  const handleRemoveColumn = useCallback((index: number) => {
    setColumnInputs((prev) => (
      prev.length <= 2 ? prev : prev.filter((_, currentIndex) => currentIndex !== index)
    ));
  }, []);

  // v1.13 Stage C: 라이브 설정 드로어에서 모드 적용.
  // shouldBulkApprove=true면 현재 pending 카드를 일괄 approved로 승격.
  // v2.1 (Phase A-A5): boardSettings-changed broadcast 함께 송신 → 학생 화면 즉시 갱신.
  const handleApplyApprovalMode = useCallback(
    (nextMode: WallApprovalMode, shouldBulkApprove: boolean) => {
      setApprovalMode(nextMode);
      if (shouldBulkApprove) {
        setPosts((prev) => bulkApproveWallPosts(prev, columns));
      }
      // v2.1 Phase A-A5: moderation 변경 broadcast (Plan FR-A7)
      // v1.16.x: settings.theme도 함께 broadcast — 학생 화면이 항상 일관된 settings 보유
      if (window.electronAPI?.broadcastRealtimeWall) {
        const moderation = moderationModeFromApprovalMode(nextMode);
        const settings = {
          ...DEFAULT_REALTIME_WALL_BOARD_SETTINGS,
          moderation,
          theme: boardTheme,
        };
        void window.electronAPI.broadcastRealtimeWall({
          type: 'boardSettings-changed',
          settings,
        });
      }
    },
    [boardTheme, columns],
  );

  // v1.16.x Phase 2 (Design §결정 5) — 보드 디자인 테마 변경.
  // Drawer §5에서 100ms 디바운스 후 호출 → 로컬 state 즉시 갱신 + boardSettings-changed broadcast.
  // 자동 저장 effect가 settings.theme를 디스크에 영속.
  const handleThemeChange = useCallback(
    (nextTheme: WallBoardTheme) => {
      setBoardTheme(nextTheme);
      if (isLiveMode && window.electronAPI?.broadcastRealtimeWall) {
        const moderation = moderationModeFromApprovalMode(approvalMode);
        const settings = {
          ...DEFAULT_REALTIME_WALL_BOARD_SETTINGS,
          moderation,
          theme: nextTheme,
        };
        void window.electronAPI.broadcastRealtimeWall({
          type: 'boardSettings-changed',
          settings,
        });
      }
    },
    [approvalMode, isLiveMode],
  );

  // v1.13 Stage B: 컬럼 편집 드로어에서 columns/posts 일괄 반영.
  // columnInputs는 UI 소스(string[])라 title 배열만 추출해 동기화.
  // posts는 removeWallColumn의 카드 마이그레이션 결과를 그대로 반영.
  const handleApplyColumnEdit = useCallback(
    (
      nextColumns: readonly import('@domain/entities/RealtimeWall').RealtimeWallColumn[],
      nextPosts: readonly RealtimeWallPost[],
    ) => {
      setColumnInputs(nextColumns.map((c) => c.title));
      setPosts([...nextPosts]);
    },
    [],
  );

  useEffect(() => {
    if (!isLiveMode || !window.electronAPI) return;

    const unsubscribeSubmitted = window.electronAPI.onRealtimeWallStudentSubmitted((data) => {
      // v2.1 student-ux 회귀 fix (2026-04-24) — 옵션 A:
      // 서버가 도메인 createWallPost를 직접 호출해 RealtimeWallPost 전체를 보냄.
      // renderer는 더 이상 createWallPost를 부르지 않음 — 서버 결과를 그대로 merge.
      // 효과:
      //   - 이미지/PDF/색상/owner/pinHash 모두 보존 (Bug B fix)
      //   - 교사가 화면을 떠나도 서버가 lastWallState를 갱신하므로 학생 broadcast 유지 (Bug A fix)
      //   - 교사가 마운트된 경우만 이 useEffect가 setPosts → 보드 시각 갱신
      const incoming = data.post as RealtimeWallPost;
      if (typeof console !== 'undefined') {
        console.log('[ToolRealtimeWall] student-submitted received:', {
          id: incoming.id,
          status: incoming.status,
          hasImages: Boolean(incoming.images?.length),
          hasPdf: Boolean(incoming.pdfUrl),
        });
      }
      setPosts((prev) => {
        // 중복 방지 — 서버 broadcast가 race로 두 번 도달하는 케이스
        if (prev.some((p) => p.id === incoming.id)) return prev;
        return [incoming, ...prev];
      });

      // webpage 링크 OG fetch — 서버에서는 link normalize만, OG는 renderer 측에서.
      const normalizedLink = incoming.linkUrl
        ? normalizeRealtimeWallLink(incoming.linkUrl)
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
                post.id === incoming.id ? { ...post, linkPreview: nextPreview } : post,
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
    // v2.1 student-ux 회귀 fix (2026-04-24): approvalMode/columns 제거.
    // 서버가 createWallPost를 호출하므로 renderer에서는 더 이상 참조할 필요 없음.
  }, [isLiveMode]);

  // v1.14 P1 — 패들렛 모드: 라이브 세션 중 보드 상태 변화 시 학생들에게 broadcast.
  // 세부 차분 push는 P2/P3에서 최적화. 현재는 wall-state 전체 푸시로 충분 (Design §11 P1).
  // v1.14 P3 — studentFormLocked도 snapshot에 포함해 신규 join 학생이 즉시 올바른
  // FAB 상태를 받도록 한다.
  useEffect(() => {
    if (!isLiveMode) return;
    if (!window.electronAPI?.broadcastRealtimeWall) return;

    // v1.16.x Phase 2 — settings.theme를 wall-state snapshot에 포함 (Design §4.1).
    // sanitizeBoardSettingsForStudents가 default fallback 보장.
    const moderation = moderationModeFromApprovalMode(approvalMode);
    const snapshot = buildWallStateForStudents({
      title: normalizedTitle,
      layoutMode,
      columns,
      posts,
      studentFormLocked,
      settings: {
        ...DEFAULT_REALTIME_WALL_BOARD_SETTINGS,
        moderation,
        theme: boardTheme,
      },
    });
    void window.electronAPI.broadcastRealtimeWall({ type: 'wall-state', board: snapshot });
  }, [isLiveMode, normalizedTitle, layoutMode, columns, posts, studentFormLocked, approvalMode, boardTheme]);

  // v1.14 P3 — 학생 카드 추가 잠금 토글 핸들러.
  // Main에 IPC로 전달 → 세션 플래그 갱신 + student-form-locked broadcast.
  const handleStudentFormLockedChange = useCallback((locked: boolean) => {
    setStudentFormLocked(locked);
    if (window.electronAPI?.setRealtimeWallStudentFormLocked) {
      void window.electronAPI.setRealtimeWallStudentFormLocked(locked);
    }
  }, []);

  // v1.14 P2 — 학생 좋아요/댓글 도착 이벤트 수신 → posts 상태 갱신
  useEffect(() => {
    if (!isLiveMode) return;
    const api = window.electronAPI;
    if (!api) return;

    const offLike = api.onRealtimeWallStudentLike?.((data) => {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === data.postId
            ? { ...p, likes: data.likes, likedBy: data.likedBy }
            : p,
        ),
      );
    });
    const offComment = api.onRealtimeWallStudentComment?.((data) => {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === data.postId
            ? { ...p, comments: [...(p.comments ?? []), data.comment] }
            : p,
        ),
      );
    });

    // v2.1 Phase D — 학생 자기 카드 수정 이벤트
    const offEdit = api.onRealtimeWallStudentEdit?.((data) => {
      const updatedPost = data.post as RealtimeWallPost | undefined;
      if (!updatedPost) return;
      setPosts((prev) =>
        prev.map((p) => (p.id === data.postId ? updatedPost : p)),
      );
    });

    // v2.1 Phase C — 학생 자기 카드 위치 변경 이벤트.
    // 결함 fix (2026-04-26): 학생이 카드를 다른 컬럼/좌표로 이동할 때 교사
    // renderer가 동기화되지 않으면, 이후 좋아요·댓글·삭제 등 부분 업데이트가
    // 도착해 setPosts가 호출될 때 stale 위치로 wall-state가 재 broadcast되어
    // 학생 화면에서 카드가 원래 위치로 되돌아가는 버그가 발생.
    // 서버는 위치 patch만 적용한 최종 post 전체를 그대로 전달하므로 교체 merge.
    const offMove = api.onRealtimeWallStudentMove?.((data) => {
      const updatedPost = data.post as RealtimeWallPost | undefined;
      if (!updatedPost) return;
      setPosts((prev) =>
        prev.map((p) => (p.id === data.postId ? updatedPost : p)),
      );
    });

    // v2.1 Phase D — 학생 자기 카드 삭제(soft delete) 이벤트
    // 회귀 위험 #8: hard delete 패턴 사용 X — status='hidden-by-author' 갱신만
    const offDelete = api.onRealtimeWallStudentDelete?.((data) => {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === data.postId ? { ...p, status: 'hidden-by-author' as const } : p,
        ),
      );
    });

    // v2.1 Phase D — 닉네임 변경 broadcast (서버 응답 — 자기 화면도 동기화)
    const offNick = api.onRealtimeWallNicknameChanged?.((data) => {
      const ids = new Set(data.postIds);
      setPosts((prev) =>
        prev.map((p) => (ids.has(p.id) ? { ...p, nickname: data.newNickname } : p)),
      );
    });

    return () => {
      offLike?.();
      offComment?.();
      offEdit?.();
      offMove?.();
      offDelete?.();
      offNick?.();
    };
  }, [isLiveMode]);

  // v2.1 Phase D — 교사 작성자 추적 상태 (트래커 패널)
  const [trackedAuthor, setTrackedAuthor] = useState<{
    sessionToken?: string;
    pinHash?: string;
    label?: string;
  } | null>(null);

  const handleTeacherTrackAuthor = useCallback(
    (postId: string) => {
      const target = posts.find((p) => p.id === postId);
      if (!target) return;
      setTrackedAuthor({
        ...(target.ownerSessionToken ? { sessionToken: target.ownerSessionToken } : {}),
        ...(target.studentPinHash ? { pinHash: target.studentPinHash } : {}),
        label: target.nickname,
      });
    },
    [posts],
  );

  const handleTeacherUpdateNickname = useCallback(
    (postId: string) => {
      const target = posts.find((p) => p.id === postId);
      if (!target) return;
      // 한국어 prompt — 추후 모달로 교체 가능
      const next = window.prompt(
        `${target.nickname}의 닉네임을 어떻게 바꿀까요? (1~20자)`,
        target.nickname,
      );
      if (next === null) return;
      const trimmed = next.trim().slice(0, 20);
      if (trimmed.length === 0) return;
      // 같은 작성자의 모든 카드 일괄 변경 (선택) — 단일 카드는 postId 단독
      const sameAuthorIds = posts
        .filter(
          (p) =>
            (target.ownerSessionToken && p.ownerSessionToken === target.ownerSessionToken) ||
            (target.studentPinHash && p.studentPinHash === target.studentPinHash),
        )
        .map((p) => p.id);
      const idsToUpdate = new Set<string>(sameAuthorIds.length > 0 ? sameAuthorIds : [postId]);
      setPosts((prev) =>
        prev.map((p) => (idsToUpdate.has(p.id) ? { ...p, nickname: trimmed } : p)),
      );
      // 서버 broadcast — store action via WebSocket (renderer 측)
      // 교사 측은 별도 IPC 경로 없음 → 직접 broadcast useEffect 의존 (post 변경이 wall-state에 반영됨)
    },
    [posts],
  );

  const handleTeacherBulkHideStudent = useCallback(
    (postId: string) => {
      const target = posts.find((p) => p.id === postId);
      if (!target) return;
      const sameAuthorIds = posts
        .filter(
          (p) =>
            (target.ownerSessionToken && p.ownerSessionToken === target.ownerSessionToken) ||
            (target.studentPinHash && p.studentPinHash === target.studentPinHash),
        )
        .map((p) => p.id);
      if (sameAuthorIds.length === 0) sameAuthorIds.push(postId);
      const ok = window.confirm(
        `${target.nickname}의 카드 ${sameAuthorIds.length}장을 모두 숨길까요?`,
      );
      if (!ok) return;
      const ids = new Set(sameAuthorIds);
      setPosts((prev) =>
        prev.map((p) => (ids.has(p.id) ? { ...p, status: 'hidden' as const } : p)),
      );
    },
    [posts],
  );

  // v2.1 Phase D — 교사 placeholder 카드 복원 핸들러
  const handleRestoreCard = useCallback((postId: string) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId && p.status === 'hidden-by-author'
          ? { ...p, status: 'approved' as const }
          : p,
      ),
    );
    // Main 측 broadcast 트리거
    if (window.electronAPI?.restoreRealtimeWallCard) {
      void window.electronAPI.restoreRealtimeWallCard({ postId });
    }
  }, []);

  // v2.1 Phase D — 강조할 카드 ID 집합 (트래커 패널 활성 시)
  const highlightedPostIds = useMemo<ReadonlySet<string>>(() => {
    if (!trackedAuthor) return new Set();
    const set = new Set<string>();
    for (const p of posts) {
      if (
        trackedAuthor.sessionToken &&
        p.ownerSessionToken === trackedAuthor.sessionToken
      ) {
        set.add(p.id);
        continue;
      }
      if (
        trackedAuthor.pinHash &&
        p.studentPinHash === trackedAuthor.pinHash
      ) {
        set.add(p.id);
      }
    }
    return set;
  }, [trackedAuthor, posts]);

  // v1.14 P2 — 교사 댓글 삭제 핸들러 (보드 내 카드의 휴지통 클릭)
  const handleRemoveComment = useCallback(
    (postId: string, commentId: string) => {
      // 로컬 posts 즉시 갱신 (status='hidden')
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== postId) return p;
          const nextComments = (p.comments ?? []).map((c) =>
            c.id === commentId ? { ...c, status: 'hidden' as const } : c,
          );
          return { ...p, comments: nextComments };
        }),
      );
      // Main에 삭제 + broadcast 요청
      if (window.electronAPI?.removeRealtimeWallComment) {
        void window.electronAPI.removeRealtimeWallComment({ postId, commentId });
      }
    },
    [],
  );

  /**
   * Step 1 — 교사 카드 추가 핸들러 (옵션 A).
   *
   * renderer에서 직접 `createWallPost`(도메인 순수 함수)를 호출해
   * `RealtimeWallPost`를 생성한다. status는 approvalMode에 관계없이 'approved' 강제.
   *
   * 옵션 A 선택 이유:
   *   - Main IPC 신설 불필요 — `createWallPost` 순수 함수를 renderer에서 직접 재사용 가능.
   *   - `buildWallStateForStudents` useEffect가 posts 변경을 자동 감지해 학생 broadcast.
   *   - 비라이브(pre-live) 모드에서도 보드에 카드 누적 가능 (라이브 시작 전 준비 지원).
   *   - 옵션 B(IPC 신설)는 학생 submit WebSocket 경로와 race condition 발생 가능성 있고
   *     Main 코드 변경 없이 Step 1 범위만으로 완결 가능한 옵션 A가 우선.
   */
  const handleTeacherSubmit = useCallback(
    (input: {
      nickname: string;
      text: string;
      linkUrl?: string;
      images?: string[];
      pdfDataUrl?: string;
      pdfFilename?: string;
      color?: import('@domain/entities/RealtimeWall').RealtimeWallCardColor;
      columnId?: string;
    }) => {
      const id = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `teacher-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      const submission: RealtimeWallStudentSubmission = {
        id,
        nickname: input.nickname,
        text: input.text,
        submittedAt: Date.now(),
        ...(input.linkUrl ? { linkUrl: input.linkUrl } : {}),
        ...(input.images && input.images.length > 0 ? { images: input.images as readonly string[] } : {}),
        ...(input.columnId ? { columnId: input.columnId } : {}),
        ...(input.color ? { color: input.color } : {}),
        // pdfDataUrl은 renderer에서는 file:// URL이 아니라 base64이므로 IPC 없이는 사용 불가.
        // Step 1 스코프에서 PDF는 지원하지 않음 (Step 3+에서 처리).
      };

      setPosts((prev) => {
        // approvalMode에 관계없이 교사 카드는 항상 'approved'로 강제 생성.
        // createWallPost의 'auto' 분기가 즉시 approved + kanban/freeform 계산을 수행.
        const post = createWallPost(submission, prev, columns, 'auto');
        // 중복 id 방지 (드물지만 빠른 연속 클릭 케이스 방어)
        if (prev.some((p) => p.id === post.id)) return prev;
        return [post, ...prev];
      });

      setTeacherFormOpen(false);
    },
    [columns],
  );

  useEffect(() => {
    return () => {
      if (window.electronAPI?.stopRealtimeWall) {
        void window.electronAPI.stopRealtimeWall();
      }
    };
  }, []);

  /**
   * 2026-04-26 결함 fix — 카드 더블클릭 상세 모달 (교사 권한 / Padlet 동일뷰 §0.1).
   *
   * 교사 권한:
   *   - 핀/숨기기 버튼 (handleTogglePin / handleHidePost 재사용)
   *   - 모든 댓글 표시 (status='hidden' 포함, 교사 한정 휴지통)
   *   - 댓글 삭제 (handleRemoveComment)
   *
   * 이벤트 흐름: RealtimeWallCard.onDoubleClick → onCardDetail → setDetailPostId.
   * detailPost는 항상 최신 posts에서 lookup (좋아요/댓글 실시간 반영).
   */
  const detailPost = useMemo(
    () => (detailPostId ? posts.find((p) => p.id === detailPostId) ?? null : null),
    [detailPostId, posts],
  );
  const handleOpenCardDetail = useCallback((postId: string) => {
    setDetailPostId(postId);
  }, []);
  const handleCloseCardDetail = useCallback(() => {
    setDetailPostId(null);
  }, []);

  /**
   * 2026-04-26 컬럼별 독립 세로 스크롤 진짜 fix — 라이브 컨테이너 viewport 좌표 측정.
   *
   * 문제: App.tsx <main className="flex-1 overflow-y-auto"> + ToolLayout content
   *   <div className="flex-1 min-h-0 overflow-auto"> 두 외부 스크롤러가 휠 이벤트를 먼저
   *   흡수해 컬럼 droppable의 overflow-y-auto가 trigger되지 않음.
   *
   * 해법: 라이브 모드 진입 시 running 컨테이너를 position:fixed로 떼어내 두 외부 스크롤러를
   *   완전히 우회. 좌표는 부모 <main>의 getBoundingClientRect로 측정해 사이드바 폭(64px 또는
   *   256px) 자동 인식. ResizeObserver + window resize 양 채널로 사이드바 펼침/접힘·창
   *   리사이즈·전체화면 진입에 실시간 추종.
   *
   * 비활성 조건: viewMode !== 'running' || !isLiveMode → rect=null 반환해 컨테이너는 기존
   *   ToolLayout flex 레이아웃 그대로 동작 (회귀 0건).
   */
  const runningContainerRef = useRef<HTMLDivElement>(null);
  const [liveContainerRect, setLiveContainerRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);

  // useLayoutEffect로 동기 측정 — first-paint flash(좌상단 잠시 좌표 0/0) 방지.
  useLayoutEffect(() => {
    if (viewMode !== 'running' || !isLiveMode) {
      setLiveContainerRect(null);
      return;
    }

    // 부모 <main> 탐색 — App.tsx의 <main className="flex-1 overflow-y-auto"> 매칭.
    // 듀얼 모드(슬롯 컨테이너)에서도 가장 가까운 main 또는 ToolLayout content가 기준이 되도록
    // 여러 후보를 우선순위로 검사. 본 ToolRealtimeWall은 ToolLayout 자식이므로 ToolLayout content
    // 영역(`.flex-1.min-h-0.overflow-auto`)을 우선, 없으면 <main>.
    const findContainer = (): HTMLElement | null => {
      const node = runningContainerRef.current;
      if (!node) return null;
      // ToolLayout content 영역(가장 가까운 부모) — 듀얼 모드에서도 슬롯 영역 정확히 매칭.
      let cursor: HTMLElement | null = node.parentElement;
      while (cursor && cursor !== document.body) {
        if (cursor.tagName === 'MAIN') return cursor;
        cursor = cursor.parentElement;
      }
      return document.querySelector('main');
    };

    const measure = () => {
      const container = findContainer();
      if (!container) return;
      const rect = container.getBoundingClientRect();
      setLiveContainerRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    };

    measure();

    const container = findContainer();
    const ro = container ? new ResizeObserver(measure) : null;
    if (container && ro) ro.observe(container);
    // body resize도 관찰 — 사이드바 폭 변경(transition 200ms) 종료 후 재측정.
    const bodyRo = new ResizeObserver(measure);
    bodyRo.observe(document.body);

    window.addEventListener('resize', measure);

    return () => {
      ro?.disconnect();
      bodyRo.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [viewMode, isLiveMode]);

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
            onRemoveComment={handleRemoveComment}
            onRestoreCard={handleRestoreCard}
            onTeacherTrackAuthor={handleTeacherTrackAuthor}
            onTeacherUpdateNickname={handleTeacherUpdateNickname}
            onTeacherBulkHideStudent={handleTeacherBulkHideStudent}
            highlightedPostIds={highlightedPostIds}
            onAddColumnInline={
              // 2026-04-26 결함 fix #2 — 컬럼 무제한(REALTIME_WALL_MAX_COLUMNS=50) 정책 반영.
              // domain addWallColumn이 상한 도달 시 원본 반환으로 안전 처리하므로, UI 가드는 제거.
              // 6+ 컬럼은 KanbanBoard wrapper의 overflow-x-auto + 컬럼별 min-w-[280px]로 가로 스크롤.
              handleAddColumnInline
            }
            onCardDetail={handleOpenCardDetail}
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
            onRemoveComment={handleRemoveComment}
            onRestoreCard={handleRestoreCard}
            onTeacherTrackAuthor={handleTeacherTrackAuthor}
            onTeacherUpdateNickname={handleTeacherUpdateNickname}
            onTeacherBulkHideStudent={handleTeacherBulkHideStudent}
            highlightedPostIds={highlightedPostIds}
            onCardDetail={handleOpenCardDetail}
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
            onRemoveComment={handleRemoveComment}
            onRestoreCard={handleRestoreCard}
            onTeacherTrackAuthor={handleTeacherTrackAuthor}
            onTeacherUpdateNickname={handleTeacherUpdateNickname}
            onTeacherBulkHideStudent={handleTeacherBulkHideStudent}
            highlightedPostIds={highlightedPostIds}
            onCardDetail={handleOpenCardDetail}
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
            onRemoveComment={handleRemoveComment}
            onRestoreCard={handleRestoreCard}
            onTeacherTrackAuthor={handleTeacherTrackAuthor}
            onTeacherUpdateNickname={handleTeacherUpdateNickname}
            onTeacherBulkHideStudent={handleTeacherBulkHideStudent}
            highlightedPostIds={highlightedPostIds}
            onCardDetail={handleOpenCardDetail}
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
          approvalMode={approvalMode}
          onTitleChange={setTitle}
          onLayoutModeChange={setLayoutMode}
          onColumnChange={handleChangeColumnInput}
          onAddColumn={handleAddColumn}
          onRemoveColumn={handleRemoveColumn}
          onApprovalModeChange={setApprovalMode}
          onStart={() => {
            void handleStartBoard();
          }}
          onShowPastResults={() => setShowPastResults(true)}
        />
      )}

      {/* 2026-04-26 라운드 7 결함 B fix — 라이브 모드 viewport 전체 backdrop.
          기존: running 컨테이너에만 boardTheme 적용 → ToolLayout chrome(헤더/Content gutter)에
          sp-bg 회색이 잔존하여 라이브 풀-immersion 깨짐.
          수정: viewMode='running' && isLiveMode일 때만 fixed inset-0 -z-10 backdrop를 깔아
          chrome 뒤로 boardTheme이 비치도록 한다. -z-10이라 사이드바/헤더는 위에 그대로 보존되며,
          App.tsx:866 글로벌 bg-sp-bg는 손대지 않으므로 다른 도구에 영향 0건.
          buildLiveContainerStyle은 catalog hardcoded 값만 반환 (CSS injection 안전, 회귀 #10). */}
      {!showPastResults && viewMode === 'running' && isLiveMode && (
        <div
          aria-hidden="true"
          className="fixed inset-0 -z-10"
          style={buildLiveContainerStyle(boardTheme)}
        />
      )}

      {!showPastResults && viewMode === 'running' && (
        <div
          ref={runningContainerRef}
          // 2026-04-26 결함 fix — 라이브 모드에서 boardTheme을 running 컨테이너 전체에 적용.
          // 보드만 wrapper로 감싸면 좌우/상단/gap 영역이 sp-bg 회색으로 남아 Padlet 동일뷰 깨짐.
          // 라이브 진입 시 컨테이너 전역에 동일 theme inline style 적용 → 보드 wrapper와 솔리드는
          // 픽셀 일치, gradient/pattern은 거의 일치 (wrapper 내부도 동일 theme이므로 visible seam ≒0).
          // 사이드바 영역은 Sidebar가 sp-surface로 자체 가림 → 본 컨테이너 적용 범위 = 메인 컨텐츠 한정.
          // 라운드 7: 위 fixed inset-0 -z-10 backdrop가 추가 안전망 — chrome 뒤 영역도 일치.
          //
          // 2026-04-26 컬럼별 독립 세로 스크롤 진짜 fix (Option A — architect 1순위):
          // 라이브 모드일 때 컨테이너를 viewport에 고정(`fixed`)해 App.tsx <main> overflow-y-auto 와
          // ToolLayout content overflow-auto 두 외부 스크롤러를 동시에 우회한다.
          // 외부 스크롤러가 흡수하던 휠 이벤트가 컬럼 droppable의 overflow-y-auto에 직접 도달.
          // 좌표는 useLiveContainerRect가 부모 <main>의 getBoundingClientRect를 측정 + ResizeObserver로
          // 사이드바 펼침/접힘·창 리사이즈·전체화면 진입에 실시간 동기화한다.
          // non-live(설정 미시작)에서는 기존 ToolLayout flex 레이아웃 그대로(rect=null) 동작.
          className={
            isLiveMode
              ? `fixed z-0 flex min-h-0 flex-col gap-2 rounded-xl overflow-hidden ${
                  liveContainerRect ? '' : 'inset-0'
                }`
              : 'relative flex h-full min-h-0 flex-col gap-2 rounded-xl'
          }
          style={
            isLiveMode
              ? { ...buildLiveContainerStyle(boardTheme), ...(liveContainerRect ?? {}) }
              : undefined
          }
        >
          {/*
            2026-04-26 사용자 피드백 #1 — 교사 보드 풀-사이즈화 (Padlet 동일뷰).
            기존: LiveSharePanel + 헤더 + 보드 컨테이너 누적 → 보드 절반.
            변경: pre-live 시 슬림 banner만, live 시 우측 ActionBar + 보드 풀-사이즈.
          */}
          {!isLiveMode && (
            <section className="shrink-0 rounded-lg border border-sp-border bg-sp-card px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-sp-accent">wifi</span>
                  <span className="text-xs font-bold text-sp-text">학생 참여 준비 완료</span>
                  <span className="text-xs text-sp-muted">— 시작 버튼을 누르면 접속 주소가 만들어져요</span>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setBoardSettingsDrawer('basic')}
                    className="rounded-md border border-sp-border px-2.5 py-1 text-xs text-sp-muted transition hover:border-sp-accent hover:text-sp-accent"
                  >
                    설정 수정
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleStartLive();
                    }}
                    className="flex items-center gap-1 rounded-md bg-sp-accent px-3 py-1.5 text-xs font-bold text-white transition hover:bg-sp-accent/85"
                  >
                    <span className="material-symbols-outlined text-sm">play_arrow</span>
                    학생 참여 시작
                  </button>
                </div>
              </div>
              {liveError && <p className="mt-1.5 text-xs text-red-400">{liveError}</p>}
            </section>
          )}

          <div
            className={
              // 2026-04-26 풀-사이즈 보드 + 우측 56px ActionBar.
              // approvalMode === 'manual' 일 때만 좌측 큐 패널 노출 (auto에서는 큐 비어있음).
              // grid columns: [큐(manual만)] [보드 1fr] [ActionBar 56px]
              approvalMode === 'manual'
                ? 'grid min-h-0 flex-1 gap-3 xl:grid-cols-[280px_minmax(0,1fr)_auto]'
                : 'grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_auto]'
            }
          >
            {approvalMode === 'manual' && (
              <RealtimeWallQueuePanel
                pendingPosts={pendingPosts}
                hiddenPosts={hiddenPosts}
                approvalMode={approvalMode}
                onApprove={handleApprovePost}
                onHide={handleHidePost}
                onRestore={handleRestorePost}
                onOpenLink={openExternalLink}
              />
            )}

            {/* 보드 영역 — 학생과 픽셀 동일 (헤더/컨트롤 모두 제거).
                RealtimeWallBoardThemeWrapper만 둘러싸 보드 풀-사이즈로 렌더.
                flex-1: grid 셀 안에서 남은 세로 공간을 모두 차지 (QueuePanel·ActionBar와 동일 높이).

                2026-04-27 사용자 피드백 fix — 우측 ActionBar가 가로 스크롤 후에만 보이는 결함:
                grid 셀(`minmax(0,1fr)`)은 0까지 축소 가능하지만, 그 안의 grid item(section)
                및 flex 자식들은 기본 `min-width: auto`(=min-content)라 kanban 내부의
                `overflow-x-auto` 컨텐츠(컬럼 폭 합 + gap)가 셀을 콘텐츠 폭만큼 강제 확장한다.
                결과적으로 ActionBar가 viewport 밖으로 밀려나 가로 스크롤로만 노출됐음.
                section / 내부 div / BoardThemeWrapper 모두 `min-w-0`을 명시해 컬럼이
                `1fr`로 축소되고 kanban 내부에서만 가로 스크롤이 발생하도록 한다. */}
            <section className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="min-h-0 min-w-0 flex-1">
                <RealtimeWallBoardThemeWrapper
                  theme={boardTheme}
                  className="h-full min-h-0 min-w-0 rounded-xl"
                >
                  {boardView}
                </RealtimeWallBoardThemeWrapper>
              </div>
            </section>

            {/* 우측 슬림 ActionBar — 교사 전용 컨트롤 격리 (Padlet 정합) */}
            <RealtimeWallTeacherActionBar
              layoutMode={layoutMode}
              isLiveMode={isLiveMode}
              pendingCount={pendingPosts.length}
              studentFormLocked={studentFormLocked}
              onOpenShare={() => setBoardSettingsDrawer('share')}
              onOpenDesign={() => setBoardSettingsDrawer('design')}
              onOpenColumns={() => setBoardSettingsDrawer('columns')}
              onOpenApprovalQueue={() => setBoardSettingsDrawer('approval')}
              onToggleStudentLock={() => handleStudentFormLockedChange(!studentFormLocked)}
              onOpenExport={() => setBoardSettingsDrawer('export')}
              onAddTeacherCard={() => setTeacherFormOpen(true)}
            />
          </div>

          {/* QR 크게 보기 fullscreen overlay — share 섹션에서 진입 */}
          {showQRFullscreen && (shortUrl ?? tunnelUrl) && (
            <QRFullscreenOverlay
              title={normalizedTitle}
              displayUrl={shortUrl ?? tunnelUrl ?? ''}
              onClose={() => setShowQRFullscreen(false)}
            />
          )}
        </div>
      )}

      {/* 2026-04-26 결함 #5 — 'results' 진입 경로 제거 (ActionBar "수업 마무리" 삭제와 함께).
          RealtimeWallResultView는 향후 보드 목록의 "결과 보기" 메뉴로 재배치 예정. */}

      <RealtimeWallBoardSettingsDrawer
        openSection={boardSettingsDrawer}
        title={title}
        layoutMode={layoutMode}
        columns={columns}
        posts={posts}
        approvalMode={approvalMode}
        studentFormLocked={studentFormLocked}
        onClose={() => setBoardSettingsDrawer(null)}
        onTitleChange={setTitle}
        onLayoutModeChange={setLayoutMode}
        onApplyColumnEdit={handleApplyColumnEdit}
        onApplyApprovalMode={handleApplyApprovalMode}
        onStudentFormLockedChange={handleStudentFormLockedChange}
        theme={boardTheme}
        onThemeChange={handleThemeChange}
        share={
          isLiveMode
            ? ({
                displayUrl: shortUrl ?? tunnelUrl,
                fullUrl: tunnelUrl,
                shortUrl,
                shortCode,
                tunnelLoading,
                tunnelError,
                customCodeInput,
                customCodeError,
                connectedStudents,
                onCustomCodeChange: setCustomCodeInput,
                onSetCustomCode: () => {
                  void handleSetCustomCode();
                },
                onRetryTunnel: () => {
                  void connectTunnel();
                },
                onShowQRFullscreen: () => setShowQRFullscreen(true),
                onStopLive: () => {
                  void handleStopLive();
                },
              } satisfies ShareSectionProps)
            : undefined
        }
        exportSection={
          {
            cardCount: posts.length,
            isExporting,
            onExport: (format, options) => {
              void handleExport(format, options);
            },
          } satisfies ExportSectionProps
        }
      />

      {/* v2.1 Phase D — 교사 작성자 추적 패널 */}
      <RealtimeWallTeacherStudentTrackerPanel
        open={trackedAuthor !== null}
        matchCount={highlightedPostIds.size}
        authorLabel={trackedAuthor?.label}
        onClose={() => setTrackedAuthor(null)}
        onBulkHide={
          trackedAuthor && highlightedPostIds.size > 0
            ? () => {
                const ok = window.confirm(
                  `${trackedAuthor.label ?? '이 작성자'}의 카드 ${highlightedPostIds.size}장을 모두 숨길까요?`,
                );
                if (!ok) return;
                const ids = highlightedPostIds;
                setPosts((prev) =>
                  prev.map((p) => (ids.has(p.id) ? { ...p, status: 'hidden' as const } : p)),
                );
                setTrackedAuthor(null);
              }
            : undefined
        }
      />

      {/*
        2026-04-26 결함 fix — 카드 상세 모달 (교사, Padlet 동일뷰).
        교사 권한:
          - 핀/숨기기 (handleTogglePin/handleHidePost)
          - 모든 댓글 표시 + 댓글 삭제 (handleRemoveComment)
          - 좋아요는 read-only (학생 좋아요 카운트만 표시)
          - 외부 링크 열기 (openExternalLink)
      */}
      <RealtimeWallCardDetailModal
        open={detailPost !== null}
        onClose={handleCloseCardDetail}
        post={detailPost}
        viewerRole="teacher"
        // 2026-04-26 결함 #2 fix — boardTheme.colorScheme을 모달에 명시 주입.
        // 본 모달은 RealtimeWallBoardThemeWrapper 외부에 있어 context 자동 전파가 닿지 않음.
        boardColorScheme={boardTheme.colorScheme}
        onOpenLink={openExternalLink}
        onTogglePin={handleTogglePin}
        onHidePost={handleHidePost}
        onRemoveComment={handleRemoveComment}
      />

      {/*
        Step 1 — 교사 카드 추가 모달.
        StudentSubmitForm을 asTeacher=true로 재사용.
        - 닉네임 "선생님" 고정 (input disabled)
        - PIPA/PIN 플로우 skip
        - studentFormLocked 무시 (교사는 항상 추가 가능)
        - onTeacherSubmit → handleTeacherSubmit → createWallPost(approvalMode='auto') → setPosts
        - boardKey/sessionToken은 교사 전용 고정 키 (드래프트 저장하지 않음)
        - 비라이브 모드에서도 동작 (viewMode === 'running'이면 항상 열릴 수 있음)
      */}
      {viewMode === 'running' && (
        <StudentSubmitForm
          open={teacherFormOpen}
          onClose={(opts) => {
            setTeacherFormOpen(false);
            // submitted=true면 이미 handleTeacherSubmit에서 처리됨 — 추가 동작 없음
            void opts;
          }}
          boardKey={`teacher-board-${currentBoard?.id ?? 'draft'}`}
          sessionToken="teacher"
          asTeacher
          onTeacherSubmit={handleTeacherSubmit}
        />
      )}
    </ToolLayout>
  );
}

/**
 * 2026-04-26 신설 — 라이브 모드 running 컨테이너의 inline style 계산 헬퍼.
 *
 * boardTheme을 풀-immersion으로 컨테이너 전체에 깔기 위해 4종 background 필드만 추출.
 * resolveBoardThemeVariant는 catalog hardcoded 값만 반환하므로 CSS injection 안전 (회귀 #10).
 *
 * 적용 범위:
 *   - viewMode === 'running' && isLiveMode === true 시점만 컨테이너에 inline 적용.
 *   - non-live(설정 미시작) 시 undefined → 기존 sp-bg ToolLayout 톤 유지.
 *
 * 회귀 위험 #11 (메모리 누수): inline style은 React가 unmount 시 자동 제거 — body에 부착한
 * 학생 SPA와 달리 별도 cleanup 불필요.
 */
function buildLiveContainerStyle(theme: WallBoardTheme): CSSProperties {
  const variant = resolveBoardThemeVariant(theme.background.presetId, theme.colorScheme);
  const out: CSSProperties = {};
  if (!variant.style) return out;
  const s = variant.style;
  if (s.background !== undefined) out.background = s.background;
  if (s.backgroundColor !== undefined) out.backgroundColor = s.backgroundColor;
  if (s.backgroundImage !== undefined) out.backgroundImage = s.backgroundImage;
  if (s.backgroundSize !== undefined) out.backgroundSize = s.backgroundSize;
  return out;
}

/**
 * 2026-04-26 신설 — QR 크게 보기 fullscreen overlay.
 * 기존 RealtimeWallLiveSharePanel 내부에 있던 fullscreen 영역을 분리.
 * 화면 전체를 덮는 흰 배경 + 360px QR + URL.
 */
function QRFullscreenOverlay({
  title,
  displayUrl,
  onClose,
}: {
  title: string;
  displayUrl: string;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, displayUrl, {
      width: 360,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });
  }, [displayUrl]);
  return (
    <div
      className="fixed inset-0 z-sp-modal flex flex-col items-center justify-center bg-white text-center"
      onClick={onClose}
    >
      <canvas ref={canvasRef} />
      <p className="mt-6 text-2xl font-bold text-gray-900">{title}</p>
      <p className="mt-2 font-mono text-lg text-gray-600">{displayUrl}</p>
      <p className="mt-4 text-sm text-gray-400">화면을 클릭하면 돌아갑니다.</p>
    </div>
  );
}
