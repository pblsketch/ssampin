import type { IStoragePort } from '@domain/ports/IStoragePort';

const PREFIX = 'ssampin:';

export class LocalStorageAdapter implements IStoragePort {
  async read<T>(filename: string): Promise<T | null> {
    try {
      const raw = localStorage.getItem(PREFIX + filename);
      if (raw === null) {
        return null;
      }
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async write<T>(filename: string, data: T): Promise<void> {
    localStorage.setItem(PREFIX + filename, JSON.stringify(data));
  }
}
