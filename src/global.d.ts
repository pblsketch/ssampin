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
  importShareFile: () => Promise<{ content: string | ArrayBuffer; fileType: 'ssampin' | 'xlsx' } | null>;
  onFileOpened: (callback: (filePath: string) => void) => () => void;
  openExternal: (url: string) => Promise<void>;
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
  // Live Survey
  startLiveSurvey: (data: {
    question: string;
    maxLength: number;
  }) => Promise<{ port: number; localIPs: string[] }>;
  stopLiveSurvey: () => Promise<void>;
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
}

interface Window {
  electronAPI?: ElectronAPI;
}

declare const __APP_VERSION__: string;
