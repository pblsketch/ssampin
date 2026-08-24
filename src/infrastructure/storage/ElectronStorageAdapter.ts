import type { IStoragePort } from '@domain/ports/IStoragePort';

export class ElectronStorageAdapter implements IStoragePort {
  async read<T>(filename: string): Promise<T | null> {
    const api = window.electronAPI;
    if (!api) {
      return null;
    }
    // null은 "파일 없음"만 의미한다 — IPC 오류·본문 손상을 null로 삼키면 저장 경로가
    // 빈 파일로 오인해 기존 데이터를 편집분만으로 덮어쓴다(QA2 H3). 오류는 전파한다.
    const raw = await api.readData(filename);
    if (raw === null) {
      return null;
    }
    return JSON.parse(raw) as T;
  }

  async write<T>(filename: string, data: T): Promise<void> {
    const api = window.electronAPI;
    if (!api) {
      return;
    }
    await api.writeData(filename, JSON.stringify(data, null, 2));
  }

  async replaceIfUnchanged<T>(filename: string, expected: T | null, next: T): Promise<boolean> {
    const api = window.electronAPI;
    if (!api) return false;
    return api.writeDataIfUnchanged(
      filename,
      expected === null ? null : JSON.stringify(expected),
      JSON.stringify(next, null, 2),
    );
  }

  async remove(filename: string): Promise<void> {
    const api = window.electronAPI;
    if (!api) {
      return;
    }
    await api.removeData(filename);
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

  async replaceBinaryIfUnchanged(
    relPath: string,
    expected: Uint8Array | null,
    next: Uint8Array,
  ): Promise<boolean> {
    const api = window.electronAPI;
    if (!api?.forms) return false;
    const expectedBuffer = expected
      ? expected.buffer.slice(expected.byteOffset, expected.byteOffset + expected.byteLength)
      : null;
    const nextBuffer = next.buffer.slice(next.byteOffset, next.byteOffset + next.byteLength);
    return api.forms.writeBinaryIfUnchanged(
      relPath,
      expectedBuffer as ArrayBuffer | null,
      nextBuffer as ArrayBuffer,
    );
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
