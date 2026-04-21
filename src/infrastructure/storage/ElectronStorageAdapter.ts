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

  async readBinary(relPath: string): Promise<Uint8Array | null> {
    const api = window.electronAPI;
    if (!api?.forms) return null;
    const ab = await api.forms.readBinary(relPath);
    if (ab === null) return null;
    return new Uint8Array(ab);
  }

  async writeBinary(relPath: string, bytes: Uint8Array): Promise<void> {
    const api = window.electronAPI;
    if (!api?.forms) {
      throw new Error('electronAPI.forms 사용 불가 (preload 미로드)');
    }
    // Uint8Array view 를 정확히 ArrayBuffer 로 잘라 IPC 전송 (share 되는 경우 방지)
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    await api.forms.writeBinary(relPath, ab as ArrayBuffer);
  }

  async removeBinary(relPath: string): Promise<void> {
    const api = window.electronAPI;
    if (!api?.forms) return;
    await api.forms.removeBinary(relPath);
  }

  async listBinary(dirRelPath: string): Promise<readonly string[]> {
    const api = window.electronAPI;
    if (!api?.forms) return [];
    return api.forms.listBinary(dirRelPath);
  }
}
