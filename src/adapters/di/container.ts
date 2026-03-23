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
import type { ISeatConstraintsRepository } from '@domain/repositories/ISeatConstraintsRepository';
import type { ITeachingClassRepository } from '@domain/repositories/ITeachingClassRepository';
import type { IBookmarkRepository } from '@domain/repositories/IBookmarkRepository';
import type { IDDayRepository } from '@domain/repositories/IDDayRepository';
import type { IAnalyticsPort } from '@domain/ports/IAnalyticsPort';
import type { IAssignmentRepository } from '@domain/repositories/IAssignmentRepository';
import type { IGoogleDrivePort } from '@domain/ports/IGoogleDrivePort';
import type { IAssignmentServicePort } from '@domain/ports/IAssignmentServicePort';
import type { IConsultationRepository } from '@domain/repositories/IConsultationRepository';
import type { ISurveyRepository } from '@domain/repositories/ISurveyRepository';
import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';
import type { IDriveSyncRepository } from '@domain/repositories/IDriveSyncRepository';
import type { IManualMealRepository } from '@domain/repositories/IManualMealRepository';

import { ElectronStorageAdapter } from '@infrastructure/storage/ElectronStorageAdapter';
import { LocalStorageAdapter } from '@infrastructure/storage/LocalStorageAdapter';
import { NeisApiClient } from '@infrastructure/neis/NeisApiClient';
import { GoogleOAuthClient } from '@infrastructure/google/GoogleOAuthClient';
import { GoogleCalendarApiClient } from '@infrastructure/google/GoogleCalendarApiClient';
import { SupabaseAnalyticsAdapter } from '@infrastructure/analytics/SupabaseAnalyticsAdapter';
import { GoogleDriveClient } from '@infrastructure/google/GoogleDriveClient';
import { AssignmentSupabaseClient } from '@infrastructure/supabase/AssignmentSupabaseClient';
import { ShortLinkClient } from '@infrastructure/supabase/ShortLinkClient';

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
import { JsonSeatConstraintsRepository } from '@adapters/repositories/JsonSeatConstraintsRepository';
import { JsonTeachingClassRepository } from '@adapters/repositories/JsonTeachingClassRepository';
import { JsonBookmarkRepository } from '@adapters/repositories/JsonBookmarkRepository';
import { JsonDDayRepository } from '@adapters/repositories/JsonDDayRepository';
import { JsonAssignmentRepository } from '@adapters/repositories/JsonAssignmentRepository';
import { JsonConsultationRepository } from '@adapters/repositories/JsonConsultationRepository';
import { JsonSurveyRepository } from '@adapters/repositories/JsonSurveyRepository';
import { JsonDriveSyncRepository } from '@adapters/repositories/JsonDriveSyncRepository';
import { JsonManualMealRepository } from '@adapters/repositories/JsonManualMealRepository';
import { DriveSyncAdapter } from '@infrastructure/google/DriveSyncAdapter';
import { ConsultationSupabaseClient } from '@infrastructure/supabase/ConsultationSupabaseClient';
import { SurveySupabaseClient } from '@infrastructure/supabase/SurveySupabaseClient';

import { AuthenticateGoogle } from '@usecases/calendar/AuthenticateGoogle';
import { SyncToGoogle } from '@usecases/calendar/SyncToGoogle';
import { SyncFromGoogle } from '@usecases/calendar/SyncFromGoogle';
import { ManageCalendarMapping } from '@usecases/calendar/ManageCalendarMapping';

import { CreateAssignment } from '@usecases/assignment/CreateAssignment';
import { GetAssignments } from '@usecases/assignment/GetAssignments';
import { GetSubmissions } from '@usecases/assignment/GetSubmissions';
import { DeleteAssignment } from '@usecases/assignment/DeleteAssignment';
import { CopyMissingList } from '@usecases/assignment/CopyMissingList';

const isElectron = typeof window !== 'undefined' && window.electronAPI != null;

export const storage: IStoragePort = isElectron
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

export const seatConstraintsRepository: ISeatConstraintsRepository =
  new JsonSeatConstraintsRepository(storage);

export const teachingClassRepository: ITeachingClassRepository =
  new JsonTeachingClassRepository(storage);

export const bookmarkRepository: IBookmarkRepository =
  new JsonBookmarkRepository(storage);

export const ddayRepository: IDDayRepository =
  new JsonDDayRepository(storage);

export const manualMealRepository: IManualMealRepository =
  new JsonManualMealRepository(storage);

export const neisPort: INeisPort = new NeisApiClient();

// === Google Calendar 관련 ===

export const googleAuthPort: IGoogleAuthPort = new GoogleOAuthClient();

const googleCalendarApiClient = new GoogleCalendarApiClient();
export const googleCalendarPort: IGoogleCalendarPort = googleCalendarApiClient;

export const calendarSyncRepo: ICalendarSyncRepository =
  new GoogleCalendarSyncRepository(storage);

export const authenticateGoogle = new AuthenticateGoogle(
  googleAuthPort,
  calendarSyncRepo,
);

// 401 재시도를 위한 토큰 갱신 콜백 등록
googleCalendarApiClient.setTokenRefreshCallback(
  () => authenticateGoogle.getValidAccessToken(),
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

// === Analytics ===

export const analyticsPort: IAnalyticsPort = new SupabaseAnalyticsAdapter();

// === 과제수합 관련 ===

export const assignmentRepository: IAssignmentRepository =
  new JsonAssignmentRepository(storage);

// 구체 클래스 참조 (startPolling 접근용)
export const assignmentSupabaseClient = new AssignmentSupabaseClient();

export const assignmentServicePort: IAssignmentServicePort =
  assignmentSupabaseClient;

// === 숏링크 ===

export const shortLinkClient = new ShortLinkClient();

// GoogleDriveClient는 토큰 getter가 필요 → 인증 후 lazy 초기화
let _driveClient: GoogleDriveClient | null = null;

export function getGoogleDriveClient(
  getAccessToken: () => Promise<string>,
): IGoogleDrivePort {
  if (!_driveClient) {
    _driveClient = new GoogleDriveClient(getAccessToken);
  }
  return _driveClient;
}

// === 상담 예약 ===

export const consultationRepository: IConsultationRepository =
  new JsonConsultationRepository(storage);

export const consultationSupabaseClient = new ConsultationSupabaseClient();

// === 설문/체크리스트 ===

export const surveyRepository: ISurveyRepository =
  new JsonSurveyRepository(storage);

export const surveySupabaseClient = new SurveySupabaseClient();

export function resetGoogleDriveClient(): void {
  _driveClient = null;
}

// === Google Drive 동기화 ===

export const driveSyncRepository: IDriveSyncRepository =
  new JsonDriveSyncRepository(storage);

// DriveSyncAdapter는 토큰 getter가 필요 → lazy 초기화
let _driveSyncAdapter: DriveSyncAdapter | null = null;

export function getDriveSyncAdapter(
  getAccessToken: () => Promise<string>,
): IDriveSyncPort {
  if (!_driveSyncAdapter) {
    _driveSyncAdapter = new DriveSyncAdapter(getAccessToken);
  }
  return _driveSyncAdapter;
}

export function resetDriveSyncAdapter(): void {
  _driveSyncAdapter = null;
}

// UseCase 팩토리 (Drive 클라이언트가 lazy이므로 팩토리 패턴)
export function createAssignmentUseCases(getAccessToken: () => Promise<string>) {
  const drivePort = getGoogleDriveClient(getAccessToken);

  return {
    createAssignment: new CreateAssignment(
      assignmentRepository,
      drivePort,
      assignmentServicePort,
      getAccessToken,
    ),
    getAssignments: new GetAssignments(
      assignmentRepository,
      assignmentServicePort,
    ),
    getSubmissions: new GetSubmissions(
      assignmentRepository,
      assignmentServicePort,
    ),
    deleteAssignment: new DeleteAssignment(
      assignmentRepository,
      assignmentServicePort,
    ),
    copyMissingList: new CopyMissingList(
      assignmentRepository,
      assignmentServicePort,
    ),
  };
}
