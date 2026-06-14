/**
 * IMaskMappingRepository 구현 — 복원표를 OS 암호화 저장소(Electron safeStorage)에 보관한다.
 *
 * - 평문 JSON 파일이 아니라 secureWrite/secureRead(OS 키체인 기반 암호화)에 저장.
 * - 단일 키에 세션 배열을 보관. 조회 시 만료분 자동 정리.
 * - 데스크톱 앱이 아니거나 secure API가 없으면 보관 불가(메모리 전용으로만 동작).
 * - 클라우드 동기화 대상 아님(syncRegistry 미등록).
 */
import type {
  IMaskMappingRepository,
  SavedMaskSession,
} from '@domain/ports/IMaskMappingRepository';

const STORE_KEY = 'markdown-convert:mask-sessions:v1';

interface SecureApi {
  read: (key: string) => Promise<string | null>;
  write: (key: string, value: string) => Promise<void>;
  del: (key: string) => Promise<void>;
}

export class SecureMaskMappingRepository implements IMaskMappingRepository {
  private secure(): SecureApi | null {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (!api) return null;
    return { read: api.secureRead, write: api.secureWrite, del: api.secureDelete };
  }

  async list(): Promise<SavedMaskSession[]> {
    const api = this.secure();
    if (!api) return [];
    const raw = await api.read(STORE_KEY);
    if (!raw) return [];
    let sessions: SavedMaskSession[];
    try {
      const parsed: unknown = JSON.parse(raw);
      sessions = Array.isArray(parsed) ? (parsed as SavedMaskSession[]) : [];
    } catch {
      return [];
    }
    const now = Date.now();
    const valid = sessions.filter((s) => s.expiresAt > now);
    if (valid.length !== sessions.length) {
      await api.write(STORE_KEY, JSON.stringify(valid));
    }
    return valid;
  }

  async save(session: SavedMaskSession): Promise<void> {
    const api = this.secure();
    if (!api) {
      throw new Error('이 기기에서는 보관 기능을 쓸 수 없어요(쌤핀 데스크톱 앱 전용).');
    }
    const existing = await this.list();
    const next = [session, ...existing.filter((s) => s.id !== session.id)];
    await api.write(STORE_KEY, JSON.stringify(next));
  }

  async remove(id: string): Promise<void> {
    const api = this.secure();
    if (!api) return;
    const existing = await this.list();
    await api.write(STORE_KEY, JSON.stringify(existing.filter((s) => s.id !== id)));
  }

  async clearAll(): Promise<void> {
    const api = this.secure();
    if (!api) return;
    await api.del(STORE_KEY);
  }
}
