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
  importShareFile: () => Promise<string | null>;
  onFileOpened: (callback: (filePath: string) => void) => () => void;
}

interface Window {
  electronAPI?: ElectronAPI;
}
