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
  // Auto-update
  checkForUpdate: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  onUpdateAvailable: (callback: (info: { version: string; releaseNotes?: string }) => void) => () => void;
  onUpdateDownloadProgress: (callback: (progress: { percent: number }) => void) => () => void;
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => () => void;
  onUpdateError: (callback: (error: string) => void) => () => void;
}

interface Window {
  electronAPI?: ElectronAPI;
}
