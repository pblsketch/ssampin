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
});
