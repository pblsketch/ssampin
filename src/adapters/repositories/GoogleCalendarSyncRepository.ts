import type { ICalendarSyncRepository } from '@domain/repositories/ICalendarSyncRepository';
import type { GoogleAuthTokens } from '@domain/ports/IGoogleAuthPort';
import type { CalendarMapping } from '@domain/entities/CalendarMapping';
import type { SyncState } from '@domain/entities/SyncState';
import type { SyncQueueItem } from '@domain/entities/SyncQueueItem';
import type { IStoragePort } from '@domain/ports/IStoragePort';

interface CalendarSyncData {
  mappings: CalendarMapping[];
  syncState: SyncState;
}

const SYNC_DATA_FILE = 'calendar-sync';
const SYNC_QUEUE_FILE = 'calendar-sync-queue';
const TOKEN_KEY = 'calendar-tokens';

const DEFAULT_SYNC_STATE: SyncState = {
  status: 'idle',
  pendingChanges: 0,
  syncTokens: {},
};

export class GoogleCalendarSyncRepository implements ICalendarSyncRepository {
  constructor(private readonly storage: IStoragePort) {}

  // === 인증 토큰 (secureStorage 사용) ===

  async getAuthTokens(): Promise<GoogleAuthTokens | null> {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (api?.secureRead) {
      const raw = await api.secureRead(TOKEN_KEY);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as GoogleAuthTokens;
      } catch {
        return null;
      }
    }
    // 브라우저 폴백 (개발 모드)
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as GoogleAuthTokens;
    } catch {
      return null;
    }
  }

  async saveAuthTokens(tokens: GoogleAuthTokens): Promise<void> {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (api?.secureWrite) {
      await api.secureWrite(TOKEN_KEY, JSON.stringify(tokens));
      return;
    }
    // 브라우저 폴백
    localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
  }

  async deleteAuthTokens(): Promise<void> {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (api?.secureDelete) {
      await api.secureDelete(TOKEN_KEY);
      return;
    }
    localStorage.removeItem(TOKEN_KEY);
  }

  // === 매핑 ===

  private async readSyncData(): Promise<CalendarSyncData> {
    const data = await this.storage.read<CalendarSyncData>(SYNC_DATA_FILE);
    return data ?? { mappings: [], syncState: DEFAULT_SYNC_STATE };
  }

  private async writeSyncData(data: CalendarSyncData): Promise<void> {
    await this.storage.write(SYNC_DATA_FILE, data);
  }

  async getMappings(): Promise<readonly CalendarMapping[]> {
    const data = await this.readSyncData();
    return data.mappings;
  }

  async saveMappings(mappings: readonly CalendarMapping[]): Promise<void> {
    const data = await this.readSyncData();
    await this.writeSyncData({ ...data, mappings: [...mappings] });
  }

  // === 동기화 상태 ===

  async getSyncState(): Promise<SyncState> {
    const data = await this.readSyncData();
    return data.syncState;
  }

  async saveSyncState(state: SyncState): Promise<void> {
    const data = await this.readSyncData();
    await this.writeSyncData({ ...data, syncState: state });
  }

  // === 오프라인 큐 ===

  async getQueue(): Promise<readonly SyncQueueItem[]> {
    const data = await this.storage.read<SyncQueueItem[]>(SYNC_QUEUE_FILE);
    return data ?? [];
  }

  async addToQueue(item: SyncQueueItem): Promise<void> {
    const queue = [...(await this.getQueue()), item];
    await this.storage.write(SYNC_QUEUE_FILE, queue);
  }

  async removeFromQueue(id: string): Promise<void> {
    const queue = (await this.getQueue()).filter(item => item.id !== id);
    await this.storage.write(SYNC_QUEUE_FILE, [...queue]);
  }

  async clearQueue(): Promise<void> {
    await this.storage.write(SYNC_QUEUE_FILE, []);
  }
}
