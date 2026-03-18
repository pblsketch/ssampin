import { openDB, type IDBPDatabase } from 'idb';
import type { IStoragePort } from '@domain/ports/IStoragePort';

const DB_NAME = 'ssampin-mobile';
const DB_VERSION = 1;
const DATA_STORE = 'ssampin-data';
const AUTH_STORE = 'ssampin-auth';
const SYNC_STORE = 'ssampin-sync';

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
