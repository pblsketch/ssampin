import type {
  ClassroomAgreementSaveMode,
  ClassroomAgreementSavedSession,
  ClassroomAgreementSession,
  ClassroomAgreementSessionsData,
} from '@domain/entities/ClassroomAgreement';

export interface SaveClassroomAgreementSessionOptions {
  readonly saveMode?: ClassroomAgreementSaveMode;
  readonly savedAt?: number;
}

export interface IClassroomAgreementRepository {
  load(): Promise<ClassroomAgreementSessionsData | null>;
  save(data: ClassroomAgreementSessionsData): Promise<void>;
  list(): Promise<readonly ClassroomAgreementSavedSession[]>;
  saveSession(
    session: ClassroomAgreementSession,
    options?: SaveClassroomAgreementSessionOptions,
  ): Promise<ClassroomAgreementSavedSession>;
  delete(id: string): Promise<void>;
}
