import { contextBridge, ipcRenderer } from 'electron';

/** 단일/복수 선택 집계 */
type AggregatedSingleMulti = { counts: Record<string, number>; total: number };
/** 스케일 집계 */
type AggregatedScale = { avg: number; distribution: Record<number, number>; total: number };
/** 주관식 집계 (무기명) */
type AggregatedText = { answers: string[] };
/** 집계 결과 discriminated union */
type AggregatedResult = AggregatedSingleMulti | AggregatedScale | AggregatedText;

contextBridge.exposeInMainWorld('electronAPI', {
  readData: (filename: string): Promise<string | null> =>
    ipcRenderer.invoke('data:read', filename),
  writeData: (filename: string, data: string): Promise<void> =>
    ipcRenderer.invoke('data:write', filename, data),
  removeData: (filename: string): Promise<void> =>
    ipcRenderer.invoke('data:remove', filename),
  setAlwaysOnTop: (flag: boolean): Promise<void> =>
    ipcRenderer.invoke('window:setAlwaysOnTop', flag),
  setWidget: (options: {
    width: number;
    height: number;
    transparent: boolean;
    opacity: number;
    alwaysOnTop: boolean;
  }): Promise<void> => ipcRenderer.invoke('window:setWidget', options),
  toggleWidget: (): Promise<void> => ipcRenderer.invoke('window:toggleWidget'),
  setOpacity: (value: number): Promise<void> => ipcRenderer.invoke('window:setOpacity', value),
  setWidgetLayout: (mode: string): Promise<void> => ipcRenderer.invoke('window:setWidgetLayout', mode),
  applyWidgetSettings: (widget: {
    opacity: number;
    desktopMode: string;
  }): Promise<void> => ipcRenderer.invoke('window:applyWidgetSettings', widget),
  closeWindow: (): Promise<void> => ipcRenderer.invoke('window:closeApp'),
  showSaveDialog: (options: {
    title: string;
    defaultPath: string;
    filters: { name: string; extensions: string[] }[];
  }): Promise<string | null> =>
    ipcRenderer.invoke('export:showSaveDialog', options),
  writeFile: (filePath: string, data: ArrayBuffer | string): Promise<void> =>
    ipcRenderer.invoke('export:writeFile', filePath, data),
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
  ): Promise<ArrayBuffer | null> =>
    ipcRenderer.invoke('export:printToPDF', options),
  openFile: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('export:openFile', filePath),
  importAlarmAudio: (): Promise<{ name: string; dataUrl: string } | null> =>
    ipcRenderer.invoke('audio:importAlarm'),
  importFont: (): Promise<{ name: string; dataUrl: string; mimeType: string } | null> =>
    ipcRenderer.invoke('font:import'),
  importShareFile: (): Promise<{ content: string | ArrayBuffer; fileType: 'ssampin' | 'xlsx' } | null> =>
    ipcRenderer.invoke('share:import'),
  importBookmarksFile: (): Promise<{ content: string; format: 'json' | 'html' } | null> =>
    ipcRenderer.invoke('bookmarks:import'),
  readClipboardText: (): Promise<string> =>
    ipcRenderer.invoke('clipboard:readText'),
  onFileOpened: (callback: (filePath: string) => void): (() => void) => {
    const handler = (_event: unknown, filePath: string) => callback(filePath);
    ipcRenderer.on('share:file-opened', handler);
    return () => { ipcRenderer.removeListener('share:file-opened', handler); };
  },
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('shell:openExternal', url),
  openPath: (folderPath: string): Promise<string> =>
    ipcRenderer.invoke('shell:openPath', folderPath),
  showOpenDialog: (options: {
    title?: string;
    properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>;
    filters?: { name: string; extensions: string[] }[];
  }): Promise<{ canceled: boolean; filePaths: string[] }> =>
    ipcRenderer.invoke('dialog:showOpen', options),
  fetchCalendarUrl: (url: string): Promise<string | null> =>
    ipcRenderer.invoke('calendar:fetch-url', url),
  // Auto-update
  checkForUpdate: (): Promise<void> => ipcRenderer.invoke('update:check'),
  downloadUpdate: (): Promise<void> => ipcRenderer.invoke('update:download'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('update:install'),
  onUpdateAvailable: (callback: (info: { version: string; releaseNotes?: string }) => void): (() => void) => {
    const handler = (_event: unknown, info: { version: string; releaseNotes?: string }) => callback(info);
    ipcRenderer.on('update:available', handler);
    return () => { ipcRenderer.removeListener('update:available', handler); };
  },
  onUpdateNotAvailable: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on('update:not-available', handler);
    return () => { ipcRenderer.removeListener('update:not-available', handler); };
  },
  onUpdateDownloadProgress: (callback: (progress: { percent: number }) => void): (() => void) => {
    const handler = (_event: unknown, progress: { percent: number }) => callback(progress);
    ipcRenderer.on('update:download-progress', handler);
    return () => { ipcRenderer.removeListener('update:download-progress', handler); };
  },
  onUpdateDownloaded: (callback: (info: { version: string }) => void): (() => void) => {
    const handler = (_event: unknown, info: { version: string }) => callback(info);
    ipcRenderer.on('update:update-downloaded', handler);
    return () => { ipcRenderer.removeListener('update:update-downloaded', handler); };
  },
  onUpdateError: (callback: (error: string) => void): (() => void) => {
    const handler = (_event: unknown, error: string) => callback(error);
    ipcRenderer.on('update:error', handler);
    return () => { ipcRenderer.removeListener('update:error', handler); };
  },
  // Cross-window navigation
  navigateToPage: (page: string): Promise<void> =>
    ipcRenderer.invoke('window:navigateToPage', page),
  onNavigateToPage: (callback: (page: string) => void): (() => void) => {
    const handler = (_event: unknown, page: string) => callback(page);
    ipcRenderer.on('navigate:to-page', handler);
    return () => { ipcRenderer.removeListener('navigate:to-page', handler); };
  },
  // Google OAuth
  startOAuth: (authUrl: string): Promise<string> =>
    ipcRenderer.invoke('oauth:start', authUrl),
  cancelOAuth: (): Promise<void> =>
    ipcRenderer.invoke('oauth:cancel'),
  onOAuthRedirectUri: (callback: (uri: string) => void): (() => void) => {
    const handler = (_event: unknown, uri: string) => callback(uri);
    ipcRenderer.on('oauth:redirect-uri', handler);
    return () => { ipcRenderer.removeListener('oauth:redirect-uri', handler); };
  },
  onOAuthError: (callback: (error: { code: string; message: string }) => void): (() => void) => {
    const handler = (_event: unknown, error: { code: string; message: string }) => callback(error);
    ipcRenderer.on('oauth:error', handler);
    return () => { ipcRenderer.removeListener('oauth:error', handler); };
  },
  // OAuth 콜백 미수신 → PKCE 폴백 제안
  onOAuthFallbackNeeded: (callback: (data: { reason: string; message: string; elapsedSec: number }) => void): (() => void) => {
    const handler = (_event: unknown, data: { reason: string; message: string; elapsedSec: number }) => callback(data);
    ipcRenderer.on('oauth:fallback-needed', handler);
    return () => { ipcRenderer.removeListener('oauth:fallback-needed', handler); };
  },
  // Google OAuth PKCE 폴백 (로컬 서버 실패 시)
  startPKCEAuth: (authUrl: string): Promise<{ verifier: string }> =>
    ipcRenderer.invoke('oauth:pkce-start', authUrl),
  exchangePKCECode: (): Promise<string> =>
    ipcRenderer.invoke('oauth:pkce-exchange'),
  // Secure Storage
  secureWrite: (key: string, value: string): Promise<void> =>
    ipcRenderer.invoke('secure:write', key, value),
  secureRead: (key: string): Promise<string | null> =>
    ipcRenderer.invoke('secure:read', key),
  secureDelete: (key: string): Promise<void> =>
    ipcRenderer.invoke('secure:delete', key),
  // Network status
  onNetworkChange: (callback: (online: boolean) => void): (() => void) => {
    const onlineHandler = () => callback(true);
    const offlineHandler = () => callback(false);
    window.addEventListener('online', onlineHandler);
    window.addEventListener('offline', offlineHandler);
    return () => {
      window.removeEventListener('online', onlineHandler);
      window.removeEventListener('offline', offlineHandler);
    };
  },
  // Live Vote
  startLiveVote: (data: {
    question: string;
    options: { id: string; text: string; color: string }[];
  }): Promise<{ port: number; localIPs: string[] }> =>
    ipcRenderer.invoke('live-vote:start', data),
  stopLiveVote: (): Promise<void> =>
    ipcRenderer.invoke('live-vote:stop'),
  onLiveVoteStudentVoted: (callback: (data: { optionId: string; totalVoters: number }) => void): (() => void) => {
    const handler = (_event: unknown, data: { optionId: string; totalVoters: number }) => callback(data);
    ipcRenderer.on('live-vote:student-voted', handler);
    return () => { ipcRenderer.removeListener('live-vote:student-voted', handler); };
  },
  onLiveVoteConnectionCount: (callback: (data: { count: number }) => void): (() => void) => {
    const handler = (_event: unknown, data: { count: number }) => callback(data);
    ipcRenderer.on('live-vote:connection-count', handler);
    return () => { ipcRenderer.removeListener('live-vote:connection-count', handler); };
  },
  // Live Vote Tunnel
  tunnelAvailable: (): Promise<boolean> =>
    ipcRenderer.invoke('live-vote:tunnel-available'),
  tunnelInstall: (): Promise<void> =>
    ipcRenderer.invoke('live-vote:tunnel-install'),
  tunnelStart: (): Promise<{ tunnelUrl: string }> =>
    ipcRenderer.invoke('live-vote:tunnel-start'),
  // Live Survey
  startLiveSurvey: (data: {
    question: string;
    maxLength: number;
  }): Promise<{ port: number; localIPs: string[] }> =>
    ipcRenderer.invoke('live-survey:start', data),
  stopLiveSurvey: (): Promise<void> =>
    ipcRenderer.invoke('live-survey:stop'),
  surveyTunnelAvailable: (): Promise<boolean> =>
    ipcRenderer.invoke('live-survey:tunnel-available'),
  surveyTunnelInstall: (): Promise<void> =>
    ipcRenderer.invoke('live-survey:tunnel-install'),
  surveyTunnelStart: (): Promise<{ tunnelUrl: string }> =>
    ipcRenderer.invoke('live-survey:tunnel-start'),
  onLiveSurveyStudentSubmitted: (callback: (data: { text: string; totalResponders: number }) => void): (() => void) => {
    const handler = (_event: unknown, data: { text: string; totalResponders: number }) => callback(data);
    ipcRenderer.on('live-survey:student-submitted', handler);
    return () => { ipcRenderer.removeListener('live-survey:student-submitted', handler); };
  },
  onLiveSurveyConnectionCount: (callback: (data: { count: number }) => void): (() => void) => {
    const handler = (_event: unknown, data: { count: number }) => callback(data);
    ipcRenderer.on('live-survey:connection-count', handler);
    return () => { ipcRenderer.removeListener('live-survey:connection-count', handler); };
  },
  // Realtime Wall
  startRealtimeWall: (data: {
    title: string;
    maxTextLength: number;
  }): Promise<{ port: number; localIPs: string[] }> =>
    ipcRenderer.invoke('realtime-wall:start', data),
  stopRealtimeWall: (): Promise<void> =>
    ipcRenderer.invoke('realtime-wall:stop'),
  realtimeWallTunnelAvailable: (): Promise<boolean> =>
    ipcRenderer.invoke('realtime-wall:tunnel-available'),
  realtimeWallTunnelInstall: (): Promise<void> =>
    ipcRenderer.invoke('realtime-wall:tunnel-install'),
  realtimeWallTunnelStart: (): Promise<{ tunnelUrl: string }> =>
    ipcRenderer.invoke('realtime-wall:tunnel-start'),
  fetchRealtimeWallLinkPreview: (url: string) =>
    ipcRenderer.invoke('realtime-wall:fetch-link-preview', url),
  // 동일한 OG 파싱 IPC를 도메인 중립적인 이름으로 재노출 (북마크 등에서 사용)
  fetchLinkPreview: (url: string) =>
    ipcRenderer.invoke('realtime-wall:fetch-link-preview', url),
  /**
   * v1.14 P1 — 교사 → 학생 broadcast 트리거.
   * renderer에서 posts/title/layoutMode/columns 변화 시 호출. Main이 연결된 모든
   * 학생 WebSocket 클라이언트에 payload를 송신하고, wall-state 메시지는 캐시.
   *
   * v1.14 P2에서 like-toggled / comment-added / comment-removed 메시지 3종 추가.
   */
  broadcastRealtimeWall: (msg: {
    type:
      | 'wall-state'
      | 'post-added'
      | 'post-updated'
      | 'post-removed'
      | 'closed'
      | 'error'
      | 'like-toggled'
      | 'comment-added'
      | 'comment-removed'
      | 'student-form-locked'
      // v2.1 신규 (Phase B 도메인 선언, Phase A/D 활용)
      | 'boardSettings-changed'
      | 'nickname-changed';
    board?: unknown;
    post?: unknown;
    postId?: string;
    patch?: unknown;
    message?: string;
    likes?: number;
    likedBy?: readonly string[];
    comment?: unknown;
    commentId?: string;
    locked?: boolean;
    // v2.1 신규
    settings?: unknown;
    postIds?: readonly string[];
    newNickname?: string;
  }): Promise<void> =>
    ipcRenderer.invoke('realtime-wall:broadcast', msg),
  /**
   * v2.1 신규 (Phase B) — 학생 PDF 업로드.
   * Renderer → Main → magic byte 검증 → 임시 디렉토리 저장 → file:// URL 반환.
   * Plan §7.2 결정 #7 / Design v2.1 §7.1.
   */
  uploadRealtimeWallPdf: (
    bytes: Uint8Array,
    filename: string,
  ): Promise<{ fileUrl: string; filename: string }> =>
    ipcRenderer.invoke('realtime-wall:upload-pdf', { bytes, filename }),
  /**
   * v1.14 P2 — 교사가 학생 댓글 삭제 (status='hidden' 전환).
   * Main이 도메인 규칙 적용 후 모든 학생에게 broadcast.
   */
  removeRealtimeWallComment: (args: { postId: string; commentId: string }): Promise<void> =>
    ipcRenderer.invoke('realtime-wall:remove-comment', args),
  /**
   * v2.1 Phase D — 교사가 학생 placeholder 카드 복원 (status='hidden-by-author' → 'approved').
   * Main이 broadcast post-updated patch: { status: 'approved' }.
   */
  restoreRealtimeWallCard: (args: { postId: string }): Promise<void> =>
    ipcRenderer.invoke('realtime-wall:restore-card', args),
  /**
   * v2.1 Phase D — 학생 자기 카드 수정 알림 (교사 entry).
   */
  onRealtimeWallStudentEdit: (callback: (data: {
    postId: string;
    post: unknown;
  }) => void): (() => void) => {
    const handler = (_event: unknown, data: { postId: string; post: unknown }) => callback(data);
    ipcRenderer.on('realtime-wall:student-edit', handler);
    return () => { ipcRenderer.removeListener('realtime-wall:student-edit', handler); };
  },
  /**
   * v2.1 Phase D — 학생 자기 카드 삭제(soft delete) 알림 (교사 entry).
   */
  onRealtimeWallStudentDelete: (callback: (data: { postId: string }) => void): (() => void) => {
    const handler = (_event: unknown, data: { postId: string }) => callback(data);
    ipcRenderer.on('realtime-wall:student-delete', handler);
    return () => { ipcRenderer.removeListener('realtime-wall:student-delete', handler); };
  },
  /**
   * v2.1 Phase D — 닉네임 변경 broadcast 알림 (교사 entry).
   */
  onRealtimeWallNicknameChanged: (callback: (data: {
    postIds: readonly string[];
    newNickname: string;
  }) => void): (() => void) => {
    const handler = (_event: unknown, data: { postIds: readonly string[]; newNickname: string }) =>
      callback(data);
    ipcRenderer.on('realtime-wall:nickname-changed', handler);
    return () => { ipcRenderer.removeListener('realtime-wall:nickname-changed', handler); };
  },
  /**
   * v2.1 Phase C — 학생 자기 카드 위치 변경(submit-move) 도착 알림 (교사 entry).
   *
   * 결함 fix (2026-04-26): 이 핸들러가 빠져 있어 학생이 카드를 다른 컬럼/좌표로
   * 옮겨도 교사 renderer의 `posts` state는 원래 위치를 그대로 유지했다.
   * 이후 다른 부분 업데이트(좋아요·댓글·삭제 등)가 도착하면 교사가 setPosts로
   * stale 위치를 포함한 채 wall-state를 재 broadcast → 학생 화면에서 카드가
   * 원래 컬럼으로 되돌아가는 회귀가 발생.
   *
   * 본 이벤트는 서버가 위치 patch를 적용한 *최종* post 객체를 그대로 전달하므로
   * 교사 renderer는 해당 postId 항목을 통째로 교체한다.
   */
  onRealtimeWallStudentMove: (callback: (data: {
    postId: string;
    post: unknown;
  }) => void): (() => void) => {
    const handler = (_event: unknown, data: { postId: string; post: unknown }) => callback(data);
    ipcRenderer.on('realtime-wall:student-move', handler);
    return () => { ipcRenderer.removeListener('realtime-wall:student-move', handler); };
  },
  /**
   * v1.14 P3 — 교사가 학생 카드 추가 잠금 토글.
   * Main이 세션 플래그를 갱신하고 모든 학생에게 `student-form-locked` broadcast.
   */
  setRealtimeWallStudentFormLocked: (locked: boolean): Promise<void> =>
    ipcRenderer.invoke('realtime-wall:student-form-locked', locked),
  /**
   * v1.14 P2 — 학생 좋아요 도착 알림.
   * 교사 renderer는 posts 상태를 해당 postId에 대해 likes/likedBy 갱신.
   */
  onRealtimeWallStudentLike: (callback: (data: {
    postId: string;
    likes: number;
    likedBy: readonly string[];
  }) => void): (() => void) => {
    const handler = (_event: unknown, data: {
      postId: string;
      likes: number;
      likedBy: readonly string[];
    }) => callback(data);
    ipcRenderer.on('realtime-wall:student-like', handler);
    return () => { ipcRenderer.removeListener('realtime-wall:student-like', handler); };
  },
  /**
   * v1.14 P2 — 학생 댓글 도착 알림.
   */
  onRealtimeWallStudentComment: (callback: (data: {
    postId: string;
    comment: {
      id: string;
      nickname: string;
      text: string;
      submittedAt: number;
      sessionToken: string;
      status: 'approved' | 'hidden';
    };
  }) => void): (() => void) => {
    const handler = (_event: unknown, data: {
      postId: string;
      comment: {
        id: string;
        nickname: string;
        text: string;
        submittedAt: number;
        sessionToken: string;
        status: 'approved' | 'hidden';
      };
    }) => callback(data);
    ipcRenderer.on('realtime-wall:student-comment', handler);
    return () => { ipcRenderer.removeListener('realtime-wall:student-comment', handler); };
  },
  // v2.1 student-ux 회귀 fix (2026-04-24): post payload에 v2.1 필드 + status/kanban/freeform
  // 등 RealtimeWallPost 전체 필드를 포함. 서버가 도메인 createWallPost로 카드를 직접 생성한
  // 결과를 그대로 전달하므로 renderer는 재계산 X — 그대로 setPosts에 merge.
  onRealtimeWallStudentSubmitted: (callback: (data: {
    post: unknown;
    totalSubmissions: number;
  }) => void): (() => void) => {
    const handler = (_event: unknown, data: {
      post: unknown;
      totalSubmissions: number;
    }) => callback(data);
    ipcRenderer.on('realtime-wall:student-submitted', handler);
    return () => { ipcRenderer.removeListener('realtime-wall:student-submitted', handler); };
  },
  onRealtimeWallConnectionCount: (callback: (data: { count: number }) => void): (() => void) => {
    const handler = (_event: unknown, data: { count: number }) => callback(data);
    ipcRenderer.on('realtime-wall:connection-count', handler);
    return () => { ipcRenderer.removeListener('realtime-wall:connection-count', handler); };
  },
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
  }): Promise<{ port: number; localIPs: string[] }> =>
    ipcRenderer.invoke('live-multi-survey:start', data),
  stopLiveMultiSurvey: (): Promise<void> =>
    ipcRenderer.invoke('live-multi-survey:stop'),
  multiSurveyTunnelAvailable: (): Promise<boolean> =>
    ipcRenderer.invoke('live-multi-survey:tunnel-available'),
  multiSurveyTunnelInstall: (): Promise<void> =>
    ipcRenderer.invoke('live-multi-survey:tunnel-install'),
  multiSurveyTunnelStart: (): Promise<{ tunnelUrl: string }> =>
    ipcRenderer.invoke('live-multi-survey:tunnel-start'),
  onLiveMultiSurveyStudentSubmitted: (callback: (data: { answers: Array<{ questionId: string; value: string | string[] | number }>; submissionId: string; totalSubmissions: number }) => void): (() => void) => {
    const handler = (_event: unknown, data: { answers: Array<{ questionId: string; value: string | string[] | number }>; submissionId: string; totalSubmissions: number }) => callback(data);
    ipcRenderer.on('live-multi-survey:student-submitted', handler);
    return () => { ipcRenderer.removeListener('live-multi-survey:student-submitted', handler); };
  },
  onLiveMultiSurveyConnectionCount: (callback: (data: { count: number }) => void): (() => void) => {
    const handler = (_event: unknown, data: { count: number }) => callback(data);
    ipcRenderer.on('live-multi-survey:connection-count', handler);
    return () => { ipcRenderer.removeListener('live-multi-survey:connection-count', handler); };
  },
  // Live Multi Survey — step mode controls
  liveMultiSurveyActivateSession: (): Promise<void> =>
    ipcRenderer.invoke('live-multi-survey:activate-session'),
  liveMultiSurveyReveal: (): Promise<void> =>
    ipcRenderer.invoke('live-multi-survey:reveal'),
  liveMultiSurveyAdvance: (): Promise<void> =>
    ipcRenderer.invoke('live-multi-survey:advance'),
  liveMultiSurveyPrev: (): Promise<void> =>
    ipcRenderer.invoke('live-multi-survey:prev'),
  liveMultiSurveyReopen: (): Promise<void> =>
    ipcRenderer.invoke('live-multi-survey:reopen'),
  liveMultiSurveyEndSession: (): Promise<void> =>
    ipcRenderer.invoke('live-multi-survey:end-session'),
  // Live Multi Survey — step mode events
  onLiveMultiSurveyStudentAnswered: (callback: (data: {
    sessionId: string;
    nickname: string;
    questionIndex: number;
    totalAnswered: number;
    totalConnected: number;
    aggregatedPreview: AggregatedResult | null;
  }) => void): (() => void) => {
    const handler = (_event: unknown, data: {
      sessionId: string;
      nickname: string;
      questionIndex: number;
      totalAnswered: number;
      totalConnected: number;
      aggregatedPreview: AggregatedResult | null;
    }) => callback(data);
    ipcRenderer.on('live-multi-survey:student-answered', handler);
    return () => { ipcRenderer.removeListener('live-multi-survey:student-answered', handler); };
  },
  onLiveMultiSurveyPhaseChanged: (callback: (data: {
    phase: 'lobby' | 'open' | 'revealed' | 'ended';
    currentQuestionIndex: number;
    totalAnswered: number;
    totalConnected: number;
    aggregated?: AggregatedResult;
  }) => void): (() => void) => {
    const handler = (_event: unknown, data: {
      phase: 'lobby' | 'open' | 'revealed' | 'ended';
      currentQuestionIndex: number;
      totalAnswered: number;
      totalConnected: number;
      aggregated?: AggregatedResult;
    }) => callback(data);
    ipcRenderer.on('live-multi-survey:phase-changed', handler);
    return () => { ipcRenderer.removeListener('live-multi-survey:phase-changed', handler); };
  },
  onLiveMultiSurveyRoster: (callback: (data: {
    roster: Array<{ sessionId: string; nickname: string; answeredQuestions: number[] }>;
  }) => void): (() => void) => {
    const handler = (_event: unknown, data: {
      roster: Array<{ sessionId: string; nickname: string; answeredQuestions: number[] }>;
    }) => callback(data);
    ipcRenderer.on('live-multi-survey:roster', handler);
    return () => { ipcRenderer.removeListener('live-multi-survey:roster', handler); };
  },
  onLiveMultiSurveyTextAnswerDetail: (callback: (data: {
    questionIndex: number;
    entries: Array<{ sessionId: string; nickname: string; text: string }>;
  }) => void): (() => void) => {
    const handler = (_event: unknown, data: {
      questionIndex: number;
      entries: Array<{ sessionId: string; nickname: string; text: string }>;
    }) => callback(data);
    ipcRenderer.on('live-multi-survey:text-answer-detail', handler);
    return () => { ipcRenderer.removeListener('live-multi-survey:text-answer-detail', handler); };
  },
  // Live Word Cloud
  startLiveWordCloud: (data: {
    question: string;
    maxSubmissions: number;
  }): Promise<{ port: number; localIPs: string[] }> =>
    ipcRenderer.invoke('live-wordcloud:start', data),
  stopLiveWordCloud: (): Promise<void> =>
    ipcRenderer.invoke('live-wordcloud:stop'),
  onLiveWordCloudWordSubmitted: (callback: (data: { word: string; count: number; totalWords: number }) => void): (() => void) => {
    const handler = (_event: unknown, data: { word: string; count: number; totalWords: number }) => callback(data);
    ipcRenderer.on('live-wordcloud:word-submitted', handler);
    return () => { ipcRenderer.removeListener('live-wordcloud:word-submitted', handler); };
  },
  onLiveWordCloudConnectionCount: (callback: (data: { count: number }) => void): (() => void) => {
    const handler = (_event: unknown, data: { count: number }) => callback(data);
    ipcRenderer.on('live-wordcloud:connection-count', handler);
    return () => { ipcRenderer.removeListener('live-wordcloud:connection-count', handler); };
  },
  // Live Word Cloud Tunnel
  wordcloudTunnelAvailable: (): Promise<boolean> =>
    ipcRenderer.invoke('live-wordcloud:tunnel-available'),
  wordcloudTunnelInstall: (): Promise<void> =>
    ipcRenderer.invoke('live-wordcloud:tunnel-install'),
  wordcloudTunnelStart: (): Promise<{ tunnelUrl: string }> =>
    ipcRenderer.invoke('live-wordcloud:tunnel-start'),
  // Live Discussion (Value Line / Traffic Light)
  startDiscussion: (config: { toolType: string; topics: string[] }): Promise<{ port: number; localIPs: string[] }> =>
    ipcRenderer.invoke('discussion:start', config),
  stopDiscussion: (): Promise<void> =>
    ipcRenderer.invoke('discussion:stop'),
  discussionNextRound: (): Promise<void> =>
    ipcRenderer.invoke('discussion:next-round'),
  discussionGetState: (): Promise<{
    toolType: string;
    topics: string[];
    currentRound: number;
    students: Array<{ id: string; name: string; emoji: string; avatarColor: string; connected: boolean; position: number; signal: string }>;
    chats: Array<{ name: string; emoji: string; avatarColor: string; text: string; time: string }>;
  } | null> =>
    ipcRenderer.invoke('discussion:get-state'),
  onDiscussionConnectionCount: (callback: (count: number) => void): (() => void) => {
    const handler = (_event: unknown, data: { count: number }) => callback(data.count);
    ipcRenderer.on('discussion:connection-count', handler);
    return () => { ipcRenderer.removeListener('discussion:connection-count', handler); };
  },
  onDiscussionState: (callback: (state: {
    students: Array<{ id: string; name: string; emoji: string; avatarColor: string; connected: boolean; position: number; signal: string }>;
    chats: Array<{ name: string; emoji: string; avatarColor: string; text: string; time: string }>;
  }) => void): (() => void) => {
    const handler = (_event: unknown, state: {
      students: Array<{ id: string; name: string; emoji: string; avatarColor: string; connected: boolean; position: number; signal: string }>;
      chats: Array<{ name: string; emoji: string; avatarColor: string; text: string; time: string }>;
    }) => callback(state);
    ipcRenderer.on('discussion:state', handler);
    return () => { ipcRenderer.removeListener('discussion:state', handler); };
  },
  onDiscussionChat: (callback: (chat: { name: string; emoji: string; avatarColor: string; text: string; time: string }) => void): (() => void) => {
    const handler = (_event: unknown, chat: { name: string; emoji: string; avatarColor: string; text: string; time: string }) => callback(chat);
    ipcRenderer.on('discussion:chat', handler);
    return () => { ipcRenderer.removeListener('discussion:chat', handler); };
  },
  // Discussion Tunnel
  discussionTunnelAvailable: (): Promise<boolean> =>
    ipcRenderer.invoke('discussion:tunnel-available'),
  discussionTunnelInstall: (): Promise<void> =>
    ipcRenderer.invoke('discussion:tunnel-install'),
  discussionTunnelStart: (): Promise<{ tunnelUrl: string }> =>
    ipcRenderer.invoke('discussion:tunnel-start'),
  // Widget 리사이즈 (JS 기반, thickFrame: false 대응)
  resizeWidget: (edge: string, dx: number, dy: number): Promise<void> =>
    ipcRenderer.invoke('window:resizeWidget', edge, dx, dy),
  // Analytics flush
  onAnalyticsFlush: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on('analytics:flush', handler);
    return () => { ipcRenderer.removeListener('analytics:flush', handler); };
  },
  // Close action dialog
  onCloseActionAsk: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on('close-action:ask', handler);
    return () => { ipcRenderer.removeListener('close-action:ask', handler); };
  },
  respondCloseAction: (action: 'widget' | 'tray'): void => {
    ipcRenderer.send('close-action:respond', action);
  },
  // Cross-window data sync
  onDataChanged: (callback: (filename: string) => void): (() => void) => {
    const handler = (_event: unknown, filename: string) => callback(filename);
    ipcRenderer.on('data:changed', handler);
    return () => { ipcRenderer.removeListener('data:changed', handler); };
  },
  // 절전/잠금 복귀 알림 (렌더러에서 날짜/데이터 갱신용)
  onSystemResume: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on('system:resume', handler);
    return () => { ipcRenderer.removeListener('system:resume', handler); };
  },
  // 메모리 진단 (설정 화면 표시용)
  getMemoryMetrics: (): Promise<{
    totalBytes: number;
    processes: Array<{ type: string; pid: number; memoryBytes: number; name?: string }>;
  }> => ipcRenderer.invoke('system:getMemoryMetrics'),

  // === 서식 관리 (forms) — Phase 1 바이너리 IPC ===
  forms: {
    writeBinary: (relPath: string, bytes: ArrayBuffer): Promise<void> =>
      ipcRenderer.invoke('forms:writeBinary', { relPath, bytes }),
    readBinary: (relPath: string): Promise<ArrayBuffer | null> =>
      ipcRenderer.invoke('forms:readBinary', { relPath }),
    removeBinary: (relPath: string): Promise<void> =>
      ipcRenderer.invoke('forms:removeBinary', { relPath }),
    listBinary: (dirRelPath: string): Promise<string[]> =>
      ipcRenderer.invoke('forms:listBinary', { dirRelPath }),
    openFile: (relPath: string): Promise<void> =>
      ipcRenderer.invoke('forms:openFile', { relPath }),
    printPdf: (relPath: string): Promise<void> =>
      ipcRenderer.invoke('forms:printPdf', { relPath }),
  },

  // === 협업 보드 (collab-board) ===
  // Design §4.1 14개 채널을 서브객체로 그루핑 (기존 flat 패턴과의 절충 — 채널 많음)
  collabBoard: {
    list: (): Promise<unknown[]> => ipcRenderer.invoke('collab-board:list'),
    create: (args: { name?: string }): Promise<unknown> =>
      ipcRenderer.invoke('collab-board:create', args),
    rename: (args: { id: string; name: string }): Promise<unknown> =>
      ipcRenderer.invoke('collab-board:rename', args),
    delete: (args: { id: string }): Promise<{ ok: true }> =>
      ipcRenderer.invoke('collab-board:delete', args),
    startSession: (args: { id: string }): Promise<unknown> =>
      ipcRenderer.invoke('collab-board:start-session', args),
    endSession: (args: { id: string; forceSave: boolean }): Promise<{ ok: true }> =>
      ipcRenderer.invoke('collab-board:end-session', args),
    getActiveSession: (): Promise<unknown> =>
      ipcRenderer.invoke('collab-board:get-active-session'),
    saveSnapshot: (args: { id: string }): Promise<{ savedAt: number }> =>
      ipcRenderer.invoke('collab-board:save-snapshot', args),
    tunnelAvailable: (): Promise<{ available: boolean }> =>
      ipcRenderer.invoke('collab-board:tunnel-available'),
    tunnelInstall: (): Promise<{ ok: true }> =>
      ipcRenderer.invoke('collab-board:tunnel-install'),

    onParticipantChange: (cb: (data: { boardId: string; names: string[] }) => void): (() => void) => {
      const handler = (_e: unknown, data: { boardId: string; names: string[] }) => cb(data);
      ipcRenderer.on('collab-board:participant-change', handler);
      return () => { ipcRenderer.removeListener('collab-board:participant-change', handler); };
    },
    onAutoSave: (cb: (data: { boardId: string; savedAt: number }) => void): (() => void) => {
      const handler = (_e: unknown, data: { boardId: string; savedAt: number }) => cb(data);
      ipcRenderer.on('collab-board:auto-save', handler);
      return () => { ipcRenderer.removeListener('collab-board:auto-save', handler); };
    },
    onSessionError: (cb: (data: { boardId: string; reason: string }) => void): (() => void) => {
      const handler = (_e: unknown, data: { boardId: string; reason: string }) => cb(data);
      ipcRenderer.on('collab-board:session-error', handler);
      return () => { ipcRenderer.removeListener('collab-board:session-error', handler); };
    },
    onSessionStarted: (cb: (data: unknown) => void): (() => void) => {
      const handler = (_e: unknown, data: unknown) => cb(data);
      ipcRenderer.on('collab-board:session-started', handler);
      return () => { ipcRenderer.removeListener('collab-board:session-started', handler); };
    },
  },

  // === 글로벌 퀵애드 단축키 ===
  syncShortcuts: (config: {
    globalEnabled: boolean;
    bindings: Array<{ id: string; combo: string; enabled: boolean }>;
  }): Promise<{ registered: string[]; failed: string[] }> =>
    ipcRenderer.invoke('shortcuts:sync', config),
  onShortcutTriggered: (callback: (commandId: string) => void): (() => void) => {
    const handler = (_event: unknown, commandId: string) => callback(commandId);
    ipcRenderer.on('shortcut:triggered', handler);
    return () => { ipcRenderer.removeListener('shortcut:triggered', handler); };
  },

  // === 실시간 담벼락 영속 보드 (v1.13 Stage A) ===
  // Design §3.4 — Main 프로세스가 fs 직접 접근하여 userData/data/wall-board-*.json 관리.
  wallBoards: {
    listMeta: (): Promise<unknown[]> =>
      ipcRenderer.invoke('realtime-wall:board:list-meta'),
    load: (args: { id: string }): Promise<unknown | null> =>
      ipcRenderer.invoke('realtime-wall:board:load', args),
    save: (args: { board: unknown }): Promise<{ savedAt: number }> =>
      ipcRenderer.invoke('realtime-wall:board:save', args),
    delete: (args: { id: string }): Promise<{ ok: true }> =>
      ipcRenderer.invoke('realtime-wall:board:delete', args),
    getByCode: (args: { shortCode: string }): Promise<unknown | null> =>
      ipcRenderer.invoke('realtime-wall:board:get-by-code', args),
    // before-quit 동기 저장 안전망. renderer가 상태 변경 즉시 스냅샷 push.
    stageDirty: (args: { board: unknown }): Promise<{ ok: true }> =>
      ipcRenderer.invoke('realtime-wall:board:stage-dirty', args),
    clearDirty: (args: { id: string }): Promise<{ ok: true }> =>
      ipcRenderer.invoke('realtime-wall:board:clear-dirty', args),
  },
});
