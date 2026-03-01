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
});
