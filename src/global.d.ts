interface ElectronAPI {
  readData: (filename: string) => Promise<string | null>;
  writeData: (filename: string, data: string) => Promise<void>;
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
  printToPDF: () => Promise<ArrayBuffer | null>;
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
  // Widget 리사이즈 (JS 기반, thickFrame: false 대응)
  resizeWidget: (edge: string, dx: number, dy: number) => Promise<void>;
  // Analytics
  onAnalyticsFlush: (callback: () => void) => () => void;
}

interface Window {
  electronAPI?: ElectronAPI;
}

declare const __APP_VERSION__: string;
