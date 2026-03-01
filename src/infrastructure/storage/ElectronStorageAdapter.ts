import type { IStoragePort } from '@domain/ports/IStoragePort';

export class ElectronStorageAdapter implements IStoragePort {
  async read<T>(filename: string): Promise<T | null> {
    const api = window.electronAPI;
    if (!api) {
      return null;
    }
    try {
      const raw = await api.readData(filename);
      if (raw === null) {
        return null;
      }
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async write<T>(filename: string, data: T): Promise<void> {
    const api = window.electronAPI;
    if (!api) {
      return;
    }
    await api.writeData(filename, JSON.stringify(data, null, 2));
  }
}
