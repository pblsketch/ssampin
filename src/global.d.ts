/** 단일/복수 선택 집계 */
type AggregatedSingleMulti = { counts: Record<string, number>; total: number };
/** 스케일 집계 */
type AggregatedScale = { avg: number; distribution: Record<number, number>; total: number };
/** 주관식 집계 (무기명) */
type AggregatedText = { answers: string[] };
/** 집계 결과 discriminated union */
type AggregatedResult = AggregatedSingleMulti | AggregatedScale | AggregatedText;

/** 내 이모티콘 (Sticker picker — PRD §4.1) — Electron API 시그니처.
 *  본 정의는 src/adapters/components/StickerPicker/stickerElectronTypes.ts와 일치해야 한다. */
interface StickerSelectImageResult {
  readonly canceled: boolean;
  readonly filePaths: readonly string[];
}
interface StickerImportImageResult {
  readonly contentHash: string;
}
/** paste 실패 사유 — discriminated string. 추가 사유는 string 폴백으로 호환. */
type StickerPasteReason =
  | 'accessibility-denied'
  | 'osascript-failed'
  | 'unsupported-platform'
  | (string & {});
interface StickerPasteResult {
  readonly ok: boolean;
  readonly autoPasted: boolean;
  readonly reason?: StickerPasteReason;
}
interface StickerAccessibilityResult {
  readonly granted: boolean;
  readonly requested: boolean;
  readonly reason?: string;
}
interface StickerPlatformResult {
  readonly platform: 'win32' | 'darwin' | 'linux';
}
/** Phase 2B 시트 분할 셀 미리보기 — main → renderer 전달용 */
interface StickerSheetCellPreview {
  readonly index: number;
  readonly row: number;
  readonly col: number;
  readonly contentHash: string;
  readonly isEmpty: boolean;
  readonly dataUrl: string;
}
interface StickerSplitSheetResult {
  readonly sessionId: string;
  readonly gridSize: 2 | 3 | 4;
  readonly sheetWidth: number;
  readonly sheetHeight: number;
  readonly cells: ReadonlyArray<StickerSheetCellPreview>;
}
interface StickerCommitSheetCellsResult {
  readonly committed: ReadonlyArray<{
    readonly index: number;
    readonly stickerId: string;
    readonly contentHash: string;
  }>;
}
interface StickerElectronAPI {
  selectImage: () => Promise<StickerSelectImageResult>;
  importImage: (
    stickerId: string,
    sourcePath: string,
  ) => Promise<StickerImportImageResult>;
  getImageDataUrl: (stickerId: string) => Promise<string | null>;
  deleteImage: (stickerId: string) => Promise<void>;
  paste: (
    stickerId: string,
    restorePreviousClipboard: boolean,
  ) => Promise<StickerPasteResult>;
  closePicker: () => Promise<void>;
  /** 글로벌 단축키 등록 실패 fallback — 메인 윈도우 keydown에서 호출 */
  triggerToggle?: () => Promise<void>;
  onShortcutConflict: (cb: (combo: string) => void) => () => void;
  /** 데이터 변경 broadcast 트리거 (관리 화면 → 피커 윈도우) */
  notifyDataChanged?: () => Promise<void>;
  /** 데이터 변경 알림 구독 (피커 윈도우 측) */
  onDataChanged?: (cb: () => void) => () => void;
  /** 피커 빈 상태 → 쌤도구 페이지 열기 */
  openManager?: () => Promise<void>;
  /** macOS 전용 — 접근성 권한 요청 (PRD §4.1.1 Phase 2). */
  requestAccessibilityPermission?: () => Promise<StickerAccessibilityResult>;
  /** 현재 OS 플랫폼 — 렌더러가 macOS 전용 UI를 조건부 렌더링. */
  getPlatform?: () => Promise<StickerPlatformResult>;
  // ─── Phase 2B 시트 분할 (PRD §3.4.3) ───
  /** 시트 dimension 검증 — renderer가 grid size 선택 전 호출 */
  validateSheet?: (sourcePath: string) => Promise<{ width: number; height: number }>;
  /** 시트를 N×N으로 분할 → 미리보기 dataUrl + sessionId 반환 */
  splitSheet?: (
    sourcePath: string,
    gridSize: 2 | 3 | 4,
  ) => Promise<StickerSplitSheetResult>;
  /** 사용자가 선택한 셀들을 stickers/{id}.png로 저장 */
  commitSheetCells?: (
    sessionId: string,
    cells: ReadonlyArray<{ index: number; stickerId: string }>,
  ) => Promise<StickerCommitSheetCellsResult>;
  /** 분할 세션 취소 (모달 닫기 시) */
  cancelSheetSession?: (sessionId: string) => Promise<{ ok: boolean }>;
}

interface ElectronAPI {
  readData: (filename: string) => Promise<string | null>;
  writeData: (filename: string, data: string) => Promise<void>;
  removeData: (filename: string) => Promise<void>;
  setAlwaysOnTop: (flag: boolean) => Promise<void>;
  setWidget: (options: {
    width: number;
    height: number;
    transparent: boolean;
    opacity: number;
    alwaysOnTop: boolean;
  }) => Promise<void>;
  toggleWidget: () => Promise<void>;
  setOpacity: (value: number) => Promise<void>;
  setWidgetLayout: (mode: string) => Promise<void>;
  applyWidgetSettings: (widget: {
    opacity: number;
    desktopMode: string;
  }) => Promise<void>;
  closeWindow: () => Promise<void>;
  showSaveDialog: (options: {
    title: string;
    defaultPath: string;
    filters: { name: string; extensions: string[] }[];
  }) => Promise<string | null>;
  writeFile: (filePath: string, data: ArrayBuffer | string) => Promise<void>;
  printToPDF: (
    options?: {
      pageSize?:
        | 'A3'
        | 'A4'
        | 'A5'
        | 'Letter'
        | 'Legal'
        | 'Tabloid'
        | { width: number; height: number };
      landscape?: boolean;
      marginsType?: 0 | 1 | 2;
    },
  ) => Promise<ArrayBuffer | null>;
  openFile: (filePath: string) => Promise<void>;
  importAlarmAudio: () => Promise<{ name: string; dataUrl: string } | null>;
  importFont: () => Promise<{ name: string; dataUrl: string; mimeType: string } | null>;
  importShareFile: () => Promise<{ content: string | ArrayBuffer; fileType: 'ssampin' | 'xlsx' } | null>;
  importBookmarksFile: () => Promise<{ content: string; format: 'json' | 'html' } | null>;
  /** 클립보드 텍스트 읽기 — 렌더러 navigator.clipboard 권한 우회 (Electron 메인 프로세스 경유) */
  readClipboardText: () => Promise<string>;
  onFileOpened: (callback: (filePath: string) => void) => () => void;
  openExternal: (url: string) => Promise<void>;
  openPath: (folderPath: string) => Promise<string>;
  showOpenDialog: (options: {
    title?: string;
    properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>;
    filters?: { name: string; extensions: string[] }[];
  }) => Promise<{ canceled: boolean; filePaths: string[] }>;
  fetchCalendarUrl: (url: string) => Promise<string | null>;
  // Auto-update
  checkForUpdate: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  onUpdateAvailable: (callback: (info: { version: string; releaseNotes?: string }) => void) => () => void;
  onUpdateDownloadProgress: (callback: (progress: { percent: number }) => void) => () => void;
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => () => void;
  onUpdateNotAvailable: (callback: () => void) => () => void;
  onUpdateError: (callback: (error: string) => void) => () => void;
  // Cross-window navigation
  navigateToPage: (page: string) => Promise<void>;
  onNavigateToPage: (callback: (page: string) => void) => () => void;
  // Google OAuth
  startOAuth: (authUrl: string) => Promise<string>;
  cancelOAuth: () => Promise<void>;
  onOAuthRedirectUri: (callback: (uri: string) => void) => () => void;
  onOAuthError: (callback: (error: { code: string; message: string }) => void) => () => void;
  // OAuth 콜백 미수신 → PKCE 폴백 제안
  onOAuthFallbackNeeded: (callback: (data: { reason: string; message: string; elapsedSec: number }) => void) => () => void;
  // Google OAuth PKCE 폴백 (로컬 서버 실패 시)
  startPKCEAuth: (authUrl: string) => Promise<{ verifier: string }>;
  exchangePKCECode: () => Promise<string>;
  // Secure Storage
  secureWrite: (key: string, value: string) => Promise<void>;
  secureRead: (key: string) => Promise<string | null>;
  secureDelete: (key: string) => Promise<void>;
  // Network status
  onNetworkChange: (callback: (online: boolean) => void) => () => void;
  // Live Vote
  startLiveVote: (data: {
    question: string;
    options: { id: string; text: string; color: string }[];
  }) => Promise<{ port: number; localIPs: string[] }>;
  stopLiveVote: () => Promise<void>;
  onLiveVoteStudentVoted: (callback: (data: { optionId: string; totalVoters: number }) => void) => () => void;
  onLiveVoteConnectionCount: (callback: (data: { count: number }) => void) => () => void;
  // Live Vote Tunnel
  tunnelAvailable: () => Promise<boolean>;
  tunnelInstall: () => Promise<void>;
  tunnelStart: () => Promise<{ tunnelUrl: string }>;
  // Live Survey
  startLiveSurvey: (data: {
    question: string;
    maxLength: number;
  }) => Promise<{ port: number; localIPs: string[] }>;
  stopLiveSurvey: () => Promise<void>;
  surveyTunnelAvailable: () => Promise<boolean>;
  surveyTunnelInstall: () => Promise<void>;
  surveyTunnelStart: () => Promise<{ tunnelUrl: string }>;
  onLiveSurveyStudentSubmitted: (callback: (data: { text: string; totalResponders: number }) => void) => () => void;
  onLiveSurveyConnectionCount: (callback: (data: { count: number }) => void) => () => void;
  // Realtime Wall
  startRealtimeWall: (data: {
    title: string;
    maxTextLength: number;
  }) => Promise<{ port: number; localIPs: string[] }>;
  stopRealtimeWall: () => Promise<void>;
  realtimeWallTunnelAvailable: () => Promise<boolean>;
  realtimeWallTunnelInstall: () => Promise<void>;
  realtimeWallTunnelStart: () => Promise<{ tunnelUrl: string }>;
  fetchRealtimeWallLinkPreview: (
    url: string,
  ) => Promise<import('./domain/entities/RealtimeWall').RealtimeWallLinkPreviewOgMeta | null>;
  /** 도메인 중립적 OG 메타 파싱 — 북마크 등에서 사용. fetchRealtimeWallLinkPreview와 동일 IPC. */
  fetchLinkPreview: (
    url: string,
  ) => Promise<import('./domain/entities/RealtimeWall').RealtimeWallLinkPreviewOgMeta | null>;
  /**
   * v1.14 P1 — 교사 → 학생 broadcast.
   * Design §7.2 신규 IPC 채널. BroadcastableServerMessage 구조는
   * `src/usecases/realtimeWall/BroadcastWallState.ts`의 discriminated union 참조.
   *
   * P2에서 like-toggled / comment-added / comment-removed 메시지 3종 추가.
   */
  broadcastRealtimeWall?: (
    msg: import('./usecases/realtimeWall/BroadcastWallState').BroadcastableServerMessage,
  ) => Promise<void>;
  /**
   * v1.14 P2 — 교사가 학생 댓글 삭제 (status='hidden' 전환).
   */
  removeRealtimeWallComment?: (args: { postId: string; commentId: string }) => Promise<void>;
  /**
   * v1.14 P3 — 교사가 학생 카드 추가 잠금 토글.
   * Main 세션 플래그를 갱신하고 모든 연결된 학생에게 `student-form-locked` broadcast.
   */
  setRealtimeWallStudentFormLocked?: (locked: boolean) => Promise<void>;
  /**
   * v2.1 신규 (Phase B) — 학생 PDF 업로드 (Plan §7.2 결정 #7 / Design v2.1 §7.1).
   * Renderer → Main → magic byte 검증 → 임시 디렉토리 저장 → file:// URL 반환.
   */
  uploadRealtimeWallPdf?: (
    bytes: Uint8Array,
    filename: string,
  ) => Promise<{ fileUrl: string; filename: string }>;
  /**
   * v2.1 student-ux 회귀 fix (2026-04-24): 서버가 createWallPost로 만든 RealtimeWallPost
   * 전체를 그대로 전달. renderer는 setPosts에 merge만 (id 중복 시 skip).
   * 이전 v2.1 phase B는 RealtimeWallSubmission(부분 필드) 전달이었으나, renderer가
   * createWallPost 호출 시 images/pdf/color 등을 누락한 채 input 작성하여 첨부 유실 발생.
   */
  onRealtimeWallStudentSubmitted: (callback: (data: {
    post: import('./domain/entities/RealtimeWall').RealtimeWallPost & {
      // v2.1 student-ux — Padlet 컬럼별 + 버튼 진입 시 columnId (post 자체에는 없지만 호환)
      columnId?: string;
    };
    totalSubmissions: number;
  }) => void) => () => void;
  onRealtimeWallConnectionCount: (callback: (data: { count: number }) => void) => () => void;
  /**
   * v1.14 P2 — 학생 좋아요 도착 알림 (서버 → 교사 renderer).
   */
  onRealtimeWallStudentLike?: (callback: (data: {
    postId: string;
    likes: number;
    likedBy: readonly string[];
  }) => void) => () => void;
  /**
   * v1.14 P2 — 학생 댓글 도착 알림 (서버 → 교사 renderer).
   */
  onRealtimeWallStudentComment?: (callback: (data: {
    postId: string;
    comment: import('./domain/entities/RealtimeWall').RealtimeWallComment;
  }) => void) => () => void;
  /**
   * v2.1 Phase D — 교사가 학생 placeholder 카드 복원.
   */
  restoreRealtimeWallCard?: (args: { postId: string }) => Promise<void>;
  /**
   * v2.1 Phase D — 학생 자기 카드 수정 도착 알림 (서버 → 교사 renderer).
   */
  onRealtimeWallStudentEdit?: (callback: (data: {
    postId: string;
    post: import('./domain/entities/RealtimeWall').RealtimeWallPost;
  }) => void) => () => void;
  /**
   * v2.1 Phase D — 학생 자기 카드 삭제(soft delete) 도착 알림.
   */
  onRealtimeWallStudentDelete?: (callback: (data: { postId: string }) => void) => () => void;
  /**
   * v2.1 Phase D — 닉네임 변경 broadcast 도착 알림.
   */
  onRealtimeWallNicknameChanged?: (callback: (data: {
    postIds: readonly string[];
    newNickname: string;
  }) => void) => () => void;
  /**
   * v2.1 Phase C — 학생 자기 카드 위치 변경(submit-move) 도착 알림.
   *
   * 결함 fix (2026-04-26): 이 채널이 preload에 빠져 있어 학생 드래그 후
   * 부분 업데이트(좋아요·댓글·삭제 등)가 도착하면 교사 renderer의 stale
   * `posts` state가 wall-state로 다시 broadcast되어 카드가 원래 위치로
   * 되돌아가는 회귀가 발생. 본 핸들러로 교사 state를 학생 이동 즉시
   * 동기화한다.
   */
  onRealtimeWallStudentMove?: (callback: (data: {
    postId: string;
    post: import('./domain/entities/RealtimeWall').RealtimeWallPost;
  }) => void) => () => void;
  // Live Multi Survey
  startLiveMultiSurvey: (data: {
    questions: Array<{
      id: string;
      type: 'single-choice' | 'multi-choice' | 'text' | 'scale';
      question: string;
      required: boolean;
      options?: Array<{ id: string; text: string }>;
      scaleMin?: number;
      scaleMax?: number;
      scaleMinLabel?: string;
      scaleMaxLabel?: string;
      maxLength?: number;
    }>;
    stepMode?: boolean;
  }) => Promise<{ port: number; localIPs: string[] }>;
  stopLiveMultiSurvey: () => Promise<void>;
  multiSurveyTunnelAvailable: () => Promise<boolean>;
  multiSurveyTunnelInstall: () => Promise<void>;
  multiSurveyTunnelStart: () => Promise<{ tunnelUrl: string }>;
  onLiveMultiSurveyStudentSubmitted: (callback: (data: { answers: Array<{ questionId: string; value: string | string[] | number }>; submissionId: string; totalSubmissions: number }) => void) => () => void;
  onLiveMultiSurveyConnectionCount: (callback: (data: { count: number }) => void) => () => void;
  // Live Multi Survey — step mode controls
  liveMultiSurveyActivateSession: () => Promise<void>;
  liveMultiSurveyReveal: () => Promise<void>;
  liveMultiSurveyAdvance: () => Promise<void>;
  liveMultiSurveyPrev: () => Promise<void>;
  liveMultiSurveyReopen: () => Promise<void>;
  liveMultiSurveyEndSession: () => Promise<void>;
  // Live Multi Survey — step mode events
  onLiveMultiSurveyStudentAnswered: (callback: (data: {
    sessionId: string;
    nickname: string;
    questionIndex: number;
    totalAnswered: number;
    totalConnected: number;
    aggregatedPreview: AggregatedResult | null;
  }) => void) => () => void;
  onLiveMultiSurveyPhaseChanged: (callback: (data: {
    phase: 'lobby' | 'open' | 'revealed' | 'ended';
    currentQuestionIndex: number;
    totalAnswered: number;
    totalConnected: number;
    aggregated?: AggregatedResult;
  }) => void) => () => void;
  onLiveMultiSurveyRoster: (callback: (data: {
    roster: Array<{ sessionId: string; nickname: string; answeredQuestions: number[] }>;
  }) => void) => () => void;
  onLiveMultiSurveyTextAnswerDetail: (callback: (data: {
    questionIndex: number;
    entries: Array<{ sessionId: string; nickname: string; text: string }>;
  }) => void) => () => void;
  // Live Word Cloud
  startLiveWordCloud: (data: {
    question: string;
    maxSubmissions: number;
  }) => Promise<{ port: number; localIPs: string[] }>;
  stopLiveWordCloud: () => Promise<void>;
  onLiveWordCloudWordSubmitted: (callback: (data: { word: string; count: number; totalWords: number }) => void) => () => void;
  onLiveWordCloudConnectionCount: (callback: (data: { count: number }) => void) => () => void;
  // Live Word Cloud Tunnel
  wordcloudTunnelAvailable: () => Promise<boolean>;
  wordcloudTunnelInstall: () => Promise<void>;
  wordcloudTunnelStart: () => Promise<{ tunnelUrl: string }>;
  // Live Discussion (Value Line / Traffic Light)
  startDiscussion: (config: { toolType: string; topics: string[] }) => Promise<{ port: number; localIPs: string[] }>;
  stopDiscussion: () => Promise<void>;
  discussionNextRound: () => Promise<void>;
  discussionGetState: () => Promise<{
    toolType: string;
    topics: string[];
    currentRound: number;
    students: Array<{ id: string; name: string; emoji: string; avatarColor: string; connected: boolean; position: number; signal: string }>;
    chats: Array<{ name: string; emoji: string; avatarColor: string; text: string; time: string }>;
  } | null>;
  onDiscussionConnectionCount: (callback: (count: number) => void) => () => void;
  onDiscussionState: (callback: (state: {
    students: Array<{ id: string; name: string; emoji: string; avatarColor: string; connected: boolean; position: number; signal: string }>;
    chats: Array<{ name: string; emoji: string; avatarColor: string; text: string; time: string }>;
  }) => void) => () => void;
  onDiscussionChat: (callback: (chat: { name: string; emoji: string; avatarColor: string; text: string; time: string }) => void) => () => void;
  // Discussion Tunnel
  discussionTunnelAvailable: () => Promise<boolean>;
  discussionTunnelInstall: () => Promise<void>;
  discussionTunnelStart: () => Promise<{ tunnelUrl: string }>;
  // Widget 리사이즈 (JS 기반, thickFrame: false 대응)
  resizeWidget: (edge: string, dx: number, dy: number) => Promise<void>;
  // Analytics
  onAnalyticsFlush: (callback: () => void) => () => void;
  // Close action dialog
  onCloseActionAsk: (callback: () => void) => () => void;
  respondCloseAction: (action: 'widget' | 'tray') => void;
  // Cross-window data sync
  onDataChanged: (callback: (filename: string) => void) => () => void;
  // 절전/잠금 복귀 알림
  onSystemResume?: (callback: () => void) => () => void;
  // 메모리 진단
  getMemoryMetrics?: () => Promise<{
    totalBytes: number;
    processes: Array<{ type: string; pid: number; memoryBytes: number; name?: string }>;
  }>;

  // === 서식 관리 (forms) — Phase 1 바이너리 IPC ===
  forms?: {
    writeBinary: (relPath: string, bytes: ArrayBuffer) => Promise<void>;
    readBinary: (relPath: string) => Promise<ArrayBuffer | null>;
    removeBinary: (relPath: string) => Promise<void>;
    listBinary: (dirRelPath: string) => Promise<string[]>;
    openFile: (relPath: string) => Promise<void>;
    /** PDF 전용: Electron 내장 PDF 뷰어로 로드 후 OS 인쇄 대화상자 표시 */
    printPdf: (relPath: string) => Promise<void>;
  };

  // === 협업 보드 (collab-board) — Design §4.1 ===
  collabBoard?: {
    list: () => Promise<CollabBoardMeta[]>;
    create: (args: { name?: string }) => Promise<CollabBoardMeta>;
    rename: (args: { id: string; name: string }) => Promise<CollabBoardMeta>;
    delete: (args: { id: string }) => Promise<{ ok: true }>;
    startSession: (args: { id: string }) => Promise<CollabBoardSessionStart>;
    endSession: (args: { id: string; forceSave: boolean }) => Promise<{ ok: true }>;
    getActiveSession: () => Promise<CollabBoardSessionStart | null>;
    saveSnapshot: (args: { id: string }) => Promise<{ savedAt: number }>;
    tunnelAvailable: () => Promise<{ available: boolean }>;
    tunnelInstall: () => Promise<{ ok: true }>;

    onParticipantChange: (cb: (data: { boardId: string; names: string[] }) => void) => () => void;
    onAutoSave: (cb: (data: { boardId: string; savedAt: number }) => void) => () => void;
    onSessionError: (cb: (data: { boardId: string; reason: string }) => void) => () => void;
    onSessionStarted: (cb: (data: CollabBoardSessionStart) => void) => () => void;
  };

  // === 글로벌 퀵애드 단축키 ===
  syncShortcuts?: (config: {
    globalEnabled: boolean;
    bindings: Array<{ id: string; combo: string; enabled: boolean }>;
  }) => Promise<{ registered: string[]; failed: string[] }>;
  onShortcutTriggered?: (callback: (commandId: string) => void) => () => void;

  // === 실시간 담벼락 영속 보드 (v1.13 Stage A) ===
  // Design §3.4 — 5 channels (Main-side direct fs access).
  wallBoards?: {
    listMeta: () => Promise<unknown[]>;
    load: (args: { id: string }) => Promise<unknown | null>;
    save: (args: { board: unknown }) => Promise<{ savedAt: number }>;
    delete: (args: { id: string }) => Promise<{ ok: true }>;
    getByCode: (args: { shortCode: string }) => Promise<unknown | null>;
    stageDirty: (args: { board: unknown }) => Promise<{ ok: true }>;
    clearDirty: (args: { id: string }) => Promise<{ ok: true }>;
  };

  // === 내 이모티콘 (Sticker picker — PRD §4.1) ===
  // 시그니처는 본 파일 상단 StickerElectronAPI에 직접 정의되어 있다.
  // declaration merging 대신 단일 소스로 관리한다.
  sticker?: StickerElectronAPI;
}

/** 협업 보드 메타데이터 (Board 엔티티의 renderer-facing 뷰) */
interface CollabBoardMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  lastSessionEndedAt: number | null;
  participantHistory: string[];
  hasSnapshot: boolean;
}

/** 세션 시작 결과 (BoardSessionStartResult) */
interface CollabBoardSessionStart {
  boardId: string;
  publicUrl: string;
  sessionCode: string;
  authToken: string;
  qrDataUrl: string;
  startedAt: number;
}

interface Window {
  electronAPI?: ElectronAPI;
}

declare const __APP_VERSION__: string;
