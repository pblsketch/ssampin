/**
 * DI Container
 * 유일하게 infrastructure 레이어를 import할 수 있는 곳
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
import type { IExternalCalendarRepository } from '@domain/repositories/IExternalCalendarRepository';
import type { IGoogleAuthPort } from '@domain/ports/IGoogleAuthPort';
import type { IGoogleCalendarPort } from '@domain/ports/IGoogleCalendarPort';
import type { ICalendarSyncRepository } from '@domain/repositories/ICalendarSyncRepository';

import { ElectronStorageAdapter } from '@infrastructure/storage/ElectronStorageAdapter';
import { LocalStorageAdapter } from '@infrastructure/storage/LocalStorageAdapter';
import { NeisApiClient } from '@infrastructure/neis/NeisApiClient';
import { GoogleOAuthClient } from '@infrastructure/google/GoogleOAuthClient';
import { GoogleCalendarApiClient } from '@infrastructure/google/GoogleCalendarApiClient';

import { JsonScheduleRepository } from '@adapters/repositories/JsonScheduleRepository';
import { JsonSeatingRepository } from '@adapters/repositories/JsonSeatingRepository';
import { JsonEventsRepository } from '@adapters/repositories/JsonEventsRepository';
import { JsonMemoRepository } from '@adapters/repositories/JsonMemoRepository';
import { JsonTodoRepository } from '@adapters/repositories/JsonTodoRepository';
import { JsonSettingsRepository } from '@adapters/repositories/JsonSettingsRepository';
import { JsonStudentRecordsRepository } from '@adapters/repositories/JsonStudentRecordsRepository';
import { JsonMessageRepository } from '@adapters/repositories/JsonMessageRepository';
import { JsonStudentRepository } from '@adapters/repositories/JsonStudentRepository';
import { JsonExternalCalendarRepository } from '@adapters/repositories/JsonExternalCalendarRepository';
import { GoogleCalendarSyncRepository } from '@adapters/repositories/GoogleCalendarSyncRepository';

import { AuthenticateGoogle } from '@usecases/calendar/AuthenticateGoogle';
import { SyncToGoogle } from '@usecases/calendar/SyncToGoogle';
import { SyncFromGoogle } from '@usecases/calendar/SyncFromGoogle';
import { ManageCalendarMapping } from '@usecases/calendar/ManageCalendarMapping';

const isElectron = typeof window !== 'undefined' && window.electronAPI != null;

const storage: IStoragePort = isElectron
  ? new ElectronStorageAdapter()
  : new LocalStorageAdapter();

export const scheduleRepository: IScheduleRepository =
  new JsonScheduleRepository(storage);

export const seatingRepository: ISeatingRepository =
  new JsonSeatingRepository(storage);

export const eventsRepository: IEventsRepository =
  new JsonEventsRepository(storage);

export const memoRepository: IMemoRepository =
  new JsonMemoRepository(storage);

export const todoRepository: ITodoRepository =
  new JsonTodoRepository(storage);

export const settingsRepository: ISettingsRepository =
  new JsonSettingsRepository(storage);

export const studentRecordsRepository: IStudentRecordsRepository =
  new JsonStudentRecordsRepository(storage);

export const messageRepository: IMessageRepository =
  new JsonMessageRepository(storage);

export const studentRepository: IStudentRepository =
  new JsonStudentRepository(storage);

export const externalCalendarRepository: IExternalCalendarRepository =
  new JsonExternalCalendarRepository(storage);

export const neisPort: INeisPort = new NeisApiClient();

// === Google Calendar 관련 ===

export const googleAuthPort: IGoogleAuthPort = new GoogleOAuthClient();

export const googleCalendarPort: IGoogleCalendarPort = new GoogleCalendarApiClient();

export const calendarSyncRepo: ICalendarSyncRepository =
  new GoogleCalendarSyncRepository(storage);

export const authenticateGoogle = new AuthenticateGoogle(
  googleAuthPort,
  calendarSyncRepo,
);

export const syncToGoogle = new SyncToGoogle(
  googleCalendarPort,
  calendarSyncRepo,
  () => authenticateGoogle.getValidAccessToken(),
);

export const manageCalendarMapping = new ManageCalendarMapping(
  googleCalendarPort,
  calendarSyncRepo,
  () => authenticateGoogle.getValidAccessToken(),
);

export const syncFromGoogle = new SyncFromGoogle(
  googleCalendarPort,
  calendarSyncRepo,
  eventsRepository,
  () => authenticateGoogle.getValidAccessToken(),
);
