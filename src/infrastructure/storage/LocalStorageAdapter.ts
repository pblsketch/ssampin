import { openDB, type IDBPDatabase } from 'idb';
import type { IStoragePort } from '@domain/ports/IStoragePort';

const PREFIX = 'ssampin:';

// 브라우저 폴백에서 바이너리는 localStorage 에 담을 수 없으므로
// 별도의 IndexedDB (ssampin-binaries) object store 를 사용한다.
const BIN_DB = 'ssampin-binaries';
const BIN_DB_VERSION = 1;
const BIN_STORE = 'form-binaries';

let binDbPromise: Promise<IDBPDatabase> | null = null;
function getBinDB(): Promise<IDBPDatabase> {
  if (!binDbPromise) {
    binDbPromise = openDB(BIN_DB, BIN_DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(BIN_STORE)) {
          db.createObjectStore(BIN_STORE);
        }
      },
    });
  }
  return binDbPromise;
}

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

  async remove(filename: string): Promise<void> {
    localStorage.removeItem(PREFIX + filename);
  }

  async readBinary(relPath: string): Promise<Uint8Array | null> {
    try {
      const db = await getBinDB();
      const value = await db.get(BIN_STORE, relPath);
      if (value === undefined || value === null) return null;
      if (value instanceof Uint8Array) return value;
      if (value instanceof ArrayBuffer) return new Uint8Array(value);
      return null;
    } catch {
      return null;
    }
  }

  async writeBinary(relPath: string, bytes: Uint8Array): Promise<void> {
    const db = await getBinDB();
    await db.put(BIN_STORE, bytes, relPath);
  }

  async removeBinary(relPath: string): Promise<void> {
    try {
      const db = await getBinDB();
      await db.delete(BIN_STORE, relPath);
    } catch {
      // no-op
    }
  }

  async listBinary(dirRelPath: string): Promise<readonly string[]> {
    try {
      const db = await getBinDB();
      const keys = await db.getAllKeys(BIN_STORE);
      const prefix = dirRelPath.endsWith('/') ? dirRelPath : `${dirRelPath}/`;
      const result: string[] = [];
      for (const k of keys) {
        if (typeof k !== 'string') continue;
        if (!k.startsWith(prefix)) continue;
        const rest = k.slice(prefix.length);
        if (rest.length === 0 || rest.includes('/')) continue;
        result.push(rest);
      }
      return result;
    } catch {
      return [];
    }
  }
}
