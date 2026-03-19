/**
 * 모바일 DI 컨테이너
 * IndexedDB 기반 스토리지 사용, Electron 의존성 제외
 */
import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { INeisPort } from '@domain/ports/INeisPort';
import type { IScheduleRepository } from '@domain/repositories/IScheduleRepository';
import type { ISeatingRepository } from '@domain/repositories/ISeatingRepository';
import type { IEventsRepository } from '@domain/repositories/IEventsRepository';
import type { IMemoRepository } from '@domain/repositories/IMemoRepository';
import type { ITodoRepository } from '@domain/repositories/ITodoRepository';
import type { ISettingsRepository } from '@domain/repositories/ISettingsRepository';
import type { IStudentRecordsRepository } from '@domain/repositories/IStudentRecordsRepository';
import type { IMessageRepository } from '@domain/repositories/IMessageRepository';
import type { IStudentRepository } from '@domain/repositories/IStudentRepository';
import type { ISeatConstraintsRepository } from '@domain/repositories/ISeatConstraintsRepository';
import type { ITeachingClassRepository } from '@domain/repositories/ITeachingClassRepository';
import type { IBookmarkRepository } from '@domain/repositories/IBookmarkRepository';
import type { IDDayRepository } from '@domain/repositories/IDDayRepository';
import type { IGoogleAuthPort } from '@domain/ports/IGoogleAuthPort';
import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';
import type { IDriveSyncRepository } from '@domain/repositories/IDriveSyncRepository';

import { IndexedDBStorageAdapter } from '@infrastructure/storage/IndexedDBStorageAdapter';
import { NeisApiClient } from '@infrastructure/neis/NeisApiClient';
import { GoogleOAuthBrowserClient } from '@infrastructure/google/GoogleOAuthBrowserClient';
import { DriveSyncAdapter } from '@infrastructure/google/DriveSyncAdapter';

import { JsonScheduleRepository } from '@adapters/repositories/JsonScheduleRepository';
import { JsonSeatingRepository } from '@adapters/repositories/JsonSeatingRepository';
import { JsonEventsRepository } from '@adapters/repositories/JsonEventsRepository';
import { JsonMemoRepository } from '@adapters/repositories/JsonMemoRepository';
import { JsonTodoRepository } from '@adapters/repositories/JsonTodoRepository';
import { JsonSettingsRepository } from '@adapters/repositories/JsonSettingsRepository';
import { JsonStudentRecordsRepository } from '@adapters/repositories/JsonStudentRecordsRepository';
import { JsonMessageRepository } from '@adapters/repositories/JsonMessageRepository';
import { JsonStudentRepository } from '@adapters/repositories/JsonStudentRepository';
import { JsonSeatConstraintsRepository } from '@adapters/repositories/JsonSeatConstraintsRepository';
import { JsonTeachingClassRepository } from '@adapters/repositories/JsonTeachingClassRepository';
import { JsonBookmarkRepository } from '@adapters/repositories/JsonBookmarkRepository';
import { JsonDDayRepository } from '@adapters/repositories/JsonDDayRepository';
import { JsonDriveSyncRepository } from '@adapters/repositories/JsonDriveSyncRepository';

// === Storage ===
export const storage: IStoragePort = new IndexedDBStorageAdapter();

// === Repositories ===
export const scheduleRepository: IScheduleRepository = new JsonScheduleRepository(storage);
export const seatingRepository: ISeatingRepository = new JsonSeatingRepository(storage);
export const eventsRepository: IEventsRepository = new JsonEventsRepository(storage);
export const memoRepository: IMemoRepository = new JsonMemoRepository(storage);
export const todoRepository: ITodoRepository = new JsonTodoRepository(storage);
export const settingsRepository: ISettingsRepository = new JsonSettingsRepository(storage);
export const studentRecordsRepository: IStudentRecordsRepository = new JsonStudentRecordsRepository(storage);
export const messageRepository: IMessageRepository = new JsonMessageRepository(storage);
export const studentRepository: IStudentRepository = new JsonStudentRepository(storage);
export const seatConstraintsRepository: ISeatConstraintsRepository = new JsonSeatConstraintsRepository(storage);
export const teachingClassRepository: ITeachingClassRepository = new JsonTeachingClassRepository(storage);
export const bookmarkRepository: IBookmarkRepository = new JsonBookmarkRepository(storage);
export const ddayRepository: IDDayRepository = new JsonDDayRepository(storage);
export const driveSyncRepository: IDriveSyncRepository = new JsonDriveSyncRepository(storage);

// === NEIS ===
export const neisPort: INeisPort = new NeisApiClient();

// === Google OAuth (PKCE public client) ===
export const googleAuthPort: IGoogleAuthPort = new GoogleOAuthBrowserClient();

// === Google Drive Sync (lazy) ===
let _driveSyncAdapter: DriveSyncAdapter | null = null;
let _lastTokenGetter: (() => Promise<string>) | null = null;

export function getDriveSyncAdapter(
  getAccessToken: () => Promise<string>,
): IDriveSyncPort {
  if (!_driveSyncAdapter || _lastTokenGetter !== getAccessToken) {
    _driveSyncAdapter = new DriveSyncAdapter(getAccessToken);
    _lastTokenGetter = getAccessToken;
  }
  return _driveSyncAdapter;
}
