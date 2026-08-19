import { contextBridge, ipcRenderer } from 'electron';
import { installDropGuard } from './security-guards';

/** 저장 공간 상태 뷰 — main의 StorageStatePayload와 형태를 맞춘다. */
interface StorageStateView {
  contentRoot: string;
  defaultRoot: string;
  configuredRoot: string | null;
  reason: 'default' | 'custom' | 'fallback-missing' | 'fallback-unwritable' | 'fallback-invalid';
  isCustom: boolean;
  contentBytes: number;
  cacheBytes: number;
  contentDirs: readonly { name: string; bytes: number }[];
}

// 가장 먼저 등록 — BrowserWindow의 어떤 dragover/drop 이벤트보다 일찍 가드.
// 모든 5개 BrowserWindow(main, widget, icon, quickAdd, stickerPicker)가 동일
// preload.js를 공유하므로 본 호출 1회로 전체 보호.
// Design §3.1, security-guards.ts 참조.
installDropGuard();

/** 단일/복수 선택 집계 */
type AggregatedSingleMulti = { counts: Record<string, number>; total: number };
/** 스케일 집계 */
type AggregatedScale = { avg: number; distribution: Record<number, number>; total: number };
/** 주관식 집계 (무기명) */
type AggregatedText = { answers: string[] };
/** 집계 결과 discriminated union */
type AggregatedResult = AggregatedSingleMulti | AggregatedScale | AggregatedText;

contextBridge.exposeInMainWorld('electronAPI', {
  readData: (filename: string): Promise<string | null> => ipcRenderer.invoke('data:read', filename),
  writeData: (filename: string, data: string): Promise<void> =>
    ipcRenderer.invoke('data:write', filename, data),
  removeData: (filename: string): Promise<void> => ipcRenderer.invoke('data:remove', filename),
  // AI 브릿지 — 외부 AI(Claude/Codex/Antigravity) 연결
  aiBridge: {
    register: (
      client: 'claude' | 'codex' | 'antigravity',
      opts?: { allowContent?: boolean; allowWrite?: boolean },
    ): Promise<unknown> => ipcRenderer.invoke('aiBridge:register', client, opts),
    status: (client: 'claude' | 'codex' | 'antigravity'): Promise<unknown> =>
      ipcRenderer.invoke('aiBridge:status', client),
    statusAll: (): Promise<unknown> => ipcRenderer.invoke('aiBridge:statusAll'),
    paths: (): Promise<unknown> => ipcRenderer.invoke('aiBridge:paths'),
    // 게이트 토글(읽기/쓰기/채점쓰기) 즉시 capability 기록 — [연결] 재등록·클라 재시작 없이 반영(#11).
    // 부분 갱신: 지정한 키만 바꾸고 나머지는 보존. allowWrite 면 loopback 서버 시작/정지.
    setCapability: (partial: {
      allowWrite?: boolean;
      allowContent?: boolean;
      allowGradeWrite?: boolean;
      allowRecordWrite?: boolean;
    }): Promise<{
      running: boolean;
      allowWrite: boolean;
      allowContent: boolean;
      allowGradeWrite: boolean;
      allowRecordWrite: boolean;
    }> => ipcRenderer.invoke('aiBridge:setCapability', partial),
    // 하위호환: 쓰기 허용 토글(= setCapability({allowWrite}))
    setLiveSync: (enabled: boolean): Promise<{ running: boolean }> =>
      ipcRenderer.invoke('aiBridge:setLiveSync', enabled),
    liveSyncStatus: (): Promise<{
      running: boolean;
      allowWrite: boolean;
      allowContent: boolean;
      allowGradeWrite: boolean;
      allowRecordWrite: boolean;
    }> => ipcRenderer.invoke('aiBridge:liveSyncStatus'),
    // main → 렌더러 쓰기 위임 수신. handler(req)→결과를 회신 채널로 돌려준다. cleanup 함수 반환.
    onApplyWrite: (handler: (req: unknown) => Promise<unknown>): (() => void) => {
      const listener = (_e: unknown, payload: { requestId: string; req: unknown }): void => {
        Promise.resolve(handler(payload.req)).then(
          (result) =>
            ipcRenderer.send('aiBridge:apply-write-result', {
              requestId: payload.requestId,
              result,
            }),
          () =>
            ipcRenderer.send('aiBridge:apply-write-result', {
              requestId: payload.requestId,
              result: { ok: false, status: 500, error: '렌더러 핸들러 오류' },
            }),
        );
      };
      ipcRenderer.on('aiBridge:apply-write', listener);
      return () => ipcRenderer.removeListener('aiBridge:apply-write', listener);
    },
  },
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
  setWidgetLayout: (mode: string): Promise<void> =>
    ipcRenderer.invoke('window:setWidgetLayout', mode),
  /**
   * Phase 7-G — native-desktop hover 시 globalShortcut(Ctrl+1~4)으로 layout 변경 신호 수신.
   *
   * native-desktop 모드(WS_CHILD)에선 위젯이 keyboard focus를 못 받아 renderer keydown
   * listener가 작동 안 함. main이 마우스 hover 시점에만 globalShortcut을 register하고 발사
   * 시점에 본 채널로 layout mode를 송신한다. renderer가 받아 setLayoutMode(mode) 호출.
   *
   * @param cb 콜백. mode는 'full' | 'split-h' | 'split-v' | 'quad'.
   * @returns 구독 해제 함수.
   */
  onLayoutShortcut: (cb: (mode: string) => void): (() => void) => {
    const handler = (_e: unknown, mode: string): void => cb(mode);
    ipcRenderer.on('widget:layout-shortcut', handler);
    return (): void => {
      ipcRenderer.off('widget:layout-shortcut', handler);
    };
  },
  /**
   * 모달이 열리면 main 에 globalShortcut('Escape') 등록 요청.
   * native-desktop 모드(WS_CHILD)에선 위젯이 keyboard focus 를 못 받아 renderer keydown
   * 리스너가 ESC 를 못 잡으므로 main 이 가로채 widget:modal-escape 채널로 송신한다.
   */
  requestModalEscape: (): Promise<void> => ipcRenderer.invoke('widget:request-modal-escape'),
  /** 모달이 닫히면 globalShortcut('Escape') 등록 해제 — 다른 앱의 ESC 정상 복구. */
  releaseModalEscape: (): Promise<void> => ipcRenderer.invoke('widget:release-modal-escape'),
  /** 모달 열린 동안 ESC press 수신. */
  onModalEscape: (cb: () => void): (() => void) => {
    const handler = (): void => cb();
    ipcRenderer.on('widget:modal-escape', handler);
    return (): void => {
      ipcRenderer.off('widget:modal-escape', handler);
    };
  },
  requestModalInput: (): Promise<void> => ipcRenderer.invoke('widget:request-modal-input'),
  releaseModalInput: (): Promise<void> => ipcRenderer.invoke('widget:release-modal-input'),
  applyWidgetSettings: (widget: { opacity: number; desktopMode: string }): Promise<void> =>
    ipcRenderer.invoke('window:applyWidgetSettings', widget),
  /** 윈도우 11 내장 유리(Acrylic) 켜기/끄기. 안 되는 환경에서는 ok:false 로 돌아온다. */
  setBackdropMaterial: (enabled: boolean): Promise<{ ok: boolean; reason?: string }> =>
    ipcRenderer.invoke('window:setBackdropMaterial', enabled),
  /**
   * Phase 7-C (native-desktop) — widget 헤더(`-webkit-app-region: drag`) 영역의 client DIP rect를
   * main에 등록한다. WH_MOUSE_LL hook이 LBUTTONDOWN을 헤더 안에서 받으면 widget을 마우스 따라
   * 이동시킨다. 일반 모드에서는 main이 caching만 하고 hook이 없으므로 무영향.
   *
   * Phase 7-C 회귀 fix: excludeRects는 drag 영역 내부에서 제외할 사각형(버튼 그룹 등).
   * 헤더 안의 no-drag 버튼 영역을 빼지 않으면 버튼 LBUTTONDOWN이 widget 이동으로 처리돼
   * 클릭이 동작하지 않음.
   *
   * mount/resize 시 갱신 호출. 빈 배열을 넘기면 drag 비활성화.
   */
  setWidgetHeaderRegion: (
    rects: { x: number; y: number; width: number; height: number }[],
    excludeRects?: { x: number; y: number; width: number; height: number }[],
  ): Promise<void> => ipcRenderer.invoke('widget:setHeaderRegion', rects, excludeRects ?? []),
  /**
   * Phase 7-D — widget 8개 resize edge의 client DIP rect 등록.
   *
   * native-desktop 모드(WS_CHILD)에서 nc resize가 작동 안 하므로 hook이 LBUTTONDOWN을
   * 등록된 edge에서 감지해 SetWindowPos로 widget 크기를 조절한다.
   * 일반/topmost 모드에서는 main이 setResizeRegions를 noop manager에 위임 → 무영향.
   *
   * mount/resize 시 호출. 빈 배열이면 resize 비활성.
   */
  setWidgetResizeRegion: (
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
  ): Promise<void> => ipcRenderer.invoke('widget:setResizeRegion', regions),
  /**
   * 바탕화면 아이콘 아래 모드 fallback 알림 수신 (v2.1.0~).
   *
   * native attach 실패 시 main process가 settings의 desktopMode를 fallbackMode로
   * 정정해야 하며, renderer는 이 콜백에서 토스트 + settings store 업데이트를 수행한다.
   *
   * @returns unsubscribe 함수
   */
  onDesktopModeFallback: (
    callback: (info: { reason: string; fallbackMode: 'normal' | 'topmost' }) => void,
  ): (() => void) => {
    const handler = (
      _event: unknown,
      info: { reason: string; fallbackMode: 'normal' | 'topmost' },
    ) => callback(info);
    ipcRenderer.on('desktopMode:fallback', handler);
    return () => {
      ipcRenderer.removeListener('desktopMode:fallback', handler);
    };
  },
  /**
   * native-desktop / widget 진단 로그 forwarding (디버깅용 — 임시).
   *
   * Main process는 stdout으로만 console.log를 내보내기 때문에 packaged 빌드에서는
   * cmd로 ssampin.exe를 실행하지 않으면 진단 흐름을 볼 수 없다. 본 listener는
   * main → renderer로 IPC mirror된 동일 메시지를 DevTools 콘솔에 그대로 출력한다.
   *
   * 참고: main 프로세스도 동일 메시지를 `app.getPath('userData')/native-desktop-diag.log`에
   * 기록한다 (메모장으로 열어 그대로 공유 가능).
   *
   * @returns unsubscribe 함수
   */
  onNativeDesktopDiag: (
    callback: (payload: { message: string; args?: unknown[] }) => void,
  ): (() => void) => {
    const handler = (_event: unknown, payload: { message: string; args?: unknown[] }) =>
      callback(payload);
    ipcRenderer.on('native-desktop:diag', handler);
    return () => {
      ipcRenderer.removeListener('native-desktop:diag', handler);
    };
  },
  /**
   * 진단 라운드 (2026-05-06) — 이슈 B/D 분석용 종합 dump 트리거.
   *
   * 사용자가 시나리오 재현 직후 DevTools 콘솔에서:
   *   `await electronAPI.widgetDiagDump('after-mode-toggle')` 또는 `'after-secondary-clicks')`
   * 를 호출하면 main process가 디스플레이/widget/WorkerW/Win32 state/routingStats를 한꺼번에
   * `native-desktop-diag.log`에 기록한다. label은 사용자가 어떤 시나리오 직후인지 식별하려고 적는 자유 문자열.
   *
   * 반환값 없음 — 결과는 파일 + DevTools 콘솔(IPC mirror)에 비동기로 흐른다.
   */
  widgetDiagDump: (label: string): Promise<void> => ipcRenderer.invoke('widget:diagDump', label),
  closeWindow: (): Promise<void> => ipcRenderer.invoke('window:closeApp'),
  // ─── 아이콘 모드 (v2.0.2~) ───
  iconShow: (): Promise<void> => ipcRenderer.invoke('icon:show'),
  iconHide: (): Promise<void> => ipcRenderer.invoke('icon:hide'),
  iconSetBounds: (bounds: { x: number; y: number }): Promise<void> =>
    ipcRenderer.invoke('icon:set-bounds', bounds),
  iconStartDrag: (): Promise<void> => ipcRenderer.invoke('icon:start-drag'),
  iconEndDrag: (): Promise<void> => ipcRenderer.invoke('icon:end-drag'),
  iconResetPosition: (): Promise<void> => ipcRenderer.invoke('icon:reset-position'),
  iconDragBy: (delta: { dx: number; dy: number }): Promise<void> =>
    ipcRenderer.invoke('icon:drag-by', delta),
  iconExpand: (target: { to: 'main' | 'widget' | 'restore' }): Promise<void> =>
    ipcRenderer.invoke('icon:expand', target),
  iconDiag: (payload: { event: string; data?: unknown }): Promise<void> =>
    ipcRenderer.invoke('icon:diag', payload),
  // 아이콘 창 확장/축소 (v2.2.7) — 말풍선·팝오버·메뉴 공간 확보. 반환 anchor 로 열림 방향 결정.
  iconSetExpanded: (
    expanded: boolean,
  ): Promise<{ expanded: boolean; anchor: { up: boolean; right: boolean } }> =>
    ipcRenderer.invoke('icon:set-expanded', expanded),
  // 확장 상태에서 빈 영역 클릭을 아래 창으로 통과시킬지 토글
  iconSetMouseIgnore: (ignore: boolean): Promise<void> =>
    ipcRenderer.invoke('icon:set-mouse-ignore', ignore),
  onIconLayout: (
    callback: (layout: { expanded: boolean; anchor: { up: boolean; right: boolean } }) => void,
  ): (() => void) => {
    const handler = (
      _event: unknown,
      layout: { expanded: boolean; anchor: { up: boolean; right: boolean } },
    ) => callback(layout);
    ipcRenderer.on('icon:layout', handler);
    return () => {
      ipcRenderer.removeListener('icon:layout', handler);
    };
  },
  onIconShown: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on('icon:shown', handler);
    return () => {
      ipcRenderer.removeListener('icon:shown', handler);
    };
  },
  // 저장 대화상자 — 경로 문자열 대신 1회용 핸들 + 표시용 파일명 반환 (메인이 경로를 보유).
  showSaveDialog: (options: {
    title: string;
    defaultPath: string;
    filters: { name: string; extensions: string[] }[];
  }): Promise<{ handle: string; fileName: string } | null> =>
    ipcRenderer.invoke('export:showSaveDialog', options),
  // 핸들로 쓰기 — handle 은 showSaveDialog 가 발급한 것. 1회 소비.
  writeFile: (handle: string, data: ArrayBuffer | string): Promise<void> =>
    ipcRenderer.invoke('export:writeFile', { handle, data }),
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
  }): Promise<ArrayBuffer | null> => ipcRenderer.invoke('export:printToPDF', options),
  // 방금 저장한 파일 열기 — handle 은 showSaveDialog 가 발급한 것 (소비하지 않음).
  openFile: (handle: string): Promise<void> => ipcRenderer.invoke('export:openFile', { handle }),
  importAlarmAudio: (): Promise<{ name: string; dataUrl: string } | null> =>
    ipcRenderer.invoke('audio:importAlarm'),
  importFont: (): Promise<{ name: string; dataUrl: string; mimeType: string } | null> =>
    ipcRenderer.invoke('font:import'),
  importShareFile: (): Promise<{
    content: string | ArrayBuffer;
    fileType: 'ssampin' | 'xlsx';
  } | null> => ipcRenderer.invoke('share:import'),
  importBookmarksFile: (): Promise<{ content: string; format: 'json' | 'html' } | null> =>
    ipcRenderer.invoke('bookmarks:import'),
  readClipboardText: (): Promise<string> => ipcRenderer.invoke('clipboard:readText'),
  onFileOpened: (callback: (filePath: string) => void): (() => void) => {
    const handler = (_event: unknown, filePath: string) => callback(filePath);
    ipcRenderer.on('share:file-opened', handler);
    return () => {
      ipcRenderer.removeListener('share:file-opened', handler);
    };
  },
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
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
  onUpdateAvailable: (
    callback: (info: { version: string; releaseNotes?: string; manualOnly?: boolean }) => void,
  ): (() => void) => {
    const handler = (
      _event: unknown,
      info: { version: string; releaseNotes?: string; manualOnly?: boolean },
    ) => callback(info);
    ipcRenderer.on('update:available', handler);
    return () => {
      ipcRenderer.removeListener('update:available', handler);
    };
  },
  onUpdateNotAvailable: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on('update:not-available', handler);
    return () => {
      ipcRenderer.removeListener('update:not-available', handler);
    };
  },
  onUpdateDownloadProgress: (callback: (progress: { percent: number }) => void): (() => void) => {
    const handler = (_event: unknown, progress: { percent: number }) => callback(progress);
    ipcRenderer.on('update:download-progress', handler);
    return () => {
      ipcRenderer.removeListener('update:download-progress', handler);
    };
  },
  onUpdateDownloaded: (callback: (info: { version: string }) => void): (() => void) => {
    const handler = (_event: unknown, info: { version: string }) => callback(info);
    ipcRenderer.on('update:update-downloaded', handler);
    return () => {
      ipcRenderer.removeListener('update:update-downloaded', handler);
    };
  },
  onUpdateError: (callback: (error: string) => void): (() => void) => {
    const handler = (_event: unknown, error: string) => callback(error);
    ipcRenderer.on('update:error', handler);
    return () => {
      ipcRenderer.removeListener('update:error', handler);
    };
  },
  // Cross-window navigation
  navigateToPage: (page: string): Promise<void> =>
    ipcRenderer.invoke('window:navigateToPage', page),
  onNavigateToPage: (callback: (page: string) => void): (() => void) => {
    const handler = (_event: unknown, page: string) => callback(page);
    ipcRenderer.on('navigate:to-page', handler);
    return () => {
      ipcRenderer.removeListener('navigate:to-page', handler);
    };
  },
  // Google OAuth — {code, redirectUri, codeVerifier} 묶음 반환 (별도 oauth:redirect-uri 이벤트 의존 제거)
  // codeVerifier: Desktop app 클라이언트는 OAuth 시크릿 없이 PKCE 로 토큰을 교환한다 (P0-C / F-2)
  startOAuth: (
    authUrl: string,
  ): Promise<{ code: string; redirectUri: string; codeVerifier: string }> =>
    ipcRenderer.invoke('oauth:start', authUrl),
  cancelOAuth: (): Promise<void> => ipcRenderer.invoke('oauth:cancel'),
  onOAuthRedirectUri: (callback: (uri: string) => void): (() => void) => {
    const handler = (_event: unknown, uri: string) => callback(uri);
    ipcRenderer.on('oauth:redirect-uri', handler);
    return () => {
      ipcRenderer.removeListener('oauth:redirect-uri', handler);
    };
  },
  onOAuthError: (callback: (error: { code: string; message: string }) => void): (() => void) => {
    const handler = (_event: unknown, error: { code: string; message: string }) => callback(error);
    ipcRenderer.on('oauth:error', handler);
    return () => {
      ipcRenderer.removeListener('oauth:error', handler);
    };
  },
  // OAuth 콜백 미수신 → PKCE 폴백 제안
  onOAuthFallbackNeeded: (
    callback: (data: { reason: string; message: string; elapsedSec: number }) => void,
  ): (() => void) => {
    const handler = (
      _event: unknown,
      data: { reason: string; message: string; elapsedSec: number },
    ) => callback(data);
    ipcRenderer.on('oauth:fallback-needed', handler);
    return () => {
      ipcRenderer.removeListener('oauth:fallback-needed', handler);
    };
  },
  // Google OAuth PKCE 폴백 (로컬 서버 실패 시 — loopback 모드)
  startPKCEAuth: (authUrl: string): Promise<{ verifier: string; redirectUri: string }> =>
    ipcRenderer.invoke('oauth:pkce-start', authUrl),
  exchangePKCECode: (): Promise<{ verifier: string; redirectUri: string }> =>
    ipcRenderer.invoke('oauth:pkce-exchange'),
  // Secure Storage
  secureWrite: (key: string, value: string): Promise<void> =>
    ipcRenderer.invoke('secure:write', key, value),
  secureRead: (key: string): Promise<string | null> => ipcRenderer.invoke('secure:read', key),
  secureDelete: (key: string): Promise<void> => ipcRenderer.invoke('secure:delete', key),
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
  }): Promise<{ port: number; localIPs: string[] }> => ipcRenderer.invoke('live-vote:start', data),
  stopLiveVote: (): Promise<void> => ipcRenderer.invoke('live-vote:stop'),
  onLiveVoteStudentVoted: (
    callback: (data: { optionId: string; totalVoters: number }) => void,
  ): (() => void) => {
    const handler = (_event: unknown, data: { optionId: string; totalVoters: number }) =>
      callback(data);
    ipcRenderer.on('live-vote:student-voted', handler);
    return () => {
      ipcRenderer.removeListener('live-vote:student-voted', handler);
    };
  },
  onLiveVoteConnectionCount: (callback: (data: { count: number }) => void): (() => void) => {
    const handler = (_event: unknown, data: { count: number }) => callback(data);
    ipcRenderer.on('live-vote:connection-count', handler);
    return () => {
      ipcRenderer.removeListener('live-vote:connection-count', handler);
    };
  },
  // Live Vote Tunnel
  tunnelAvailable: (): Promise<boolean> => ipcRenderer.invoke('live-vote:tunnel-available'),
  tunnelInstall: (): Promise<void> => ipcRenderer.invoke('live-vote:tunnel-install'),
  tunnelStart: (): Promise<{ tunnelUrl: string }> => ipcRenderer.invoke('live-vote:tunnel-start'),
  // Live Survey
  startLiveSurvey: (data: {
    question: string;
    maxLength: number;
  }): Promise<{ port: number; localIPs: string[] }> =>
    ipcRenderer.invoke('live-survey:start', data),
  stopLiveSurvey: (): Promise<void> => ipcRenderer.invoke('live-survey:stop'),
  surveyTunnelAvailable: (): Promise<boolean> => ipcRenderer.invoke('live-survey:tunnel-available'),
  surveyTunnelInstall: (): Promise<void> => ipcRenderer.invoke('live-survey:tunnel-install'),
  surveyTunnelStart: (): Promise<{ tunnelUrl: string }> =>
    ipcRenderer.invoke('live-survey:tunnel-start'),
  onLiveSurveyStudentSubmitted: (
    callback: (data: { text: string; totalResponders: number }) => void,
  ): (() => void) => {
    const handler = (_event: unknown, data: { text: string; totalResponders: number }) =>
      callback(data);
    ipcRenderer.on('live-survey:student-submitted', handler);
    return () => {
      ipcRenderer.removeListener('live-survey:student-submitted', handler);
    };
  },
  onLiveSurveyConnectionCount: (callback: (data: { count: number }) => void): (() => void) => {
    const handler = (_event: unknown, data: { count: number }) => callback(data);
    ipcRenderer.on('live-survey:connection-count', handler);
    return () => {
      ipcRenderer.removeListener('live-survey:connection-count', handler);
    };
  },
  // Realtime Wall
  startRealtimeWall: (data: {
    title: string;
    maxTextLength: number;
  }): Promise<{ port: number; localIPs: string[] }> =>
    ipcRenderer.invoke('realtime-wall:start', data),
  stopRealtimeWall: (): Promise<void> => ipcRenderer.invoke('realtime-wall:stop'),
  startClassroomAgreement: (data: {
    session: unknown;
  }): Promise<{ port: number; localIPs: string[] }> =>
    ipcRenderer.invoke('classroom-agreement:start', data),
  stopClassroomAgreement: (): Promise<void> => ipcRenderer.invoke('classroom-agreement:stop'),
  classroomAgreementTunnelAvailable: (): Promise<boolean> =>
    ipcRenderer.invoke('classroom-agreement:tunnel-available'),
  classroomAgreementTunnelInstall: (): Promise<void> =>
    ipcRenderer.invoke('classroom-agreement:tunnel-install'),
  classroomAgreementTunnelStart: (): Promise<{ tunnelUrl: string }> =>
    ipcRenderer.invoke('classroom-agreement:tunnel-start'),
  getClassroomAgreementState: (): Promise<unknown | null> =>
    ipcRenderer.invoke('classroom-agreement:get-state'),
  setClassroomAgreementPhase: (data: { command: string }): Promise<{ phase: string }> =>
    ipcRenderer.invoke('classroom-agreement:phase-command', data),
  updateClassroomAgreementSession: (data: { session: unknown }): Promise<void> =>
    ipcRenderer.invoke('classroom-agreement:update-session', data),
  onClassroomAgreementEvent: (callback: (event: unknown) => void): (() => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data);
    ipcRenderer.on('classroom-agreement:event', handler);
    return () => {
      ipcRenderer.removeListener('classroom-agreement:event', handler);
    };
  },
  realtimeWallTunnelAvailable: (): Promise<boolean> =>
    ipcRenderer.invoke('realtime-wall:tunnel-available'),
  realtimeWallTunnelInstall: (): Promise<void> =>
    ipcRenderer.invoke('realtime-wall:tunnel-install'),
  realtimeWallTunnelStart: (): Promise<{ tunnelUrl: string }> =>
    ipcRenderer.invoke('realtime-wall:tunnel-start'),
  fetchRealtimeWallLinkPreview: (url: string) =>
    ipcRenderer.invoke('realtime-wall:fetch-link-preview', url),
  // 동일한 OG 파싱 IPC를 도메인 중립적인 이름으로 재노출 (북마크 등에서 사용)
  fetchLinkPreview: (url: string) => ipcRenderer.invoke('realtime-wall:fetch-link-preview', url),
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
  }): Promise<void> => ipcRenderer.invoke('realtime-wall:broadcast', msg),
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
  onRealtimeWallStudentEdit: (
    callback: (data: { postId: string; post: unknown }) => void,
  ): (() => void) => {
    const handler = (_event: unknown, data: { postId: string; post: unknown }) => callback(data);
    ipcRenderer.on('realtime-wall:student-edit', handler);
    return () => {
      ipcRenderer.removeListener('realtime-wall:student-edit', handler);
    };
  },
  /**
   * v2.1 Phase D — 학생 자기 카드 삭제(soft delete) 알림 (교사 entry).
   */
  onRealtimeWallStudentDelete: (callback: (data: { postId: string }) => void): (() => void) => {
    const handler = (_event: unknown, data: { postId: string }) => callback(data);
    ipcRenderer.on('realtime-wall:student-delete', handler);
    return () => {
      ipcRenderer.removeListener('realtime-wall:student-delete', handler);
    };
  },
  /**
   * v2.1 Phase D — 닉네임 변경 broadcast 알림 (교사 entry).
   */
  onRealtimeWallNicknameChanged: (
    callback: (data: { postIds: readonly string[]; newNickname: string }) => void,
  ): (() => void) => {
    const handler = (_event: unknown, data: { postIds: readonly string[]; newNickname: string }) =>
      callback(data);
    ipcRenderer.on('realtime-wall:nickname-changed', handler);
    return () => {
      ipcRenderer.removeListener('realtime-wall:nickname-changed', handler);
    };
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
  onRealtimeWallStudentMove: (
    callback: (data: { postId: string; post: unknown }) => void,
  ): (() => void) => {
    const handler = (_event: unknown, data: { postId: string; post: unknown }) => callback(data);
    ipcRenderer.on('realtime-wall:student-move', handler);
    return () => {
      ipcRenderer.removeListener('realtime-wall:student-move', handler);
    };
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
  onRealtimeWallStudentLike: (
    callback: (data: { postId: string; likes: number; likedBy: readonly string[] }) => void,
  ): (() => void) => {
    const handler = (
      _event: unknown,
      data: {
        postId: string;
        likes: number;
        likedBy: readonly string[];
      },
    ) => callback(data);
    ipcRenderer.on('realtime-wall:student-like', handler);
    return () => {
      ipcRenderer.removeListener('realtime-wall:student-like', handler);
    };
  },
  /**
   * v1.14 P2 — 학생 댓글 도착 알림.
   */
  onRealtimeWallStudentComment: (
    callback: (data: {
      postId: string;
      comment: {
        id: string;
        nickname: string;
        text: string;
        submittedAt: number;
        sessionToken: string;
        status: 'approved' | 'hidden';
      };
    }) => void,
  ): (() => void) => {
    const handler = (
      _event: unknown,
      data: {
        postId: string;
        comment: {
          id: string;
          nickname: string;
          text: string;
          submittedAt: number;
          sessionToken: string;
          status: 'approved' | 'hidden';
        };
      },
    ) => callback(data);
    ipcRenderer.on('realtime-wall:student-comment', handler);
    return () => {
      ipcRenderer.removeListener('realtime-wall:student-comment', handler);
    };
  },
  // v2.1 student-ux 회귀 fix (2026-04-24): post payload에 v2.1 필드 + status/kanban/freeform
  // 등 RealtimeWallPost 전체 필드를 포함. 서버가 도메인 createWallPost로 카드를 직접 생성한
  // 결과를 그대로 전달하므로 renderer는 재계산 X — 그대로 setPosts에 merge.
  onRealtimeWallStudentSubmitted: (
    callback: (data: { post: unknown; totalSubmissions: number }) => void,
  ): (() => void) => {
    const handler = (
      _event: unknown,
      data: {
        post: unknown;
        totalSubmissions: number;
      },
    ) => callback(data);
    ipcRenderer.on('realtime-wall:student-submitted', handler);
    return () => {
      ipcRenderer.removeListener('realtime-wall:student-submitted', handler);
    };
  },
  onRealtimeWallConnectionCount: (callback: (data: { count: number }) => void): (() => void) => {
    const handler = (_event: unknown, data: { count: number }) => callback(data);
    ipcRenderer.on('realtime-wall:connection-count', handler);
    return () => {
      ipcRenderer.removeListener('realtime-wall:connection-count', handler);
    };
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
  stopLiveMultiSurvey: (): Promise<void> => ipcRenderer.invoke('live-multi-survey:stop'),
  multiSurveyTunnelAvailable: (): Promise<boolean> =>
    ipcRenderer.invoke('live-multi-survey:tunnel-available'),
  multiSurveyTunnelInstall: (): Promise<void> =>
    ipcRenderer.invoke('live-multi-survey:tunnel-install'),
  multiSurveyTunnelStart: (): Promise<{ tunnelUrl: string }> =>
    ipcRenderer.invoke('live-multi-survey:tunnel-start'),
  onLiveMultiSurveyStudentSubmitted: (
    callback: (data: {
      answers: Array<{ questionId: string; value: string | string[] | number }>;
      submissionId: string;
      totalSubmissions: number;
    }) => void,
  ): (() => void) => {
    const handler = (
      _event: unknown,
      data: {
        answers: Array<{ questionId: string; value: string | string[] | number }>;
        submissionId: string;
        totalSubmissions: number;
      },
    ) => callback(data);
    ipcRenderer.on('live-multi-survey:student-submitted', handler);
    return () => {
      ipcRenderer.removeListener('live-multi-survey:student-submitted', handler);
    };
  },
  onLiveMultiSurveyConnectionCount: (callback: (data: { count: number }) => void): (() => void) => {
    const handler = (_event: unknown, data: { count: number }) => callback(data);
    ipcRenderer.on('live-multi-survey:connection-count', handler);
    return () => {
      ipcRenderer.removeListener('live-multi-survey:connection-count', handler);
    };
  },
  // Live Multi Survey — step mode controls
  liveMultiSurveyActivateSession: (): Promise<void> =>
    ipcRenderer.invoke('live-multi-survey:activate-session'),
  liveMultiSurveyReveal: (): Promise<void> => ipcRenderer.invoke('live-multi-survey:reveal'),
  liveMultiSurveyAdvance: (): Promise<void> => ipcRenderer.invoke('live-multi-survey:advance'),
  liveMultiSurveyPrev: (): Promise<void> => ipcRenderer.invoke('live-multi-survey:prev'),
  liveMultiSurveyReopen: (): Promise<void> => ipcRenderer.invoke('live-multi-survey:reopen'),
  liveMultiSurveyEndSession: (): Promise<void> =>
    ipcRenderer.invoke('live-multi-survey:end-session'),
  // Live Multi Survey — step mode events
  onLiveMultiSurveyStudentAnswered: (
    callback: (data: {
      sessionId: string;
      nickname: string;
      questionIndex: number;
      totalAnswered: number;
      totalConnected: number;
      aggregatedPreview: AggregatedResult | null;
      answer?: { optionIds?: string[]; text?: string; scale?: number };
    }) => void,
  ): (() => void) => {
    const handler = (
      _event: unknown,
      data: {
        sessionId: string;
        nickname: string;
        questionIndex: number;
        totalAnswered: number;
        totalConnected: number;
        aggregatedPreview: AggregatedResult | null;
        answer?: { optionIds?: string[]; text?: string; scale?: number };
      },
    ) => callback(data);
    ipcRenderer.on('live-multi-survey:student-answered', handler);
    return () => {
      ipcRenderer.removeListener('live-multi-survey:student-answered', handler);
    };
  },
  onLiveMultiSurveyPhaseChanged: (
    callback: (data: {
      phase: 'lobby' | 'open' | 'revealed' | 'ended';
      currentQuestionIndex: number;
      totalAnswered: number;
      totalConnected: number;
      aggregated?: AggregatedResult;
    }) => void,
  ): (() => void) => {
    const handler = (
      _event: unknown,
      data: {
        phase: 'lobby' | 'open' | 'revealed' | 'ended';
        currentQuestionIndex: number;
        totalAnswered: number;
        totalConnected: number;
        aggregated?: AggregatedResult;
      },
    ) => callback(data);
    ipcRenderer.on('live-multi-survey:phase-changed', handler);
    return () => {
      ipcRenderer.removeListener('live-multi-survey:phase-changed', handler);
    };
  },
  onLiveMultiSurveyRoster: (
    callback: (data: {
      roster: Array<{ sessionId: string; nickname: string; answeredQuestions: number[] }>;
    }) => void,
  ): (() => void) => {
    const handler = (
      _event: unknown,
      data: {
        roster: Array<{ sessionId: string; nickname: string; answeredQuestions: number[] }>;
      },
    ) => callback(data);
    ipcRenderer.on('live-multi-survey:roster', handler);
    return () => {
      ipcRenderer.removeListener('live-multi-survey:roster', handler);
    };
  },
  onLiveMultiSurveyTextAnswerDetail: (
    callback: (data: {
      questionIndex: number;
      entries: Array<{ sessionId: string; nickname: string; text: string }>;
    }) => void,
  ): (() => void) => {
    const handler = (
      _event: unknown,
      data: {
        questionIndex: number;
        entries: Array<{ sessionId: string; nickname: string; text: string }>;
      },
    ) => callback(data);
    ipcRenderer.on('live-multi-survey:text-answer-detail', handler);
    return () => {
      ipcRenderer.removeListener('live-multi-survey:text-answer-detail', handler);
    };
  },
  // DN-03: 학생 wave 이벤트 수신 (교사 콘솔 아바타 pulse)
  onLiveMultiSurveyStudentWave: (
    callback: (data: { sessionId: string; studentId: string }) => void,
  ): (() => void) => {
    const handler = (_event: unknown, data: { sessionId: string; studentId: string }) =>
      callback(data);
    ipcRenderer.on('live-multi-survey:student-wave', handler);
    return () => {
      ipcRenderer.removeListener('live-multi-survey:student-wave', handler);
    };
  },
  // DN-06: 교사 집중 모드 토글 → 학생 WebSocket broadcast
  liveMultiSurveyToggleFocusMode: (active: boolean): Promise<void> =>
    ipcRenderer.invoke('live-multi-survey:toggle-focus-mode', { active }),
  // 작업 1: MultiSurvey Share view (교실 화면 별도 창)
  openMultiSurveyShareWindow: (entryUrl: string): Promise<void> =>
    ipcRenderer.invoke('multi-survey-share:open', { entryUrl }),
  closeMultiSurveyShareWindow: (): Promise<void> => ipcRenderer.invoke('multi-survey-share:close'),
  sendMultiSurveyShareSnapshot: (snapshot: unknown): void => {
    ipcRenderer.send('multi-survey-share:snapshot', snapshot);
  },
  onMultiSurveyShareSnapshot: (callback: (snapshot: unknown) => void): (() => void) => {
    const handler = (_event: unknown, s: unknown) => callback(s);
    ipcRenderer.on('multi-survey-share:snapshot', handler);
    return () => {
      ipcRenderer.removeListener('multi-survey-share:snapshot', handler);
    };
  },
  // Live Word Cloud
  startLiveWordCloud: (data: {
    question: string;
    maxSubmissions: number;
  }): Promise<{ port: number; localIPs: string[] }> =>
    ipcRenderer.invoke('live-wordcloud:start', data),
  stopLiveWordCloud: (): Promise<void> => ipcRenderer.invoke('live-wordcloud:stop'),
  onLiveWordCloudWordSubmitted: (
    callback: (data: { word: string; count: number; totalWords: number }) => void,
  ): (() => void) => {
    const handler = (_event: unknown, data: { word: string; count: number; totalWords: number }) =>
      callback(data);
    ipcRenderer.on('live-wordcloud:word-submitted', handler);
    return () => {
      ipcRenderer.removeListener('live-wordcloud:word-submitted', handler);
    };
  },
  onLiveWordCloudConnectionCount: (callback: (data: { count: number }) => void): (() => void) => {
    const handler = (_event: unknown, data: { count: number }) => callback(data);
    ipcRenderer.on('live-wordcloud:connection-count', handler);
    return () => {
      ipcRenderer.removeListener('live-wordcloud:connection-count', handler);
    };
  },
  // Live Word Cloud Tunnel
  wordcloudTunnelAvailable: (): Promise<boolean> =>
    ipcRenderer.invoke('live-wordcloud:tunnel-available'),
  wordcloudTunnelInstall: (): Promise<void> => ipcRenderer.invoke('live-wordcloud:tunnel-install'),
  wordcloudTunnelStart: (): Promise<{ tunnelUrl: string }> =>
    ipcRenderer.invoke('live-wordcloud:tunnel-start'),
  // Live Discussion (Value Line / Traffic Light)
  startDiscussion: (config: {
    toolType: string;
    topics: string[];
  }): Promise<{ port: number; localIPs: string[] }> =>
    ipcRenderer.invoke('discussion:start', config),
  stopDiscussion: (): Promise<void> => ipcRenderer.invoke('discussion:stop'),
  discussionNextRound: (): Promise<void> => ipcRenderer.invoke('discussion:next-round'),
  discussionGetState: (): Promise<{
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
  } | null> => ipcRenderer.invoke('discussion:get-state'),
  onDiscussionConnectionCount: (callback: (count: number) => void): (() => void) => {
    const handler = (_event: unknown, data: { count: number }) => callback(data.count);
    ipcRenderer.on('discussion:connection-count', handler);
    return () => {
      ipcRenderer.removeListener('discussion:connection-count', handler);
    };
  },
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
  ): (() => void) => {
    const handler = (
      _event: unknown,
      state: {
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
      },
    ) => callback(state);
    ipcRenderer.on('discussion:state', handler);
    return () => {
      ipcRenderer.removeListener('discussion:state', handler);
    };
  },
  onDiscussionChat: (
    callback: (chat: {
      name: string;
      emoji: string;
      avatarColor: string;
      text: string;
      time: string;
    }) => void,
  ): (() => void) => {
    const handler = (
      _event: unknown,
      chat: { name: string; emoji: string; avatarColor: string; text: string; time: string },
    ) => callback(chat);
    ipcRenderer.on('discussion:chat', handler);
    return () => {
      ipcRenderer.removeListener('discussion:chat', handler);
    };
  },
  // Discussion Tunnel
  discussionTunnelAvailable: (): Promise<boolean> =>
    ipcRenderer.invoke('discussion:tunnel-available'),
  discussionTunnelInstall: (): Promise<void> => ipcRenderer.invoke('discussion:tunnel-install'),
  discussionTunnelStart: (): Promise<{ tunnelUrl: string }> =>
    ipcRenderer.invoke('discussion:tunnel-start'),
  // Widget 리사이즈 (JS 기반, thickFrame: false 대응)
  resizeWidget: (edge: string, dx: number, dy: number): Promise<void> =>
    ipcRenderer.invoke('window:resizeWidget', edge, dx, dy),
  // Analytics flush
  onAnalyticsFlush: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on('analytics:flush', handler);
    return () => {
      ipcRenderer.removeListener('analytics:flush', handler);
    };
  },
  // Close action dialog
  onCloseActionAsk: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on('close-action:ask', handler);
    return () => {
      ipcRenderer.removeListener('close-action:ask', handler);
    };
  },
  respondCloseAction: (action: 'widget' | 'tray' | 'icon' | 'quit' | 'sidePin'): void => {
    ipcRenderer.send('close-action:respond', action);
  },
  // 옆핀 — 창이 알려 주는 상태를 받고, 화면의 의도를 되돌려 보낸다.
  // 판단은 전부 main의 controller가 하므로 여기서는 나르기만 한다.
  sidePin: {
    reportReady: (): void => ipcRenderer.send('sidePin:renderer-ready'),
    getState: (): Promise<unknown> => ipcRenderer.invoke('sidePin:get-state'),
    onStateChanged: (callback: (state: unknown) => void): (() => void) => {
      const handler = (_event: unknown, state: unknown) => callback(state);
      ipcRenderer.on('sidePin:state-changed', handler);
      return () => {
        ipcRenderer.removeListener('sidePin:state-changed', handler);
      };
    },
    onPanelShown: (callback: () => void): (() => void) => {
      const handler = (): void => callback();
      ipcRenderer.on('sidePin:panel-shown', handler);
      return () => ipcRenderer.removeListener('sidePin:panel-shown', handler);
    },
    /** 포인터가 손잡이·패널의 어느 구역에 있는지 (물리 입력 보고) */
    reportPointerRegion: (region: string): void => {
      ipcRenderer.send('sidePin:pointer-region', region);
    },
    startRailDrag: (): void => {
      ipcRenderer.send('sidePin:rail-drag-start');
    },
    endRailDrag: (): void => {
      ipcRenderer.send('sidePin:rail-drag-end');
    },
    togglePin: (zone: 'widget' | 'memo' | 'both'): void => {
      ipcRenderer.send('sidePin:toggle-pin', zone);
    },
    /** 단축키로 옆핀을 열고 닫는다 (메인 창 포커스 시 렌더러 keydown 폴백용) */
    toggleShortcut: (): void => {
      ipcRenderer.send('sidePin:toggle-shortcut');
    },
    requestClose: (): void => {
      ipcRenderer.send('sidePin:request-close');
    },
    /** 메인 쌤핀으로 돌아간다 */
    openMain: (): void => {
      ipcRenderer.send('sidePin:open-main');
    },
    /**
     * 패널을 실제로 그렸다.
     *
     * 이 신호가 있어야 "여는 중"이 "펼쳐짐"으로 확정된다. 없으면 3초 뒤 감시에 걸려
     * 도로 닫힌다. 어느 요청에 대한 응답인지는 main이 대조하므로 여기서는 알 필요 없다.
     */
    reportPainted: (): void => {
      ipcRenderer.send('sidePin:painted');
    },
    /**
     * 메모를 쓰는 중인지 알린다.
     *
     * 옆핀은 마우스가 벗어나면 접힌다. 그런데 글을 쓰는 사람은 키보드만 쓰고 마우스는
     * 아무 데나 두므로, 이 신호가 없으면 **타이핑 도중 패널이 접혀 쓰던 글이 날아간다.**
     */
    reportEditorActivity: (activity: string): void => {
      ipcRenderer.send('sidePin:editor-activity', activity);
    },
  },
  // Cross-window data sync
  onDataChanged: (callback: (filename: string) => void): (() => void) => {
    const handler = (_event: unknown, filename: string) => callback(filename);
    ipcRenderer.on('data:changed', handler);
    return () => {
      ipcRenderer.removeListener('data:changed', handler);
    };
  },
  // 절전/잠금 복귀 알림 (렌더러에서 날짜/데이터 갱신용)
  onSystemResume: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on('system:resume', handler);
    return () => {
      ipcRenderer.removeListener('system:resume', handler);
    };
  },

  // === 학생 관찰 기록 알림 — OS 토스트 발화 (reminder, P3) ===
  // 렌더러가 forward 스케줄을 계산해 push → main 상시 타이머가 예정 시각에 발화(S1).
  scheduleReminders: (
    items: Array<{
      reminderId: string;
      fireAt: number;
      title: string;
      body: string;
      studentDedupKey: string;
    }>,
  ): void => {
    ipcRenderer.send('reminder:schedule', items);
  },
  clearReminderSchedule: (): void => {
    ipcRenderer.send('reminder:clear');
  },
  // 토스트 클릭 시 opaque reminderId 수신 (학생/프롬프트 해석은 렌더러 몫 — 레이어·프라이버시).
  onReminderClick: (callback: (reminderId: string) => void): (() => void) => {
    const handler = (_event: unknown, reminderId: string) => callback(reminderId);
    ipcRenderer.on('reminder:click', handler);
    return () => {
      ipcRenderer.removeListener('reminder:click', handler);
    };
  },
  // 토스트 발화 직후 dedup 키 수신 → 렌더러 발화 장부에 기록(중복 방지).
  onReminderFired: (callback: (studentDedupKey: string) => void): (() => void) => {
    const handler = (_event: unknown, studentDedupKey: string) => callback(studentDedupKey);
    ipcRenderer.on('reminder:fired', handler);
    return () => {
      ipcRenderer.removeListener('reminder:fired', handler);
    };
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
    openFile: (relPath: string): Promise<void> => ipcRenderer.invoke('forms:openFile', { relPath }),
    printPdf: (relPath: string): Promise<void> => ipcRenderer.invoke('forms:printPdf', { relPath }),
  },

  // === 마크다운 변환기 (markdown-convert) ===
  // 파일 선택 + kordoc 파싱을 메인에서 일괄 수행 (파일 경로·원본 bytes 미노출, 로컬 전용).
  markdownConvert: {
    pickAndParse: (): Promise<
      | { status: 'canceled' }
      | {
          status: 'ok';
          fileName: string;
          markdown: string;
          format: string;
          isImageBased: boolean;
          warnings: string[];
          metadata?: {
            title?: string;
            author?: string;
            creator?: string;
            createdAt?: string;
            pageCount?: number;
            version?: string;
          };
          outline?: Array<{ level: number; text: string }>;
          textQuality?: {
            needsReview: boolean;
            reason?: 'image_based' | 'low_text' | 'high_pua' | 'high_control' | 'high_replacement';
          };
        }
      | { status: 'error'; code: string; message: string }
    > => ipcRenderer.invoke('markdown-convert:pick-and-parse'),
    pickAndParseMulti: (): Promise<
      Array<
        | {
            status: 'ok';
            fileName: string;
            markdown: string;
            format: string;
            isImageBased: boolean;
            warnings: string[];
            metadata?: {
              title?: string;
              author?: string;
              creator?: string;
              createdAt?: string;
              pageCount?: number;
              version?: string;
            };
            outline?: Array<{ level: number; text: string }>;
            textQuality?: {
              needsReview: boolean;
              reason?:
                | 'image_based'
                | 'low_text'
                | 'high_pua'
                | 'high_control'
                | 'high_replacement';
            };
          }
        | { status: 'error'; code: string; message: string }
      >
    > => ipcRenderer.invoke('markdown-convert:pick-and-parse-multi'),
    parseBuffer: (
      bytes: Uint8Array,
      fileName: string,
    ): Promise<
      | { status: 'canceled' }
      | {
          status: 'ok';
          fileName: string;
          markdown: string;
          format: string;
          isImageBased: boolean;
          warnings: string[];
          metadata?: {
            title?: string;
            author?: string;
            creator?: string;
            createdAt?: string;
            pageCount?: number;
            version?: string;
          };
          outline?: Array<{ level: number; text: string }>;
          textQuality?: {
            needsReview: boolean;
            reason?: 'image_based' | 'low_text' | 'high_pua' | 'high_control' | 'high_replacement';
          };
        }
      | { status: 'error'; code: string; message: string }
    > => ipcRenderer.invoke('markdown-convert:parse-buffer', { bytes, fileName }),
    saveZip: (
      files: Array<{ name: string; text: string }>,
      zipName?: string,
    ): Promise<
      { status: 'canceled' } | { status: 'saved' } | { status: 'error'; message: string }
    > => ipcRenderer.invoke('markdown-convert:save-zip', { files, zipName }),
    saveHwpx: (
      markdown: string,
      suggestedName?: string,
    ): Promise<
      { status: 'canceled' } | { status: 'saved' } | { status: 'error'; message: string }
    > => ipcRenderer.invoke('markdown-convert:save-hwpx', { markdown, suggestedName }),
    saveHwpxZip: (
      files: Array<{ name: string; markdown: string }>,
      zipName?: string,
    ): Promise<
      { status: 'canceled' } | { status: 'saved' } | { status: 'error'; message: string }
    > => ipcRenderer.invoke('markdown-convert:save-hwpx-zip', { files, zipName }),
  },

  // === 내가 만든 앱(미니앱) 파일 저장 (miniapp) ===
  // 앱 HTML·아이콘을 <userData>/miniapps/<id>/ 로컬 파일로 저장/삭제/조회. 쌤핀 renderer 전용
  // (미니앱 webview는 preload가 없어 이 채널에 도달 불가 — 설계상 격리).
  miniApp: {
    save: (id: string, html: Uint8Array): Promise<void> =>
      ipcRenderer.invoke('miniapp:save', id, html),
    saveIcon: (id: string, bytes: Uint8Array, ext: string): Promise<string> =>
      ipcRenderer.invoke('miniapp:saveIcon', id, bytes, ext),
    remove: (id: string): Promise<void> => ipcRenderer.invoke('miniapp:remove', id),
    list: (): Promise<string[]> => ipcRenderer.invoke('miniapp:list'),
  },

  // === 학교 평가 운영계획 불러오기 (schoolinfo-evaluation) ===
  // 학교알리미 평가계획 hwp 자동 다운로드 + kordoc 파싱(메인, 로컬). 결과 markdown 만 반환.
  schoolinfoEvaluation: {
    searchSchools: (
      word: string,
    ): Promise<
      | {
          status: 'ok';
          hits: Array<{ shlIdfCd: string; name: string; address: string; kind: string }>;
        }
      | { status: 'error'; message: string }
    > => ipcRenderer.invoke('schoolinfo-evaluation:search-schools', { word }),
    listDocs: (args: {
      shlIdfCd: string;
      schoolName: string;
      year: number;
      item?: 'evaluation' | 'curriculum';
    }): Promise<
      | { status: 'ok'; docs: Array<{ seq: string; filename: string; sizeKB?: number }> }
      | { status: 'error'; message: string }
    > => ipcRenderer.invoke('schoolinfo-evaluation:list-docs', args),
    downloadDoc: (args: {
      shlIdfCd: string;
      schoolName: string;
      year: number;
      seq: string;
      item?: 'evaluation' | 'curriculum';
    }): Promise<
      | {
          status: 'ok';
          fileName: string;
          markdown: string;
          isImageBased: boolean;
          needsOcr: boolean;
        }
      | { status: 'error'; code: string; message: string }
    > => ipcRenderer.invoke('schoolinfo-evaluation:download-doc', args),
  },

  // === 학교알리미 공시 조회 (schoolinfo-disclosure) ===
  // 학교알리미 OpenAPI(openApi.do) 지역 공시 조회 — main 의 safeFetch 경유. 인증키는 renderer 가 주입.
  schoolinfoDisclosure: {
    getAreaDisclosure: (args: {
      apiKey: string;
      apiType: string;
      schulKndCode: string;
      sidoCode: string;
      sggCode: string;
      pbanYr: string;
    }): Promise<
      { status: 'ok'; list: Array<Record<string, unknown>> } | { status: 'error'; message: string }
    > => ipcRenderer.invoke('schoolinfo-disclosure:get-area', args),
  },

  // === 컴시간알리미 (comcigan) — 교사 시간표 불러오기 ===
  // comci.net 은 CORS 미지원이라 main 의 safeFetch 가 바이트만 대신 수신 (파싱은 renderer).
  comcigan: {
    fetchRaw: (
      path: string,
    ): Promise<{ status: 'ok'; body: ArrayBuffer } | { status: 'error'; message: string }> =>
      ipcRenderer.invoke('comcigan:fetch', { path }),
  },

  // === 압핀 (appin, sgpap.com) — 학급/교사 시간표 불러오기 ===
  // sgpap.com 은 CORS 미지원이라 main 의 safeFetch 가 바이트만 대신 수신 (파싱은 renderer).
  appin: {
    fetch: (args: {
      path: string;
      method?: 'GET' | 'POST';
      body?: string;
    }): Promise<{ status: 'ok'; body: ArrayBuffer } | { status: 'error'; message: string }> =>
      ipcRenderer.invoke('appin:fetch', args),
  },

  // === 협업 보드 (collab-board) ===
  // Design §4.1 14개 채널을 서브객체로 그루핑 (기존 flat 패턴과의 절충 — 채널 많음)
  collabBoard: {
    list: (): Promise<unknown[]> => ipcRenderer.invoke('collab-board:list'),
    create: (args: {
      name?: string;
      templateId?: string;
      userTemplateId?: string;
    }): Promise<unknown> => ipcRenderer.invoke('collab-board:create', args),
    userTemplateList: (): Promise<unknown[]> =>
      ipcRenderer.invoke('collab-board:user-template-list'),
    userTemplateSave: (args: { id: string; name?: string }): Promise<unknown> =>
      ipcRenderer.invoke('collab-board:user-template-save', args),
    userTemplateDelete: (args: { id: string }): Promise<{ ok: true }> =>
      ipcRenderer.invoke('collab-board:user-template-delete', args),
    rename: (args: { id: string; name: string }): Promise<unknown> =>
      ipcRenderer.invoke('collab-board:rename', args),
    delete: (args: { id: string }): Promise<{ ok: true }> =>
      ipcRenderer.invoke('collab-board:delete', args),
    startSession: (args: { id: string }): Promise<unknown> =>
      ipcRenderer.invoke('collab-board:start-session', args),
    endSession: (args: { id: string; forceSave: boolean }): Promise<{ ok: true }> =>
      ipcRenderer.invoke('collab-board:end-session', args),
    getActiveSession: (): Promise<unknown> => ipcRenderer.invoke('collab-board:get-active-session'),
    saveSnapshot: (args: { id: string }): Promise<{ savedAt: number }> =>
      ipcRenderer.invoke('collab-board:save-snapshot', args),
    tunnelAvailable: (): Promise<{ available: boolean }> =>
      ipcRenderer.invoke('collab-board:tunnel-available'),
    tunnelInstall: (): Promise<{ ok: true }> => ipcRenderer.invoke('collab-board:tunnel-install'),

    onParticipantChange: (
      cb: (data: { boardId: string; names: string[] }) => void,
    ): (() => void) => {
      const handler = (_e: unknown, data: { boardId: string; names: string[] }) => cb(data);
      ipcRenderer.on('collab-board:participant-change', handler);
      return () => {
        ipcRenderer.removeListener('collab-board:participant-change', handler);
      };
    },
    onAutoSave: (cb: (data: { boardId: string; savedAt: number }) => void): (() => void) => {
      const handler = (_e: unknown, data: { boardId: string; savedAt: number }) => cb(data);
      ipcRenderer.on('collab-board:auto-save', handler);
      return () => {
        ipcRenderer.removeListener('collab-board:auto-save', handler);
      };
    },
    onSessionError: (cb: (data: { boardId: string; reason: string }) => void): (() => void) => {
      const handler = (_e: unknown, data: { boardId: string; reason: string }) => cb(data);
      ipcRenderer.on('collab-board:session-error', handler);
      return () => {
        ipcRenderer.removeListener('collab-board:session-error', handler);
      };
    },
    onSessionStarted: (cb: (data: unknown) => void): (() => void) => {
      const handler = (_e: unknown, data: unknown) => cb(data);
      ipcRenderer.on('collab-board:session-started', handler);
      return () => {
        ipcRenderer.removeListener('collab-board:session-started', handler);
      };
    },
  },

  // === 글로벌 퀵애드 단축키 ===
  syncShortcuts: (config: {
    globalEnabled: boolean;
    bindings: Array<{ id: string; combo: string; enabled: boolean }>;
  }): Promise<{ registered: string[]; failed: string[] }> =>
    ipcRenderer.invoke('shortcuts:sync', config),
  setShortcutCaptureActive: (active: boolean): void => {
    ipcRenderer.send('shortcuts:capture-active', active);
  },
  onShortcutTriggered: (callback: (commandId: string) => void): (() => void) => {
    const handler = (_event: unknown, commandId: string) => callback(commandId);
    ipcRenderer.on('shortcut:triggered', handler);
    return () => {
      ipcRenderer.removeListener('shortcut:triggered', handler);
    };
  },

  // === 실시간 담벼락 영속 보드 (v1.13 Stage A) ===
  // Design §3.4 — Main 프로세스가 fs 직접 접근하여 userData/data/wall-board-*.json 관리.
  wallBoards: {
    listMeta: (): Promise<unknown[]> => ipcRenderer.invoke('realtime-wall:board:list-meta'),
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

  // === 백업·복원·데이터 위치 센터 ===
  // 외부 서버 전송 없음 — 모든 처리가 사용자 디스크 안에서만 일어난다.
  backup: {
    /** 사용자 데이터 루트 + JSON 디렉토리 + 존재 여부 */
    getDataLocation: (): Promise<{
      userDataPath: string;
      dataDirPath: string;
      exists: boolean;
    }> => ipcRenderer.invoke('backup:getDataLocation'),
    /** OS 파일 탐색기로 데이터 디렉토리 열기 */
    openDataLocation: (): Promise<{ ok: boolean; reason?: string }> =>
      ipcRenderer.invoke('backup:openDataLocation'),
    /** 백업 파일 저장 (Save dialog → JSON 직렬화 → 디스크 저장). 아카이브도 함께 담는다(S2.1b). */
    exportBackup: (): Promise<{
      canceled: boolean;
      filePath?: string;
      entryCount?: number;
      archiveTermCount?: number;
      archiveTotalBytes?: number;
      archiveError?: string;
    }> => ipcRenderer.invoke('backup:export'),
    /** 백업 파일 가져오기 (Open dialog → 검증 → safety backup → 아카이브 복원 → atomic write) */
    importBackup: (): Promise<{
      canceled: boolean;
      restoredCount?: number;
      restoredFilenames?: readonly string[];
      safetyBackupPath?: string;
      metadata?: {
        schemaVersion: number;
        appVersion: string;
        exportedAt: string;
        platform: string;
        entryCount: number;
      };
      error?: {
        code:
          | 'file-read-failed'
          | 'invalid-json'
          | 'invalid-structure'
          | 'unsupported-future-version'
          | 'empty-data'
          | 'write-failed';
        message: string;
      };
      restoredArchiveTerms?: readonly string[];
      skippedArchiveTerms?: readonly string[];
    }> => ipcRenderer.invoke('backup:import'),
    /** 안전 백업 즉시 생성 (S2.4 전환 실행 1단계). 실패는 {ok:false}로 표면화 — throw 없음. */
    createSafetyBackup: (): Promise<{ ok: true; path: string } | { ok: false; error: string }> =>
      ipcRenderer.invoke('backup:createSafety'),
  },

  // === 저장 공간 — 자료 폴더 위치 변경 + 임시 파일 정리 ===
  // 자료(data·forms·obs-attachments·miniapps)만 옮긴다. Chromium 캐시·로그인 세션은
  // 기본 위치에 남으므로 폴더를 옮겨도 재로그인이 필요 없다. 상세는 electron/dataRoot.ts.
  storage: {
    /** 현재 자료 폴더 위치 + 자료/임시파일 용량 */
    getState: (): Promise<StorageStateView> => ipcRenderer.invoke('storage:getState'),
    /** 자료 폴더를 OS 탐색기로 열기 */
    openContentFolder: (): Promise<{ ok: boolean; reason?: string }> =>
      ipcRenderer.invoke('storage:openContentFolder'),
    /** 폴더 선택 → 검증 → 이사. 성공 시 needsRestart=true. */
    chooseAndMove: (): Promise<{
      canceled: boolean;
      ok?: boolean;
      message?: string;
      contentRoot?: string;
      preservedOriginals?: readonly string[];
      needsRestart?: boolean;
      state?: StorageStateView;
    }> => ipcRenderer.invoke('storage:chooseAndMove'),
    /** 기본 위치로 되돌리기(실제 이사 수행) */
    resetLocation: (): Promise<{
      ok: boolean;
      message?: string;
      needsRestart?: boolean;
      state?: StorageStateView;
    }> => ipcRenderer.invoke('storage:resetLocation'),
    /** 임시 파일 정리 — 자료·로그인 상태는 건드리지 않는다 */
    clearCache: (): Promise<{
      ok: boolean;
      freedBytes: number;
      skipped: readonly string[];
      state: StorageStateView;
    }> => ipcRenderer.invoke('storage:clearCache'),
    /** 앱 재시작 */
    relaunch: (): Promise<void> => ipcRenderer.invoke('storage:relaunch'),
  },

  // === 학년도 보관함(아카이브) — S2.1 ===
  // {userData}/data/archives/{term}/ 스냅샷 + manifest.json(체크섬). 전 채널이 명시적
  // {ok:true,...}|{ok:false,error} 반환 — 실패를 조용히 삼키지 않는다(data:write와 다름).
  archive: {
    /**
     * 아카이브 생성. fileKeys: 데이터 키('students' → data/students.json) 또는
     * 바이너리 상대경로('obs-attachments/{name}' — 관찰 첨부는 data/ 밖).
     */
    create: (
      term: string,
      fileKeys: string[],
      opts?: { label?: string },
    ): Promise<
      | {
          ok: true;
          term: string;
          archiveId: string;
          round: number;
          label: string;
          entryCount: number;
          totalBytes: number;
        }
      | { ok: false; error: string }
    > => ipcRenderer.invoke('archive:create', term, fileKeys, opts),
    /** 보관함 목록 — 학기별 매니페스트 요약(손상 시 manifestOk:false + 사유). */
    list: (): Promise<
      | {
          ok: true;
          archives: readonly {
            term: string;
            label: string;
            archivedAt: string;
            appVersion: string;
            entryCount: number;
            totalBytes: number;
            manifestOk: boolean;
            error?: string;
          }[];
        }
      | { ok: false; error: string }
    > => ipcRenderer.invoke('archive:list'),
    /** 보관된 파일 읽기 — 매니페스트 체크섬 일치 시에만 내용 반환. */
    read: (
      term: string,
      fileKey: string,
    ): Promise<
      { ok: true; encoding: 'utf8' | 'base64'; content: string } | { ok: false; error: string }
    > => ipcRenderer.invoke('archive:read', term, fileKey),
    /**
     * (S4.1) Drive 동기화 다운로드 배치 — 학기 1개 분량 파일 묶음을 스테이징+검증 후
     * 원자적으로 들여온다. 이미 있는 학기는 무변경 스킵(skipped:true — 아카이브 불변).
     */
    import: (
      term: string,
      files: Record<string, { format: 'utf8' | 'base64'; content: string }>,
    ): Promise<
      | { ok: true; term: string; skipped: boolean; entryCount: number }
      | { ok: false; error: string }
    > => ipcRenderer.invoke('archive:import', term, files),
    /** 학기 보관함 삭제 — archives/{term} 디렉토리만 지운다(라이브 데이터 무변경). */
    delete: (
      term: string,
    ): Promise<{ ok: true; existed: boolean } | { ok: false; error: string }> =>
      ipcRenderer.invoke('archive:delete', term),
  },

  // === 내 이모티콘 (Sticker picker — PRD §4.1) ===
  sticker: {
    selectImage: (): Promise<{ canceled: boolean; filePaths: string[] }> =>
      ipcRenderer.invoke('sticker:select-image'),
    importImage: (stickerId: string, sourcePath: string): Promise<{ contentHash: string }> =>
      ipcRenderer.invoke('sticker:import-image', { stickerId, sourcePath }),
    getImageDataUrl: (stickerId: string): Promise<string | null> =>
      ipcRenderer.invoke('sticker:get-image-data-url', stickerId),
    deleteImage: (stickerId: string): Promise<void> =>
      ipcRenderer.invoke('sticker:delete-image', stickerId),
    /**
     * 다중 이모티콘 PNG를 ZIP 한 파일로 묶어 사용자가 지정한 위치에 저장.
     * filename은 ZIP 안에 들어갈 사용자 친화 이름(.png 포함). 충돌은 main에서 자동 재명명.
     */
    exportZip: (
      items: ReadonlyArray<{ stickerId: string; filename: string }>,
    ): Promise<{
      canceled: boolean;
      filePath?: string;
      count?: number;
      missing?: number;
    }> => ipcRenderer.invoke('sticker:export-zip', { items }),
    paste: (
      stickerId: string,
      restorePreviousClipboard: boolean,
      flattenAlphaOnPaste?: boolean,
    ): Promise<{ ok: boolean; autoPasted: boolean; reason?: string }> =>
      ipcRenderer.invoke('sticker:paste', {
        stickerId,
        restorePreviousClipboard,
        flattenAlphaOnPaste,
      }),
    closePicker: (): Promise<void> => ipcRenderer.invoke('sticker:close-picker'),
    triggerToggle: (): Promise<void> => ipcRenderer.invoke('sticker:trigger-toggle'),
    /**
     * PRD §3.1.4 — globalShortcut.register() 실패 시 메인 프로세스가
     * 메인 창에 송신하는 이벤트. 렌더러는 토스트 + 설정 안내 표시.
     */
    onShortcutConflict: (callback: (combo: string) => void): (() => void) => {
      const handler = (_event: unknown, payload: { combo: string }) => callback(payload.combo);
      ipcRenderer.on('sticker:shortcut-conflict', handler);
      return () => {
        ipcRenderer.removeListener('sticker:shortcut-conflict', handler);
      };
    },
    /**
     * 메인 창의 관리 화면이 metadata를 저장한 직후 호출.
     * Main이 별도 피커 BrowserWindow에 `sticker:data-changed` 이벤트를 송신한다.
     */
    notifyDataChanged: (): Promise<void> => ipcRenderer.invoke('sticker:notify-data-changed'),
    /**
     * 피커 윈도우 측에서 데이터 변경 알림을 구독한다.
     * 호출 시 store load 다시 트리거 → UI 즉시 반영.
     */
    onDataChanged: (callback: () => void): (() => void) => {
      const handler = () => callback();
      ipcRenderer.on('sticker:data-changed', handler);
      return () => {
        ipcRenderer.removeListener('sticker:data-changed', handler);
      };
    },
    /**
     * 피커 빈 상태에서 "쌤도구 열기" 클릭 시 호출.
     * Main 창을 tool-sticker 페이지로 이동시키고 피커 윈도우는 hide.
     */
    openManager: (): Promise<void> => ipcRenderer.invoke('sticker:open-manager'),
    /**
     * macOS 전용 — 접근성 권한 요청. paste 결과 reason='accessibility-denied'
     * 토스트의 "권한 허용하기" 버튼이 호출. 시스템 다이얼로그 표시 + 보안 패널 자동 오픈.
     */
    requestAccessibilityPermission: (): Promise<{
      granted: boolean;
      requested: boolean;
      reason?: string;
    }> => ipcRenderer.invoke('sticker:request-accessibility-permission'),
    /**
     * 자동 Ctrl+V/Cmd+V 시뮬레이션이 실패했을 때 메인 윈도우에서 사용자에게
     * "수동으로 Ctrl+V 붙여넣기" 안내 토스트를 표시하기 위한 이벤트 구독.
     *
     * 피커 윈도우는 paste 시점에 즉시 hide되므로 피커 측 토스트는 보이지 않는다.
     * 따라서 메인 윈도우(MainApp)에서 본 리스너를 등록해 토스트를 띄워야 한다.
     */
    onFallbackPasteNeeded: (callback: (data: { reason: string }) => void): (() => void) => {
      const handler = (_event: unknown, data: { reason: string }) => callback(data);
      ipcRenderer.on('sticker:fallback-paste-needed', handler);
      return () => {
        ipcRenderer.removeListener('sticker:fallback-paste-needed', handler);
      };
    },
    /**
     * sticker:paste 진단 로그를 메인 프로세스에서 DevTools 콘솔로 forwarding.
     * MainApp에서 구독하면 cmd 없이도 DevTools Console에서 흐름 추적 가능.
     */
    onDiagLog: (callback: (payload: { message: string; data: unknown }) => void): (() => void) => {
      const handler = (_e: unknown, payload: { message: string; data: unknown }) =>
        callback(payload);
      ipcRenderer.on('sticker:diag-log', handler);
      return () => {
        ipcRenderer.removeListener('sticker:diag-log', handler);
      };
    },
    /**
     * 현재 OS 플랫폼 — 렌더러가 macOS 전용 UI(접근성 안내 배너 등)를 조건부 렌더링.
     */
    getPlatform: (): Promise<{ platform: 'win32' | 'darwin' | 'linux' }> =>
      ipcRenderer.invoke('sticker:get-platform'),
    // ─── 시트 분할 (Phase 2B / PRD §3.4.3) ───
    /** 시트 dimension 검증 — renderer가 grid size 선택 전 호출 */
    validateSheet: (sourcePath: string): Promise<{ width: number; height: number }> =>
      ipcRenderer.invoke('sticker:validate-sheet', { sourcePath }),
    /** 시트를 N×N으로 분할 + 미리보기 dataUrl + sessionId 반환 */
    splitSheet: (
      sourcePath: string,
      gridSize: 2 | 3 | 4,
    ): Promise<{
      sessionId: string;
      gridSize: 2 | 3 | 4;
      sheetWidth: number;
      sheetHeight: number;
      cells: Array<{
        index: number;
        row: number;
        col: number;
        contentHash: string;
        isEmpty: boolean;
        dataUrl: string;
      }>;
    }> => ipcRenderer.invoke('sticker:split-sheet', { sourcePath, gridSize }),
    /** 사용자가 선택한 셀들을 stickers/{id}.png로 저장 */
    commitSheetCells: (
      sessionId: string,
      cells: Array<{ index: number; stickerId: string }>,
    ): Promise<{
      committed: Array<{ index: number; stickerId: string; contentHash: string }>;
    }> => ipcRenderer.invoke('sticker:commit-sheet-cells', { sessionId, cells }),
    /** 분할 세션 취소 (모달 닫기 시) */
    cancelSheetSession: (sessionId: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('sticker:cancel-sheet-session', { sessionId }),
  },

  // ─────────────────────────────────────────────────────────────
  // Interactive Slides (Pear Deck 스타일, v2.2.x+)
  // ─────────────────────────────────────────────────────────────
  interactiveSlides: {
    // Source — Google Slides URL → 이미지 캐시 (메인 프로세스 API 키 격리)
    fetchFromGoogle: (args: { url: string }) =>
      ipcRenderer.invoke('slides-source:fetch-from-google', args),

    // Source — PDF (renderer 측에서 pdfjs-dist로 렌더 후 PNG 바이트 전달)
    renderPdf: (args: unknown) => ipcRenderer.invoke('slides-source:render-pdf', args),

    // 로컬 IPv4 후보 (Plan §11.7 — VPN/다중 NIC 환경에서 학생 폰 접속 URL 결정)
    getLocalIpCandidates: () =>
      ipcRenderer.invoke('slides-session:get-local-ip') as Promise<{
        candidates: readonly string[];
      }>,

    // Session lifecycle (교사 액션)
    startSession: (args: unknown) => ipcRenderer.invoke('slides-session:start', args),
    beginPresentation: (args: unknown) =>
      ipcRenderer.invoke('slides-session:begin-presentation', args),
    stopSession: () => ipcRenderer.invoke('slides-session:stop'),
    advanceSlide: (args: unknown) => ipcRenderer.invoke('slides-session:advance-slide', args),
    activateOverlay: (args: unknown) => ipcRenderer.invoke('slides-session:activate-overlay', args),
    deactivateOverlay: (args: unknown) =>
      ipcRenderer.invoke('slides-session:deactivate-overlay', args),
    endLesson: (args: unknown) => ipcRenderer.invoke('slides-session:end-lesson', args),
    /** 교사 heartbeat — 5초마다 호출. 10초 누락 시 학생에게 teacher-disconnected broadcast */
    teacherHeartbeat: () => ipcRenderer.invoke('slides-session:teacher-heartbeat') as Promise<void>,

    // 터널 모드 (Plan §11.3)
    tunnelAvailable: () =>
      ipcRenderer.invoke('slides-session:tunnel-available') as Promise<boolean>,
    tunnelStart: () =>
      ipcRenderer.invoke('slides-session:tunnel-start') as Promise<{ tunnelUrl: string }>,

    // Server → Teacher 이벤트 구독 (cleanup unsubscribe 반환)
    onTeacherEvent: (callback: (event: unknown) => void): (() => void) => {
      const handler = (_event: unknown, data: unknown): void => callback(data);
      ipcRenderer.on('slides-session:teacher-event', handler);
      return (): void => {
        ipcRenderer.removeListener('slides-session:teacher-event', handler);
      };
    },
  },
});
