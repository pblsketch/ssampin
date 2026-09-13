import { describe, expect, it } from 'vitest';
import type { IStoragePort } from '@domain/ports/IStoragePort';
import { JsonRecordMapApplicationPort } from './JsonRecordMapApplicationPort';

class MemoryStorage implements IStoragePort {
  readonly data = new Map<string, unknown>();
  corruptReadback = false;
  async read<T>(filename: string): Promise<T | null> {
    const value = (this.data.get(filename) as T | undefined) ?? null;
    if (this.corruptReadback && filename === 'record-evidence' && value !== null) {
      return { records: [] } as T;
    }
    return value;
  }
  async write<T>(filename: string, value: T): Promise<void> {
    this.data.set(filename, value);
  }
  async replaceIfUnchanged<T>(filename: string, expected: T | null, next: T): Promise<boolean> {
    const current = (this.data.get(filename) as T | undefined) ?? null;
    if (JSON.stringify(current) !== JSON.stringify(expected)) return false;
    this.data.set(filename, next);
    return true;
  }
  async remove(filename: string): Promise<void> {
    this.data.delete(filename);
  }
  async readBinary(): Promise<Uint8Array | null> {
    return null;
  }
  async writeBinary(): Promise<void> {}
  async removeBinary(): Promise<void> {}
  async listBinary(): Promise<readonly string[]> {
    return [];
  }
}

describe('JsonRecordMapApplicationPort', () => {
  it('CAS 저장 뒤 실제 파일을 다시 읽어 같은지 확인한다', async () => {
    const storage = new MemoryStorage();
    const before = { records: [] };
    const after = {
      records: [
        {
          id: 'e1',
          studentRef: 's1',
          areas: ['subject' as const],
          content: '근거',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };
    storage.data.set('record-evidence', before);
    const port = new JsonRecordMapApplicationPort(storage);
    await expect(port.replaceEvidence(before, after)).resolves.toEqual({ kind: 'written' });

    storage.data.set('record-evidence', before);
    storage.corruptReadback = true;
    await expect(port.replaceEvidence(before, after)).resolves.toMatchObject({ kind: 'uncertain' });
  });

  it('CAS가 없는 저장소에서는 일반 write로 낮추지 않고 실패한다', async () => {
    const storage = new MemoryStorage();
    const noCas: IStoragePort = {
      read: storage.read.bind(storage),
      write: storage.write.bind(storage),
      remove: storage.remove.bind(storage),
      readBinary: storage.readBinary.bind(storage),
      writeBinary: storage.writeBinary.bind(storage),
      removeBinary: storage.removeBinary.bind(storage),
      listBinary: storage.listBinary.bind(storage),
    };
    const port = new JsonRecordMapApplicationPort(noCas);
    await expect(port.replaceThreads({ records: [] }, { records: [] })).resolves.toEqual({
      kind: 'conflict',
    });
  });

  it('missing file snapshot keeps null as the first CAS token', async () => {
    const storage = new MemoryStorage();
    const port = new JsonRecordMapApplicationPort(storage);
    const snapshot = await port.loadThreadsSnapshot();

    expect(snapshot).toEqual({ raw: null, data: { records: [] } });
    await expect(port.replaceThreads(snapshot.raw, { records: [] })).resolves.toEqual({
      kind: 'written',
    });
  });
});
