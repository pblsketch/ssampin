import { contextBridge, ipcRenderer } from 'electron';

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
  closeWindow: (): Promise<void> => ipcRenderer.invoke('window:closeApp'),
  showSaveDialog: (options: {
    title: string;
    defaultPath: string;
    filters: { name: string; extensions: string[] }[];
  }): Promise<string | null> =>
    ipcRenderer.invoke('export:showSaveDialog', options),
  writeFile: (filePath: string, data: ArrayBuffer | string): Promise<void> =>
    ipcRenderer.invoke('export:writeFile', filePath, data),
  printToPDF: (): Promise<ArrayBuffer | null> =>
    ipcRenderer.invoke('export:printToPDF'),
  openFile: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('export:openFile', filePath),
  importAlarmAudio: (): Promise<{ name: string; dataUrl: string } | null> =>
    ipcRenderer.invoke('audio:importAlarm'),
  importShareFile: (): Promise<string | null> =>
    ipcRenderer.invoke('share:import'),
  onFileOpened: (callback: (filePath: string) => void): (() => void) => {
    const handler = (_event: unknown, filePath: string) => callback(filePath);
    ipcRenderer.on('share:file-opened', handler);
    return () => { ipcRenderer.removeListener('share:file-opened', handler); };
  },
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('shell:openExternal', url),
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
});
