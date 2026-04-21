import { openDB, type IDBPDatabase } from 'idb';
import type { IStoragePort } from '@domain/ports/IStoragePort';

const DB_NAME = 'ssampin-mobile';
/** v2: form-binaries object store 추가 (서식관리 Phase 1) */
const DB_VERSION = 2;
const DATA_STORE = 'ssampin-data';
const AUTH_STORE = 'ssampin-auth';
const SYNC_STORE = 'ssampin-sync';
const FORM_BIN_STORE = 'form-binaries';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(DATA_STORE)) {
          db.createObjectStore(DATA_STORE);
        }
        if (!db.objectStoreNames.contains(AUTH_STORE)) {
          db.createObjectStore(AUTH_STORE);
        }
        if (!db.objectStoreNames.contains(SYNC_STORE)) {
          db.createObjectStore(SYNC_STORE);
        }
        if (!db.objectStoreNames.contains(FORM_BIN_STORE)) {
          db.createObjectStore(FORM_BIN_STORE);
        }
      },
    });
  }
  return dbPromise;
}

export class IndexedDBStorageAdapter implements IStoragePort {
  async read<T>(filename: string): Promise<T | null> {
    try {
      const db = await getDB();
      const value = await db.get(DATA_STORE, filename);
      return (value as T) ?? null;
    } catch {
      return null;
    }
  }

  async write<T>(filename: string, data: T): Promise<void> {
    const db = await getDB();
    await db.put(DATA_STORE, data, filename);
  }

  async remove(filename: string): Promise<void> {
    const db = await getDB();
    await db.delete(DATA_STORE, filename);
  }

  async readBinary(relPath: string): Promise<Uint8Array | null> {
    try {
      const db = await getDB();
      const value = await db.get(FORM_BIN_STORE, relPath);
      if (value === undefined || value === null) return null;
      if (value instanceof Uint8Array) return value;
      if (value instanceof ArrayBuffer) return new Uint8Array(value);
      return null;
    } catch {
      return null;
    }
  }

  async writeBinary(relPath: string, bytes: Uint8Array): Promise<void> {
    const db = await getDB();
    // IndexedDB 는 Uint8Array 를 그대로 저장 가능
    await db.put(FORM_BIN_STORE, bytes, relPath);
  }

  async removeBinary(relPath: string): Promise<void> {
    try {
      const db = await getDB();
      await db.delete(FORM_BIN_STORE, relPath);
    } catch {
      // no-op
    }
  }

  async listBinary(dirRelPath: string): Promise<readonly string[]> {
    try {
      const db = await getDB();
      const keys = await db.getAllKeys(FORM_BIN_STORE);
      const prefix = dirRelPath.endsWith('/') ? dirRelPath : `${dirRelPath}/`;
      const result: string[] = [];
      for (const k of keys) {
        if (typeof k !== 'string') continue;
        if (!k.startsWith(prefix)) continue;
        const rest = k.slice(prefix.length);
        // 하위 디렉토리는 제외 (바로 하위 파일만)
        if (rest.length === 0 || rest.includes('/')) continue;
        result.push(rest);
      }
      return result;
    } catch {
      return [];
    }
  }
}

/** Auth 전용 스토어 읽기/쓰기 */
export async function readAuth<T>(key: string): Promise<T | null> {
  try {
    const db = await getDB();
    const value = await db.get(AUTH_STORE, key);
    return (value as T) ?? null;
  } catch {
    return null;
  }
}

export async function writeAuth<T>(key: string, data: T): Promise<void> {
  const db = await getDB();
  await db.put(AUTH_STORE, data, key);
}

export async function deleteAuth(key: string): Promise<void> {
  const db = await getDB();
  await db.delete(AUTH_STORE, key);
}
