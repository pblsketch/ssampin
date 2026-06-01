import type { IStoragePort } from '@domain/ports/IStoragePort';
import type {
  ClassroomAgreementSavedSession,
  ClassroomAgreementSession,
  ClassroomAgreementSessionsData,
} from '@domain/entities/ClassroomAgreement';
import type {
  IClassroomAgreementRepository,
  SaveClassroomAgreementSessionOptions,
} from '@domain/repositories/IClassroomAgreementRepository';
import {
  normalizeStoredSavedSessions,
  sanitizeClassroomAgreementSessionForSave,
} from '@domain/rules/classroomAgreementSanitization';

export const CLASSROOM_AGREEMENTS_STORAGE_KEY = 'classroom-agreements';

export class JsonClassroomAgreementRepository implements IClassroomAgreementRepository {
  constructor(private readonly storage: IStoragePort) {}

  async load(): Promise<ClassroomAgreementSessionsData | null> {
    const raw = await this.storage.read<{ readonly sessions?: readonly unknown[] }>(
      CLASSROOM_AGREEMENTS_STORAGE_KEY,
    );
    if (!raw) return null;
    return { sessions: normalizeStoredSavedSessions(raw.sessions) };
  }

  save(data: ClassroomAgreementSessionsData): Promise<void> {
    return this.storage.write(CLASSROOM_AGREEMENTS_STORAGE_KEY, {
      sessions: [...data.sessions],
    });
  }

  async list(): Promise<readonly ClassroomAgreementSavedSession[]> {
    const data = await this.load();
    return data?.sessions ? [...data.sessions] : [];
  }

  async saveSession(
    session: ClassroomAgreementSession,
    options: SaveClassroomAgreementSessionOptions = {},
  ): Promise<ClassroomAgreementSavedSession> {
    const saved = sanitizeClassroomAgreementSessionForSave(session, options);
    const current = await this.list();
    const next = [saved, ...current.filter((item) => item.id !== saved.id)];
    await this.save({ sessions: next });
    return saved;
  }

  async delete(id: string): Promise<void> {
    const current = await this.list();
    await this.save({ sessions: current.filter((item) => item.id !== id) });
  }
}
