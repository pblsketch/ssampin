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
  importImage: (stickerId: string, sourcePath: string) => Promise<StickerImportImageResult>;
  getImageDataUrl: (stickerId: string) => Promise<string | null>;
  deleteImage: (stickerId: string) => Promise<void>;
  /** 다중 이모티콘 PNG를 ZIP 한 파일로 내보내기 (사용자 저장 다이얼로그 표시). */
  exportZip?: (items: ReadonlyArray<{ stickerId: string; filename: string }>) => Promise<{
    canceled: boolean;
    filePath?: string;
    count?: number;
    missing?: number;
  }>;
  paste: (
    stickerId: string,
    restorePreviousClipboard: boolean,
    flattenAlphaOnPaste?: boolean,
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
  /**
   * 자동 Ctrl+V/Cmd+V 실패(autoPasted=false) 시 메인 윈도우에서 토스트로
   * "수동 붙여넣기 안내"를 표시하기 위한 이벤트 구독.
   * 피커 윈도우는 paste 직후 hide되어 피커 측 토스트가 보이지 않으므로
   * MainApp에서 본 리스너를 등록해 사용자에게 안내한다.
   */
  onFallbackPasteNeeded?: (cb: (data: { reason: string }) => void) => () => void;
  /** sticker:paste 진단 로그 forwarding — DevTools Console에서 흐름 추적용. */
  onDiagLog?: (cb: (payload: { message: string; data: unknown }) => void) => () => void;
  /** 현재 OS 플랫폼 — 렌더러가 macOS 전용 UI를 조건부 렌더링. */
  getPlatform?: () => Promise<StickerPlatformResult>;
  // ─── Phase 2B 시트 분할 (PRD §3.4.3) ───
  /** 시트 dimension 검증 — renderer가 grid size 선택 전 호출 */
  validateSheet?: (sourcePath: string) => Promise<{ width: number; height: number }>;
  /** 시트를 N×N으로 분할 → 미리보기 dataUrl + sessionId 반환 */
  splitSheet?: (sourcePath: string, gridSize: 2 | 3 | 4) => Promise<StickerSplitSheetResult>;
  /** 사용자가 선택한 셀들을 stickers/{id}.png로 저장 */
  commitSheetCells?: (
    sessionId: string,
    cells: ReadonlyArray<{ index: number; stickerId: string }>,
  ) => Promise<StickerCommitSheetCellsResult>;
  /** 분할 세션 취소 (모달 닫기 시) */
  cancelSheetSession?: (sessionId: string) => Promise<{ ok: boolean }>;
}

type AiBridgeClient = 'claude' | 'codex' | 'antigravity';
interface AiBridgeRegisterResult {
  ok: boolean;
  client: AiBridgeClient;
  registered: boolean;
  /** codex CLI 미설치 — 사용자가 직접 실행할 명령(command) 안내 */
  cliMissing?: boolean;
  command?: string;
  error?: string;
}
interface AiBridgeStatus {
  client: AiBridgeClient;
  /** true=등록됨, false=미등록, null=확인 불가(codex) */
  registered: boolean | null;
}
interface AiBridgePaths {
  serverExists: boolean;
}
interface AiBridgeElectronAPI {
  register: (
    client: AiBridgeClient,
    opts?: { allowContent?: boolean; allowWrite?: boolean },
  ) => Promise<AiBridgeRegisterResult>;
  status: (client: AiBridgeClient) => Promise<AiBridgeStatus>;
  statusAll: () => Promise<AiBridgeStatus[]>;
  paths: () => Promise<AiBridgePaths>;
  /** 게이트 토글(읽기/쓰기/채점쓰기/생기부쓰기) 즉시 capability 기록 — 부분 갱신, 쓰기 계열이 켜지면 서버 시작/정지(#11). */
  setCapability: (partial: {
    allowWrite?: boolean;
    allowContent?: boolean;
    allowGradeWrite?: boolean;
    allowRecordWrite?: boolean;
  }) => Promise<AiBridgeCapabilityStatus>;
  /** 하위호환: 쓰기 허용 토글(= setCapability({ allowWrite })). */
  setLiveSync: (enabled: boolean) => Promise<{ running: boolean }>;
  liveSyncStatus: () => Promise<AiBridgeCapabilityStatus>;
  /** main → 렌더러 쓰기 위임 수신. handler(req)→결과. cleanup 반환. */
  onApplyWrite: (handler: (req: unknown) => Promise<unknown>) => () => void;
}

interface AiBridgeCapabilityStatus {
  running: boolean;
  allowWrite: boolean;
  allowContent: boolean;
  allowGradeWrite: boolean;
  allowRecordWrite: boolean;
}

interface ElectronAPI {
  readData: (filename: string) => Promise<string | null>;
  writeData: (filename: string, data: string) => Promise<void>;
  removeData: (filename: string) => Promise<void>;
  aiBridge: AiBridgeElectronAPI;
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
  /**
   * Phase 7-G — native-desktop hover 시 main process가 globalShortcut(Ctrl+1~4)으로
   * layout mode 변경을 신호 송신. 콜백을 등록하면 mode('full'|'split-h'|'split-v'|'quad')를 받음.
   * 반환값은 구독 해제 함수 (cleanup 시 호출 권장).
   */
  onLayoutShortcut?: (cb: (mode: string) => void) => () => void;
  requestModalEscape?: () => Promise<void>;
  releaseModalEscape?: () => Promise<void>;
  onModalEscape?: (cb: () => void) => () => void;
  requestModalInput?: () => Promise<void>;
  releaseModalInput?: () => Promise<void>;
  applyWidgetSettings: (widget: { opacity: number; desktopMode: string }) => Promise<void>;
  /**
   * Phase 7-C (native-desktop) — widget 헤더 드래그 영역 등록.
   * mount/resize 시 호출. 빈 배열이면 drag 비활성화.
   *
   * Phase 7-C 회귀 fix: excludeRects는 drag 영역 내부에서 제외할 사각형(헤더 우측 버튼 그룹 등).
   */
  setWidgetHeaderRegion?: (
    rects: { x: number; y: number; width: number; height: number }[],
    excludeRects?: { x: number; y: number; width: number; height: number }[],
  ) => Promise<void>;
  /**
   * Phase 7-D (native-desktop) — widget 8개 resize edge DIP rect 등록.
   * mount/resize 시 호출. 빈 배열이면 resize 비활성화.
   * 일반/topmost 모드에서는 noop manager가 받으므로 무영향(renderer는 모드 분기 없이 매번 호출 가능).
   */
  setWidgetResizeRegion?: (
    regions: {
      edge:
        | 'top'
        | 'bottom'
        | 'left'
        | 'right'
        | 'top-left'
        | 'top-right'
        | 'bottom-left'
        | 'bottom-right';
      dipRect: { x: number; y: number; width: number; height: number };
    }[],
  ) => Promise<void>;
  /**
   * 바탕화면 아이콘 아래 모드 fallback 수신 (v2.1.0~).
   * native attach 실패 시 main이 모드를 fallbackMode로 정정하며 이 콜백이 호출된다.
   * renderer는 토스트 표시 + settings store에 fallbackMode 반영을 책임진다.
   */
  onDesktopModeFallback: (
    callback: (info: { reason: string; fallbackMode: 'normal' | 'topmost' }) => void,
  ) => () => void;
  /**
   * native-desktop / widget 진단 로그 forwarding (디버깅용 — G1 게이트 단계 임시).
   * Main process console + 파일 + IPC 3-way fanout 중 IPC 측 수신.
   * App.tsx의 useNativeDesktopDiagListener hook이 마운트하여 DevTools 콘솔에 출력한다.
   *
   * 디버깅 종료 후 본 채널 + helper 모듈 일괄 제거 예정.
   */
  onNativeDesktopDiag?: (
    callback: (payload: { message: string; args?: unknown[] }) => void,
  ) => () => void;
  /**
   * 진단 라운드 (2026-05-06) — 이슈 B/D 분석용 종합 dump 트리거.
   *
   * DevTools 콘솔에서 `await electronAPI.widgetDiagDump('label')` 호출 시
   * main process가 디스플레이/widget/WorkerW/Win32 state/routingStats를 한꺼번에
   * `native-desktop-diag.log`에 기록한다. label은 시나리오 식별용 자유 문자열.
   */
  widgetDiagDump?: (label: string) => Promise<void>;
  closeWindow: () => Promise<void>;
  // ─── 아이콘 모드 (v2.0.2~) ───
  iconShow: () => Promise<void>;
  iconHide: () => Promise<void>;
  iconSetBounds: (bounds: { x: number; y: number }) => Promise<void>;
  iconDragBy: (delta: { dx: number; dy: number }) => Promise<void>;
  iconStartDrag: () => Promise<void>;
  iconEndDrag: () => Promise<void>;
  iconResetPosition: () => Promise<void>;
  iconExpand: (target: { to: 'main' | 'widget' | 'restore' }) => Promise<void>;
  iconDiag: (payload: { event: string; data?: unknown }) => Promise<void>;
  /** 아이콘 창 확장/축소 (v2.2.7) — 말풍선·팝오버·메뉴 공간 확보 */
  iconSetExpanded: (
    expanded: boolean,
  ) => Promise<{ expanded: boolean; anchor: { up: boolean; right: boolean } }>;
  /** 확장 상태에서 빈 영역 클릭을 아래 창으로 통과시킬지 토글 */
  iconSetMouseIgnore: (ignore: boolean) => Promise<void>;
  onIconLayout: (
    callback: (layout: { expanded: boolean; anchor: { up: boolean; right: boolean } }) => void,
  ) => () => void;
  onIconShown: (callback: () => void) => () => void;
  /** 저장 대화상자. 경로 대신 1회용 handle + 표시용 fileName 반환. */
  showSaveDialog: (options: {
    title: string;
    defaultPath: string;
    filters: { name: string; extensions: string[] }[];
  }) => Promise<{ handle: string; fileName: string } | null>;
  /** showSaveDialog 가 준 handle 로 파일 쓰기 (1회 소비). */
  writeFile: (handle: string, data: ArrayBuffer | string) => Promise<void>;
  printToPDF: (options?: {
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
  }) => Promise<ArrayBuffer | null>;
  /** showSaveDialog 가 준 handle 로 방금 저장한 파일 열기 (소비하지 않음). */
  openFile: (handle: string) => Promise<void>;
  importAlarmAudio: () => Promise<{ name: string; dataUrl: string } | null>;
  importFont: () => Promise<{ name: string; dataUrl: string; mimeType: string } | null>;
  importShareFile: () => Promise<{
    content: string | ArrayBuffer;
    fileType: 'ssampin' | 'xlsx';
  } | null>;
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
  onUpdateAvailable: (
    callback: (info: { version: string; releaseNotes?: string }) => void,
  ) => () => void;
  onUpdateDownloadProgress: (callback: (progress: { percent: number }) => void) => () => void;
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => () => void;
  onUpdateNotAvailable: (callback: () => void) => () => void;
  onUpdateError: (callback: (error: string) => void) => () => void;
  // Cross-window navigation
  navigateToPage: (page: string) => Promise<void>;
  onNavigateToPage: (callback: (page: string) => void) => () => void;
  // Google OAuth — {code, redirectUri, codeVerifier} 묶음 반환 (Desktop app 클라이언트는 PKCE 로 교환)
  startOAuth: (
    authUrl: string,
  ) => Promise<{ code: string; redirectUri: string; codeVerifier: string }>;
  cancelOAuth: () => Promise<void>;
  onOAuthRedirectUri: (callback: (uri: string) => void) => () => void;
  onOAuthError: (callback: (error: { code: string; message: string }) => void) => () => void;
  // OAuth 콜백 미수신 → PKCE 폴백 제안
  onOAuthFallbackNeeded: (
    callback: (data: { reason: string; message: string; elapsedSec: number }) => void,
  ) => () => void;
  // Google OAuth PKCE 폴백 (로컬 서버 실패 시 — loopback 모드)
  startPKCEAuth: (authUrl: string) => Promise<{ verifier: string; redirectUri: string }>;
  exchangePKCECode: () => Promise<{ verifier: string; redirectUri: string }>;
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
  onLiveVoteStudentVoted: (
    callback: (data: { optionId: string; totalVoters: number }) => void,
  ) => () => void;
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
  onLiveSurveyStudentSubmitted: (
    callback: (data: { text: string; totalResponders: number }) => void,
  ) => () => void;
  onLiveSurveyConnectionCount: (callback: (data: { count: number }) => void) => () => void;
  // Realtime Wall
  startRealtimeWall: (data: {
    title: string;
    maxTextLength: number;
  }) => Promise<{ port: number; localIPs: string[] }>;
  stopRealtimeWall: () => Promise<void>;
  startClassroomAgreement: (data: {
    session: import('./domain/entities/ClassroomAgreement').ClassroomAgreementSession;
  }) => Promise<{ port: number; localIPs: string[] }>;
  stopClassroomAgreement: () => Promise<void>;
  classroomAgreementTunnelAvailable: () => Promise<boolean>;
  classroomAgreementTunnelInstall: () => Promise<void>;
  classroomAgreementTunnelStart: () => Promise<{ tunnelUrl: string }>;
  getClassroomAgreementState: () => Promise<
    import('./domain/entities/ClassroomAgreement').ClassroomAgreementSession | null
  >;
  setClassroomAgreementPhase: (data: {
    command: import('./domain/rules/classroomAgreementPhaseRules').ClassroomAgreementTeacherPhaseCommand;
  }) => Promise<{ phase: import('./domain/entities/ClassroomAgreement').ClassroomAgreementPhase }>;
  updateClassroomAgreementSession: (data: {
    session: import('./domain/entities/ClassroomAgreement').ClassroomAgreementSession;
  }) => Promise<void>;
  onClassroomAgreementEvent: (
    callback: (
      event:
        | import('./usecases/classroomAgreement/ClassroomAgreementRealtimeSession').ClassroomAgreementTeacherEvent
        | { type: 'connection-count'; count: number },
    ) => void,
  ) => () => void;
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
  onRealtimeWallStudentSubmitted: (
    callback: (data: {
      post: import('./domain/entities/RealtimeWall').RealtimeWallPost & {
        // v2.1 student-ux — Padlet 컬럼별 + 버튼 진입 시 columnId (post 자체에는 없지만 호환)
        columnId?: string;
      };
      totalSubmissions: number;
    }) => void,
  ) => () => void;
  onRealtimeWallConnectionCount: (callback: (data: { count: number }) => void) => () => void;
  /**
   * v1.14 P2 — 학생 좋아요 도착 알림 (서버 → 교사 renderer).
   */
  onRealtimeWallStudentLike?: (
    callback: (data: { postId: string; likes: number; likedBy: readonly string[] }) => void,
  ) => () => void;
  /**
   * v1.14 P2 — 학생 댓글 도착 알림 (서버 → 교사 renderer).
   */
  onRealtimeWallStudentComment?: (
    callback: (data: {
      postId: string;
      comment: import('./domain/entities/RealtimeWall').RealtimeWallComment;
    }) => void,
  ) => () => void;
  /**
   * v2.1 Phase D — 교사가 학생 placeholder 카드 복원.
   */
  restoreRealtimeWallCard?: (args: { postId: string }) => Promise<void>;
  /**
   * v2.1 Phase D — 학생 자기 카드 수정 도착 알림 (서버 → 교사 renderer).
   */
  onRealtimeWallStudentEdit?: (
    callback: (data: {
      postId: string;
      post: import('./domain/entities/RealtimeWall').RealtimeWallPost;
    }) => void,
  ) => () => void;
  /**
   * v2.1 Phase D — 학생 자기 카드 삭제(soft delete) 도착 알림.
   */
  onRealtimeWallStudentDelete?: (callback: (data: { postId: string }) => void) => () => void;
  /**
   * v2.1 Phase D — 닉네임 변경 broadcast 도착 알림.
   */
  onRealtimeWallNicknameChanged?: (
    callback: (data: { postIds: readonly string[]; newNickname: string }) => void,
  ) => () => void;
  /**
   * v2.1 Phase C — 학생 자기 카드 위치 변경(submit-move) 도착 알림.
   *
   * 결함 fix (2026-04-26): 이 채널이 preload에 빠져 있어 학생 드래그 후
   * 부분 업데이트(좋아요·댓글·삭제 등)가 도착하면 교사 renderer의 stale
   * `posts` state가 wall-state로 다시 broadcast되어 카드가 원래 위치로
   * 되돌아가는 회귀가 발생. 본 핸들러로 교사 state를 학생 이동 즉시
   * 동기화한다.
   */
  onRealtimeWallStudentMove?: (
    callback: (data: {
      postId: string;
      post: import('./domain/entities/RealtimeWall').RealtimeWallPost;
    }) => void,
  ) => () => void;
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
  onLiveMultiSurveyStudentSubmitted: (
    callback: (data: {
      answers: Array<{ questionId: string; value: string | string[] | number }>;
      submissionId: string;
      totalSubmissions: number;
    }) => void,
  ) => () => void;
  onLiveMultiSurveyConnectionCount: (callback: (data: { count: number }) => void) => () => void;
  // Live Multi Survey — step mode controls
  liveMultiSurveyActivateSession: () => Promise<void>;
  liveMultiSurveyReveal: () => Promise<void>;
  liveMultiSurveyAdvance: () => Promise<void>;
  liveMultiSurveyPrev: () => Promise<void>;
  liveMultiSurveyReopen: () => Promise<void>;
  liveMultiSurveyEndSession: () => Promise<void>;
  // Live Multi Survey — step mode events
  onLiveMultiSurveyStudentAnswered: (
    callback: (data: {
      sessionId: string;
      nickname: string;
      questionIndex: number;
      totalAnswered: number;
      totalConnected: number;
      aggregatedPreview: AggregatedResult | null;
      /** 학생 답변 원본 (stepMode v2 콘솔 정답 판정용 — v1 UI는 무시) */
      answer?: { optionIds?: string[]; text?: string; scale?: number };
    }) => void,
  ) => () => void;
  onLiveMultiSurveyPhaseChanged: (
    callback: (data: {
      phase: 'lobby' | 'open' | 'revealed' | 'ended';
      currentQuestionIndex: number;
      totalAnswered: number;
      totalConnected: number;
      aggregated?: AggregatedResult;
    }) => void,
  ) => () => void;
  onLiveMultiSurveyRoster: (
    callback: (data: {
      roster: Array<{ sessionId: string; nickname: string; answeredQuestions: number[] }>;
    }) => void,
  ) => () => void;
  onLiveMultiSurveyTextAnswerDetail: (
    callback: (data: {
      questionIndex: number;
      entries: Array<{ sessionId: string; nickname: string; text: string }>;
    }) => void,
  ) => () => void;
  // DN-03: 학생 wave 이벤트 수신 (교사 콘솔 아바타 pulse)
  onLiveMultiSurveyStudentWave: (
    callback: (data: { sessionId: string; studentId: string }) => void,
  ) => () => void;
  // DN-06: 교사 집중 모드 토글 → 학생 WebSocket broadcast
  liveMultiSurveyToggleFocusMode: (active: boolean) => Promise<void>;
  // 작업 1: MultiSurvey Share view (교실 화면 별도 창)
  openMultiSurveyShareWindow: (entryUrl: string) => Promise<void>;
  closeMultiSurveyShareWindow: () => Promise<void>;
  sendMultiSurveyShareSnapshot: (
    snapshot: import('./adapters/components/MultiSurvey/v2/Share/shareSnapshot').ShareSnapshot,
  ) => void;
  onMultiSurveyShareSnapshot: (
    callback: (
      snapshot: import('./adapters/components/MultiSurvey/v2/Share/shareSnapshot').ShareSnapshot,
    ) => void,
  ) => () => void;
  // Live Word Cloud
  startLiveWordCloud: (data: {
    question: string;
    maxSubmissions: number;
  }) => Promise<{ port: number; localIPs: string[] }>;
  stopLiveWordCloud: () => Promise<void>;
  onLiveWordCloudWordSubmitted: (
    callback: (data: { word: string; count: number; totalWords: number }) => void,
  ) => () => void;
  onLiveWordCloudConnectionCount: (callback: (data: { count: number }) => void) => () => void;
  // Live Word Cloud Tunnel
  wordcloudTunnelAvailable: () => Promise<boolean>;
  wordcloudTunnelInstall: () => Promise<void>;
  wordcloudTunnelStart: () => Promise<{ tunnelUrl: string }>;
  // Live Discussion (Value Line / Traffic Light)
  startDiscussion: (config: {
    toolType: string;
    topics: string[];
  }) => Promise<{ port: number; localIPs: string[] }>;
  stopDiscussion: () => Promise<void>;
  discussionNextRound: () => Promise<void>;
  discussionGetState: () => Promise<{
    toolType: string;
    topics: string[];
    currentRound: number;
    students: Array<{
      id: string;
      name: string;
      emoji: string;
      avatarColor: string;
      connected: boolean;
      position: number;
      signal: string;
    }>;
    chats: Array<{ name: string; emoji: string; avatarColor: string; text: string; time: string }>;
  } | null>;
  onDiscussionConnectionCount: (callback: (count: number) => void) => () => void;
  onDiscussionState: (
    callback: (state: {
      students: Array<{
        id: string;
        name: string;
        emoji: string;
        avatarColor: string;
        connected: boolean;
        position: number;
        signal: string;
      }>;
      chats: Array<{
        name: string;
        emoji: string;
        avatarColor: string;
        text: string;
        time: string;
      }>;
    }) => void,
  ) => () => void;
  onDiscussionChat: (
    callback: (chat: {
      name: string;
      emoji: string;
      avatarColor: string;
      text: string;
      time: string;
    }) => void,
  ) => () => void;
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
  respondCloseAction: (action: 'widget' | 'tray' | 'icon') => void;
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

  // === 마크다운 변환기 (markdown-convert) ===
  markdownConvert?: {
    /** 파일 선택 다이얼로그 + kordoc 파싱(로컬). 결과 마크다운만 반환(경로·원본 미노출). */
    pickAndParse: () => Promise<MarkdownConvertResult>;
    /** 다중 선택 → 각각 파싱(여러 문서 동시 변환). 취소 시 빈 배열. */
    pickAndParseMulti: () => Promise<MarkdownConvertResult[]>;
    /** 드롭한 파일 bytes → kordoc 파싱(로컬). */
    parseBuffer: (bytes: Uint8Array, fileName: string) => Promise<MarkdownConvertResult>;
    /** 개별 저장 — 각 파일을 개별 .md 로 묶은 ZIP 한 개로 저장(저장창 1회). */
    saveZip: (
      files: Array<{ name: string; text: string }>,
      zipName?: string,
    ) => Promise<MarkdownSaveZipResult>;
    /** 마크다운 → 한글(.hwpx) 1개 저장(kordoc markdownToHwpx, 데스크톱 전용). */
    saveHwpx: (markdown: string, suggestedName?: string) => Promise<MarkdownSaveZipResult>;
    /** 마크다운 여러 개 → 각 .hwpx 로 묶은 ZIP 1개 저장. */
    saveHwpxZip: (
      files: Array<{ name: string; markdown: string }>,
      zipName?: string,
    ) => Promise<MarkdownSaveZipResult>;
  };

  // === 내가 만든 앱(미니앱) 파일 저장 (miniapp) ===
  // 앱 HTML·아이콘을 <userData>/miniapps/<id>/ 로컬 파일로 저장/삭제/조회(데스크톱 전용).
  miniApp?: {
    /** 앱 HTML 저장 → index.html. */
    save: (id: string, html: Uint8Array) => Promise<void>;
    /** 이미지 아이콘 저장 → icon.<ext>. 저장된 파일명 반환. */
    saveIcon: (id: string, bytes: Uint8Array, ext: string) => Promise<string>;
    /** 앱 폴더 전체 삭제. */
    remove: (id: string) => Promise<void>;
    /** 디스크에 존재하는 앱 폴더 id 목록. */
    list: () => Promise<string[]>;
  };

  // === 학교 평가 운영계획 불러오기 (schoolinfo-evaluation) ===
  // 학교알리미 평가계획 hwp 자동 다운로드 + kordoc 파싱(메인, 로컬). 결과 markdown 만 반환.
  schoolinfoEvaluation?: {
    /** 학교명 전국 검색 → SHL_IDF_CD 확보(인증키 불필요). */
    searchSchools: (word: string) => Promise<SchoolinfoSearchResult>;
    /** 연도별 평가계획 첨부파일 목록(downloadParams 는 main 캐시 보관). */
    listDocs: (args: {
      shlIdfCd: string;
      schoolName: string;
      year: number;
      item?: 'evaluation' | 'curriculum';
    }) => Promise<SchoolinfoListResult>;
    /** 특정 첨부파일 다운로드 + kordoc 파싱 → markdown 반환. */
    downloadDoc: (args: {
      shlIdfCd: string;
      schoolName: string;
      year: number;
      seq: string;
      item?: 'evaluation' | 'curriculum';
    }) => Promise<SchoolinfoDownloadResult>;
  };

  // === 학교알리미 공시 조회 (schoolinfo-disclosure) ===
  schoolinfoDisclosure?: {
    getAreaDisclosure: (args: {
      apiKey: string;
      apiType: string;
      schulKndCode: string;
      sidoCode: string;
      sggCode: string;
      pbanYr: string;
    }) => Promise<
      { status: 'ok'; list: Array<Record<string, unknown>> } | { status: 'error'; message: string }
    >;
  };

  // === 컴시간알리미 (comcigan) — 교사 시간표 불러오기 ===
  // comci.net 은 CORS 미지원이라 메인이 바이트만 대신 fetch (파싱은 renderer).
  comcigan?: {
    fetchRaw: (
      path: string,
    ) => Promise<{ status: 'ok'; body: ArrayBuffer } | { status: 'error'; message: string }>;
  };

  // === 협업 보드 (collab-board) — Design §4.1 ===
  collabBoard?: {
    list: () => Promise<CollabBoardMeta[]>;
    create: (args: {
      name?: string;
      templateId?: string;
      userTemplateId?: string;
    }) => Promise<CollabBoardMeta>;
    /** PDCA-4 (G006): 내 템플릿 */
    userTemplateList: () => Promise<CollabBoardUserTemplateMeta[]>;
    userTemplateSave: (args: { id: string; name?: string }) => Promise<CollabBoardUserTemplateMeta>;
    userTemplateDelete: (args: { id: string }) => Promise<{ ok: true }>;
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

  // === 백업·복원·데이터 위치 센터 (v2.0.3+) ===
  // 외부 서버 전송 없음 — main 프로세스 fs/dialog/shell만 사용.
  backup?: BackupElectronAPI;

  // === Interactive Slides (Pear Deck 스타일, v2.2.x+) ===
  // Plan §3 + Design §5 매핑.
  interactiveSlides?: InteractiveSlidesElectronAPI;
}

// ─────────────────────────────────────────────────────────────
// Interactive Slides API surface
// ─────────────────────────────────────────────────────────────

/** slides-source:fetch-from-google 응답 */
interface InteractiveSlidesFetchResult {
  readonly revisionId: string;
  readonly slides: readonly {
    readonly pageId: string;
    readonly pageNumber: number;
    readonly imagePath: string;
  }[];
}

/** slides-source:render-pdf 입력 (renderer가 pdfjs로 미리 렌더한 PNG들) */
interface InteractiveSlidesRenderPdfArgs {
  readonly contentHash: string;
  readonly originalFileName: string;
  readonly originalSize: number;
  readonly pages: readonly {
    readonly pageId: string;
    readonly pngBytes: Uint8Array;
  }[];
}

/** slides-source:render-pdf 응답 */
interface InteractiveSlidesRenderPdfResult {
  readonly revisionId: string;
  readonly slides: readonly {
    readonly pageId: string;
    readonly pageNumber: number;
    readonly imagePath: string;
  }[];
}

/** slides-session:start 응답 */
interface InteractiveSlidesStartResult {
  readonly port: number;
  readonly sessionId: string;
  readonly shortCode: string;
}

/** Server → Teacher 메시지 (slides-session:teacher-event) */
type InteractiveSlidesTeacherEvent = {
  readonly sessionId: string;
  readonly message: import('./domain/ports/IRealtimeBroadcaster').ServerToTeacherMessage;
};

interface InteractiveSlidesElectronAPI {
  // Source
  fetchFromGoogle: (args: { url: string }) => Promise<InteractiveSlidesFetchResult>;
  /**
   * PDF 페이지 PNG들을 캐시에 저장 (renderer가 pdfjs-dist로 미리 렌더).
   * 응답은 Google Slides와 동일한 shape — UI 일관성 유지.
   */
  renderPdf: (args: InteractiveSlidesRenderPdfArgs) => Promise<InteractiveSlidesRenderPdfResult>;
  /** 로컬 IPv4 후보 (Plan §11.7 — VPN/다중 NIC 처리). 학생 폰 접속 URL 표시용. */
  getLocalIpCandidates: () => Promise<{ candidates: readonly string[] }>;

  // Session lifecycle
  startSession: (args: {
    lesson: import('./domain/entities/InteractiveSlides').InteractiveLesson;
    sessionName: string;
    accessMode: import('./domain/entities/InteractiveSlides').SessionAccessMode;
    resultsVisibility?: import('./domain/entities/InteractiveSlides').ResultsVisibility;
  }) => Promise<InteractiveSlidesStartResult>;
  beginPresentation: (args: {
    sessionId: import('./domain/valueObjects/InteractiveSlidesIds').SessionId;
  }) => Promise<void>;
  stopSession: () => Promise<void>;
  advanceSlide: (args: {
    sessionId: import('./domain/valueObjects/InteractiveSlidesIds').SessionId;
    targetIndex: number;
  }) => Promise<void>;
  activateOverlay: (args: {
    sessionId: import('./domain/valueObjects/InteractiveSlidesIds').SessionId;
    overlayId: import('./domain/valueObjects/InteractiveSlidesIds').OverlayId;
  }) => Promise<void>;
  deactivateOverlay: (args: {
    sessionId: import('./domain/valueObjects/InteractiveSlidesIds').SessionId;
    overlayId: import('./domain/valueObjects/InteractiveSlidesIds').OverlayId;
    visibility?: import('./domain/entities/InteractiveSlides').ResultsVisibility;
  }) => Promise<void>;
  endLesson: (args: {
    sessionId: import('./domain/valueObjects/InteractiveSlidesIds').SessionId;
  }) => Promise<void>;
  /** 교사 heartbeat (5초 주기). 10초 누락 시 학생에게 teacher-disconnected. */
  teacherHeartbeat: () => Promise<void>;

  /**
   * 터널 모드 (Plan §11.3) — 외부 인터넷 노출.
   * cloudflared(또는 동급)가 사용 가능한지 체크 + 터널 시작 후 외부 URL 반환.
   */
  tunnelAvailable: () => Promise<boolean>;
  tunnelStart: () => Promise<{ tunnelUrl: string }>;

  // Subscribe (renderer cleanup 위해 unsubscribe 함수 반환)
  onTeacherEvent: (callback: (event: InteractiveSlidesTeacherEvent) => void) => () => void;
}

/** 백업 파일 metadata — 버전 정보 표시용 */
interface BackupFileMetadataView {
  readonly schemaVersion: number;
  readonly appVersion: string;
  readonly exportedAt: string;
  readonly platform: string;
  readonly entryCount: number;
}

/** 가져오기 실패 사유 — 한국어 메시지가 동봉되며 UI에 그대로 노출 가능 */
interface BackupImportErrorPayload {
  readonly code:
    | 'file-read-failed'
    | 'invalid-json'
    | 'invalid-structure'
    | 'unsupported-future-version'
    | 'empty-data'
    | 'write-failed';
  readonly message: string;
}

interface BackupElectronAPI {
  /** 사용자 데이터 디렉토리 정보 (userDataPath / dataDirPath / exists). */
  getDataLocation: () => Promise<{
    userDataPath: string;
    dataDirPath: string;
    exists: boolean;
  }>;
  /** OS 파일 탐색기에서 데이터 디렉토리 열기. */
  openDataLocation: () => Promise<{ ok: boolean; reason?: string }>;
  /** 백업 파일 저장 (Save dialog 경유). canceled=true는 사용자 취소. */
  exportBackup: () => Promise<{
    canceled: boolean;
    filePath?: string;
    entryCount?: number;
  }>;
  /**
   * 백업 파일 가져오기. main이 자동으로 safety backup을 먼저 만든 뒤 적용한다.
   * canceled=true는 사용자 취소(error 없음).
   * error가 있으면 한국어 메시지를 그대로 토스트/모달에 표시.
   */
  importBackup: () => Promise<{
    canceled: boolean;
    restoredCount?: number;
    restoredFilenames?: readonly string[];
    safetyBackupPath?: string;
    metadata?: BackupFileMetadataView;
    error?: BackupImportErrorPayload;
  }>;
}

/** 내 템플릿 메타 (PDCA-4 / G006) — UserTemplateMeta 직렬화 형태 */
interface CollabBoardUserTemplateMeta {
  id: string;
  name: string;
  createdAt: number;
  versionSchema: string;
  elementCount: number;
}

/** 협업 보드 메타데이터 (Board 엔티티의 renderer-facing 뷰) */
interface CollabBoardMeta {
  id: string;
  /** 생성 시 선택한 학습 활동 템플릿 (PDCA-3 / G005). 이전 보드는 없음 */
  templateId?: string | null;
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

/** 마크다운 변환기 파싱 결과 (markdownConvert.pickAndParse) — 파일 경로/원본 미포함 */
type MarkdownConvertResult =
  | { status: 'canceled' }
  | {
      status: 'ok';
      fileName: string;
      markdown: string;
      format: string;
      isImageBased: boolean;
      warnings: string[];
      /** 문서 정보(있으면). 표시 전용 — 마스킹 본문/저장에 미주입. */
      metadata?: {
        title?: string;
        author?: string;
        creator?: string;
        createdAt?: string;
        pageCount?: number;
        version?: string;
      };
      /** 문서 목차(있으면). */
      outline?: Array<{ level: number; text: string }>;
      /** 텍스트 추출 품질 신호(주로 PDF). 없으면 양호로 간주. */
      textQuality?: {
        needsReview: boolean;
        reason?: 'image_based' | 'low_text' | 'high_pua' | 'high_control' | 'high_replacement';
      };
    }
  | { status: 'error'; code: string; message: string };

/** 개별 저장(ZIP) 결과 (markdownConvert.saveZip) */
type MarkdownSaveZipResult =
  | { status: 'canceled' }
  | { status: 'saved' }
  | { status: 'error'; message: string };

/** 학교 검색 결과 (schoolinfoEvaluation.searchSchools) */
type SchoolinfoSearchResult =
  | {
      status: 'ok';
      hits: Array<{ shlIdfCd: string; name: string; address: string; kind: string }>;
    }
  | { status: 'error'; message: string };

/** 평가계획 목록 결과 (schoolinfoEvaluation.listDocs) */
type SchoolinfoListResult =
  | { status: 'ok'; docs: Array<{ seq: string; filename: string; sizeKB?: number }> }
  | { status: 'error'; message: string };

/** 평가계획 다운로드+파싱 결과 (schoolinfoEvaluation.downloadDoc) — 경로/원본 미포함 */
type SchoolinfoDownloadResult =
  | {
      status: 'ok';
      fileName: string;
      markdown: string;
      isImageBased: boolean;
      /** isImageBased 또는 추출 품질 저하 — 뷰어 폴백 신호 */
      needsOcr: boolean;
    }
  | { status: 'error'; code: string; message: string };

interface Window {
  electronAPI?: ElectronAPI;
}

declare const __APP_VERSION__: string;
