/** 단일/복수 선택 집계 */
type AggregatedSingleMulti = { counts: Record<string, number>; total: number };
/** 스케일 집계 */
type AggregatedScale = { avg: number; distribution: Record<number, number>; total: number };
/** 주관식 집계 (무기명) */
type AggregatedText = { answers: string[] };
/** 집계 결과 discriminated union */
type AggregatedResult = AggregatedSingleMulti | AggregatedScale | AggregatedText;

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
  onRealtimeWallStudentSubmitted: (callback: (data: {
    post: {
      id: string;
      nickname: string;
      text: string;
      linkUrl?: string;
      submittedAt: number;
    };
    totalSubmissions: number;
  }) => void) => () => void;
  onRealtimeWallConnectionCount: (callback: (data: { count: number }) => void) => () => void;
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
