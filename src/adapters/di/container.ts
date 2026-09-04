/**
 * DI Container
 * 유일하게 infrastructure 레이어를 import할 수 있는 곳
 */
import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { INeisPort } from '@domain/ports/INeisPort';
import type { IComciganPort } from '@domain/ports/IComciganPort';
import type { IAppinPort } from '@domain/ports/IAppinPort';
import type { AssistPort } from '@domain/ports/AssistPort';
import type { IScheduleRepository } from '@domain/repositories/IScheduleRepository';
import type { ISeatingRepository } from '@domain/repositories/ISeatingRepository';
import type { ISeatingSnapshotRepository } from '@domain/repositories/ISeatingSnapshotRepository';
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
import type { ISeatPickerConfigRepository } from '@domain/repositories/ISeatPickerConfigRepository';
import type { ITeachingClassRepository } from '@domain/repositories/ITeachingClassRepository';
import type { IBookmarkRepository } from '@domain/repositories/IBookmarkRepository';
import type { IDesktopOrganizeRepository } from '@domain/repositories/IDesktopOrganizeRepository';
import type { IDDayRepository } from '@domain/repositories/IDDayRepository';
import type { ICoolImportHistoryRepository } from '@domain/repositories/ICoolImportHistoryRepository';
import type { IStaffContactRepository } from '@domain/repositories/IStaffContactRepository';
import type { IAnalyticsPort } from '@domain/ports/IAnalyticsPort';
import type { IAssignmentRepository } from '@domain/repositories/IAssignmentRepository';
import type { IGoogleDrivePort } from '@domain/ports/IGoogleDrivePort';
import type { IGoogleTasksPort } from '@domain/ports/IGoogleTasksPort';
import type { IAssignmentServicePort } from '@domain/ports/IAssignmentServicePort';
import type { ISignaturePort } from '@domain/ports/ISignaturePort';
import type { IStaffRoomPort } from '@domain/ports/IStaffRoomPort';
import type { IGoogleSheetPort } from '@domain/ports/IGoogleSheetPort';
import type { IConsultationRepository } from '@domain/repositories/IConsultationRepository';
import type { ISurveyRepository } from '@domain/repositories/ISurveyRepository';
import type { IRubricRepository } from '@domain/repositories/IRubricRepository';
import type { IGradeAnalysisRepository } from '@domain/repositories/IGradeAnalysisRepository';
import type { IImportedTranscriptRepository } from '@domain/repositories/IImportedTranscriptRepository';
import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';
import type { IDriveSyncRepository } from '@domain/repositories/IDriveSyncRepository';
import type { IManualMealRepository } from '@domain/repositories/IManualMealRepository';
import type { IImageWidgetRepository } from '@domain/repositories/IImageWidgetRepository';
import type { IWordCloudRepository } from '@domain/repositories/IWordCloudRepository';
import type { IToolTemplateRepository } from '@domain/repositories/IToolTemplateRepository';
import type { IToolResultRepository } from '@domain/repositories/IToolResultRepository';
import type { IObservationRepository } from '@domain/repositories/IObservationRepository';
import type { IObservationAttachmentRepository } from '@domain/repositories/IObservationAttachmentRepository';
import type { IStudentPhotoRepository } from '@domain/repositories/IStudentPhotoRepository';
import type { IImageResizerPort } from '@domain/ports/IImageResizerPort';
import type { IPhotoRosterParserPort } from '@domain/ports/IPhotoRosterParserPort';
import type { IRecordDraftsRepository } from '@domain/repositories/IRecordDraftsRepository';
import type { IRecordEvidenceRepository } from '@domain/repositories/IRecordEvidenceRepository';
import type { IInquiryThreadRepository } from '@domain/repositories/IInquiryThreadRepository';
import type { IReminderFireRepository } from '@domain/repositories/IReminderFireRepository';
import type { IFormTemplateRepository } from '@domain/repositories/IFormTemplateRepository';
import type { INotebookRepository } from '@domain/repositories/INotebookRepository';
import type { IWallBoardRepository } from '@domain/repositories/IWallBoardRepository';
import type { IStickerRepository } from '@domain/repositories/IStickerRepository';
import type { IClassroomAgreementRepository } from '@domain/repositories/IClassroomAgreementRepository';
import type { IMemoShareClient } from '@domain/ports/IMemoShareClient';
import type { IMemoSharePresencePort } from '@domain/ports/IMemoSharePresencePort';
import type { IThumbnailer, IPreviewExtractor, IPrinterAdapter } from '@domain/ports/IFormPorts';

import { ElectronStorageAdapter } from '@infrastructure/storage/ElectronStorageAdapter';
import { LocalStorageAdapter } from '@infrastructure/storage/LocalStorageAdapter';
import { NeisApiClient } from '@infrastructure/neis/NeisApiClient';
import { ComciganApiClient } from '@infrastructure/comcigan/ComciganApiClient';
import { AppinApiClient } from '@infrastructure/appin/AppinApiClient';
import { AssistClient } from '@infrastructure/ai/AssistClient';
import { OwnAiAssistPort } from '@infrastructure/ownAi/OwnAiAssistPort';
import { withSolarFallback } from '@usecases/assist/withSolarFallback';
import type { OwnAiProviderId } from '@domain/entities/OwnAiProvider';
import { GoogleOAuthClient } from '@infrastructure/google/GoogleOAuthClient';
import { GoogleCalendarApiClient } from '@infrastructure/google/GoogleCalendarApiClient';
import { SupabaseAnalyticsAdapter } from '@infrastructure/analytics/SupabaseAnalyticsAdapter';
import { GoogleDriveClient } from '@infrastructure/google/GoogleDriveClient';
import { GoogleTasksApiClient } from '@infrastructure/google/GoogleTasksApiClient';
import { AssignmentSupabaseClient } from '@infrastructure/supabase/AssignmentSupabaseClient';
import { SignatureSupabaseClient } from '@infrastructure/supabase/SignatureSupabaseClient';
import { StaffRoomSupabaseClient } from '@infrastructure/supabase/StaffRoomSupabaseClient';
import { GoogleSheetClient } from '@infrastructure/google/GoogleSheetClient';
import { ShortLinkClient } from '@infrastructure/supabase/ShortLinkClient';
import { MemoSharePresenceClient } from '@infrastructure/supabase/MemoSharePresenceClient';
// 협업 보드 infrastructure는 Node-only(yjs/ws/y-websocket/fs) 의존성을 가지므로
// renderer 번들에 포함되면 Vite 빌드 실패. 따라서 container.ts에서 import하지 않고
// electron/ipc/board.ts가 직접 조립한다 (기존 5개 라이브 도구와 동일 패턴).

import { JsonScheduleRepository } from '@adapters/repositories/JsonScheduleRepository';
import { JsonSeatingRepository } from '@adapters/repositories/JsonSeatingRepository';
import { JsonSeatingSnapshotRepository } from '@adapters/repositories/JsonSeatingSnapshotRepository';
import { JsonEventsRepository } from '@adapters/repositories/JsonEventsRepository';
import { JsonMemoRepository } from '@adapters/repositories/JsonMemoRepository';
import { JsonTodoRepository } from '@adapters/repositories/JsonTodoRepository';
import { JsonSettingsRepository } from '@adapters/repositories/JsonSettingsRepository';
import type { IMiniAppRepository } from '@domain/repositories/IMiniAppRepository';
import { MiniAppFileRepository } from '@infrastructure/storage/MiniAppFileRepository';
import { JsonStudentRecordsRepository } from '@adapters/repositories/JsonStudentRecordsRepository';
import { JsonMessageRepository } from '@adapters/repositories/JsonMessageRepository';
import { JsonStudentRepository } from '@adapters/repositories/JsonStudentRepository';
import { JsonExternalCalendarRepository } from '@adapters/repositories/JsonExternalCalendarRepository';
import { GoogleCalendarSyncRepository } from '@adapters/repositories/GoogleCalendarSyncRepository';
import { JsonSeatConstraintsRepository } from '@adapters/repositories/JsonSeatConstraintsRepository';
import { JsonSeatPickerConfigRepository } from '@adapters/repositories/JsonSeatPickerConfigRepository';
import { JsonTeachingClassRepository } from '@adapters/repositories/JsonTeachingClassRepository';
import { JsonBookmarkRepository } from '@adapters/repositories/JsonBookmarkRepository';
import { JsonDesktopOrganizeRepository } from '@adapters/repositories/JsonDesktopOrganizeRepository';
import { JsonDDayRepository } from '@adapters/repositories/JsonDDayRepository';
import { JsonCoolImportHistoryRepository } from '@adapters/repositories/JsonCoolImportHistoryRepository';
import { JsonStaffContactRepository } from '@adapters/repositories/JsonStaffContactRepository';
import { JsonAssignmentRepository } from '@adapters/repositories/JsonAssignmentRepository';
import { JsonConsultationRepository } from '@adapters/repositories/JsonConsultationRepository';
import { JsonSurveyRepository } from '@adapters/repositories/JsonSurveyRepository';
import { JsonRubricRepository } from '@adapters/repositories/JsonRubricRepository';
import { JsonGradeAnalysisRepository } from '@adapters/repositories/JsonGradeAnalysisRepository';
import { JsonImportedTranscriptRepository } from '@adapters/repositories/JsonImportedTranscriptRepository';
import { JsonDriveSyncRepository } from '@adapters/repositories/JsonDriveSyncRepository';
import { JsonManualMealRepository } from '@adapters/repositories/JsonManualMealRepository';
import { JsonImageWidgetRepository } from '@adapters/repositories/JsonImageWidgetRepository';
import { JsonWordCloudRepository } from '@adapters/repositories/JsonWordCloudRepository';
import { JsonToolTemplateRepository } from '@adapters/repositories/JsonToolTemplateRepository';
import { JsonToolResultRepository } from '@adapters/repositories/JsonToolResultRepository';
import { JsonObservationRepository } from '@adapters/repositories/JsonObservationRepository';
import { JsonObservationAttachmentRepository } from '@adapters/repositories/JsonObservationAttachmentRepository';
import { JsonStudentPhotoRepository } from '@adapters/repositories/JsonStudentPhotoRepository';
import { CanvasImageResizer } from '@infrastructure/image/CanvasImageResizer';
import { PhotoRosterParserAdapter } from '@infrastructure/parse/PhotoRosterParserAdapter';
import { JsonRecordDraftsRepository } from '@adapters/repositories/JsonRecordDraftsRepository';
import { JsonRecordEvidenceRepository } from '@adapters/repositories/JsonRecordEvidenceRepository';
import { JsonInquiryThreadRepository } from '@adapters/repositories/JsonInquiryThreadRepository';
import { JsonReminderFireRepository } from '@adapters/repositories/JsonReminderFireRepository';
import { JsonFormTemplateRepository } from '@adapters/repositories/JsonFormTemplateRepository';
import { JsonNotebookRepository } from '@adapters/repositories/JsonNotebookRepository';
import { JsonWallBoardRepository } from '@adapters/repositories/JsonWallBoardRepository';
import { JsonStickerRepository } from '@adapters/repositories/JsonStickerRepository';
import { JsonInteractiveLessonsRepository } from '@adapters/repositories/JsonInteractiveLessonsRepository';
import { JsonClassroomAgreementRepository } from '@adapters/repositories/JsonClassroomAgreementRepository';
import type { IInteractiveLessonRepository } from '@domain/repositories/IInteractiveLessonRepository';
import { PdfJsThumbnailer } from '@infrastructure/forms/PdfJsThumbnailer';
import { HwpxExcelPreviewExtractor } from '@infrastructure/forms/HwpxExcelPreviewExtractor';
import { ElectronPrinterAdapter } from '@infrastructure/print/ElectronPrinterAdapter';
import { DriveSyncAdapter } from '@infrastructure/google/DriveSyncAdapter';
import { ConsultationSupabaseClient } from '@infrastructure/supabase/ConsultationSupabaseClient';
import { SurveySupabaseClient } from '@infrastructure/supabase/SurveySupabaseClient';

import { AuthenticateGoogle } from '@usecases/calendar/AuthenticateGoogle';
import { SyncToGoogle } from '@usecases/calendar/SyncToGoogle';
import { SyncFromGoogle } from '@usecases/calendar/SyncFromGoogle';
import { ManageCalendarMapping } from '@usecases/calendar/ManageCalendarMapping';

import { ImportSettingsFromCloud } from '@usecases/sync/ImportSettingsFromCloud';

import { CreateAssignment } from '@usecases/assignment/CreateAssignment';
import { GetAssignments } from '@usecases/assignment/GetAssignments';
import { GetSubmissions } from '@usecases/assignment/GetSubmissions';
import { DeleteAssignment } from '@usecases/assignment/DeleteAssignment';
import { CopyMissingList } from '@usecases/assignment/CopyMissingList';
import { ExtractSubmissionTexts } from '@usecases/assignment/ExtractSubmissionTexts';
import { JsonSubmissionTextRepository } from '@adapters/repositories/JsonSubmissionTextRepository';
import { SubmissionFileClient } from '@infrastructure/google/SubmissionFileClient';

import { ManageRubrics } from '@usecases/rubric/ManageRubrics';
import { ManageGradeAnalysis } from '@usecases/gradeAnalysis/ManageGradeAnalysis';
import { ManageImportedTranscript } from '@usecases/transcript/ManageImportedTranscript';

import type { IEvaluationPlanPort } from '@domain/ports/IEvaluationPlanPort';
import { SchoolInfoEvaluationAdapter } from '@infrastructure/schoolinfo/SchoolInfoEvaluationAdapter';
import type { ISchoolDisclosurePort } from '@domain/ports/ISchoolDisclosurePort';
import { SchoolDisclosureAdapter } from '@infrastructure/schoolinfo/SchoolDisclosureAdapter';
import { ImportEvaluationPlan } from '@usecases/evaluation/ImportEvaluationPlan';
import { EnrichSchoolOnSelect } from '@usecases/school/EnrichSchoolOnSelect';

import type { IDocumentParserPort } from '@domain/ports/IDocumentParserPort';
import type { IMaskMappingRepository } from '@domain/ports/IMaskMappingRepository';
import { KordocParserAdapter } from '@infrastructure/parse/KordocParserAdapter';
import { SecureMaskMappingRepository } from '@infrastructure/privacy/SecureMaskMappingRepository';
import { ConvertDocument } from '@usecases/markdownConvert/ConvertDocument';
import { MaskMarkdown } from '@usecases/markdownConvert/MaskMarkdown';
import { ManageMaskSessions } from '@usecases/markdownConvert/ManageMaskSessions';

import { PublishSignatureSession } from '@usecases/signature/PublishSignatureSession';
import { SubmitMonitorSignature } from '@usecases/signature/SubmitMonitorSignature';
import { ExportRegisterToSheet } from '@usecases/signature/ExportRegisterToSheet';

const isElectron = typeof window !== 'undefined' && window.electronAPI != null;

export const storage: IStoragePort = isElectron
  ? new ElectronStorageAdapter()
  : new LocalStorageAdapter();

export const scheduleRepository: IScheduleRepository = new JsonScheduleRepository(storage);

export const seatingRepository: ISeatingRepository = new JsonSeatingRepository(storage);

export const seatingSnapshotRepository: ISeatingSnapshotRepository =
  new JsonSeatingSnapshotRepository(storage);

export const eventsRepository: IEventsRepository = new JsonEventsRepository(storage);

export const memoRepository: IMemoRepository = new JsonMemoRepository(storage);

export const todoRepository: ITodoRepository = new JsonTodoRepository(storage);

export const settingsRepository: ISettingsRepository = new JsonSettingsRepository(storage);

/** 미니앱("내가 만든 앱") HTML·아이콘 파일 영속 (Electron IPC 위임). 메타는 settings에 저장. */
export const miniAppRepository: IMiniAppRepository = new MiniAppFileRepository();

export const studentRecordsRepository: IStudentRecordsRepository = new JsonStudentRecordsRepository(
  storage,
);

export const messageRepository: IMessageRepository = new JsonMessageRepository(storage);

export const studentRepository: IStudentRepository = new JsonStudentRepository(storage);

export const externalCalendarRepository: IExternalCalendarRepository =
  new JsonExternalCalendarRepository(storage);

export const seatConstraintsRepository: ISeatConstraintsRepository =
  new JsonSeatConstraintsRepository(storage);

export const seatPickerConfigRepository: ISeatPickerConfigRepository =
  new JsonSeatPickerConfigRepository(storage);

export const teachingClassRepository: ITeachingClassRepository = new JsonTeachingClassRepository(
  storage,
);

export const bookmarkRepository: IBookmarkRepository = new JsonBookmarkRepository(storage);

export const desktopOrganizeRepository: IDesktopOrganizeRepository =
  new JsonDesktopOrganizeRepository(storage);

export const ddayRepository: IDDayRepository = new JsonDDayRepository(storage);

/** 쿨메신저에서 이미 가져온 항목 기록 — 같은 쪽지를 두 번 등록하는 걸 막는다 */
export const coolImportHistoryRepository: ICoolImportHistoryRepository =
  new JsonCoolImportHistoryRepository(storage);

export const staffContactRepository: IStaffContactRepository = new JsonStaffContactRepository(
  storage,
);

export const interactiveLessonRepository: IInteractiveLessonRepository =
  new JsonInteractiveLessonsRepository(storage);

export const manualMealRepository: IManualMealRepository = new JsonManualMealRepository(storage);

export const imageWidgetRepository: IImageWidgetRepository = new JsonImageWidgetRepository(storage);

export const wordCloudRepository: IWordCloudRepository = new JsonWordCloudRepository(storage);

export const toolTemplateRepository: IToolTemplateRepository = new JsonToolTemplateRepository(
  storage,
);

export const toolResultRepository: IToolResultRepository = new JsonToolResultRepository(storage);

export const observationRepository: IObservationRepository = new JsonObservationRepository(storage);

export const observationAttachmentRepository: IObservationAttachmentRepository =
  new JsonObservationAttachmentRepository(storage);

/**
 * 학생 사진 (얼굴-이름 학습).
 *
 * 관찰 첨부와 같은 구조 — 메타는 JSON, 사진 본체는 별도 바이너리 파일.
 * ⚠️ 학생 화면(`dist-student`)·위젯·옆핀에서는 이 저장소에 닿으면 안 된다.
 *    사진 바이트가 화면으로 들어오는 유일한 관문이 여기이므로, 여기만 막으면 노출이 원천 차단된다.
 */
export const studentPhotoRepository: IStudentPhotoRepository = new JsonStudentPhotoRepository(
  storage,
);

export const imageResizer: IImageResizerPort = new CanvasImageResizer();

export const photoRosterParser: IPhotoRosterParserPort = new PhotoRosterParserAdapter();

export const recordDraftsRepository: IRecordDraftsRepository = new JsonRecordDraftsRepository(
  storage,
);

export const recordEvidenceRepository: IRecordEvidenceRepository = new JsonRecordEvidenceRepository(
  storage,
);

// === 탐구 흐름(InquiryThread) — 근거·관찰 낱장을 주제로 묶는 단위. inquiry-threads.json ===
export const inquiryThreadRepository: IInquiryThreadRepository = new JsonInquiryThreadRepository(
  storage,
);

// === 학생 관찰 기록 알림 발화 장부 (로컬 전용, syncRegistry 제외 — 크로스기기 중복은 유계 허용) ===
export const reminderFireRepository: IReminderFireRepository = new JsonReminderFireRepository(
  storage,
);

export const noteRepository: INotebookRepository = new JsonNotebookRepository(storage);

// === 실시간 담벼락 영속 보드 (v1.13 Stage A) ===
export const wallBoardRepository: IWallBoardRepository = new JsonWallBoardRepository(storage);

// === 내 이모티콘 (Sticker Picker) ===
export const stickerRepository: IStickerRepository = new JsonStickerRepository(storage);

// === 교실 약속 정하기 ===
export const classroomAgreementRepository: IClassroomAgreementRepository =
  new JsonClassroomAgreementRepository(storage);

// === 서식 관리 ===
export const formRepository: IFormTemplateRepository = new JsonFormTemplateRepository(storage);

export const formThumbnailer: IThumbnailer = new PdfJsThumbnailer();
export const formPreviewExtractor: IPreviewExtractor = new HwpxExcelPreviewExtractor();
export const formPrinter: IPrinterAdapter = new ElectronPrinterAdapter();

export const neisPort: INeisPort = new NeisApiClient();

// === 컴시간알리미 (comcigan) — 교사 시간표 불러오기 ===
// 통신은 electron main('comcigan:fetch' IPC, safeFetch 경유)에 위임, 브라우저 dev 는 vite 프록시.
export const comciganPort: IComciganPort = new ComciganApiClient();

// === 압핀 (appin, sgpap.com) — 학급/교사 시간표 불러오기 ===
// 통신은 electron main('appin:fetch' IPC, safeFetch 경유)에 위임, 브라우저 dev 는 vite 프록시.
export const appinPort: IAppinPort = new AppinApiClient();

/**
 * 쌤핀 AI 중계 창구.
 *
 * ★adapters 는 infrastructure 를 직접 import 할 수 없다(아키텍처 규칙).
 * 화면은 이 컨테이너에서 받아 쓴다 - lint 규칙이 그걸 강제한다.
 */
export const assistPort: AssistPort = new AssistClient();

/**
 * 어느 AI 로 물어볼지 고른다 — "내 AI로 실행"(선생님 본인 구독 CLI) 또는 쌤핀 AI.
 *
 * ★여기가 유일하게 infrastructure 를 아는 자리다. 스토어도 화면도
 * `OwnAiAssistPort` 를 직접 import 하지 않는다(아키텍처 규칙).
 *
 * ★폴백은 **쌤핀 AI 에 동의한 경우에만** 일어난다. 동의 없이 서버로 질문이 나가면
 * 그건 동의 없는 전송이다.
 */
export function assistPortFor(options: {
  readonly provider: OwnAiProviderId | 'ssampin';
  readonly solarEnabled: () => boolean;
  readonly appendSystemPrompt?: string;
  readonly onUsage?: (fiveHourUtilization: number | null, resetsAt: number | null) => void;
  readonly onFallback?: (reason: unknown) => void;
}): AssistPort {
  if (options.provider === 'ssampin') return assistPort;

  const own = new OwnAiAssistPort({
    provider: options.provider,
    ...(options.appendSystemPrompt === undefined
      ? {}
      : { appendSystemPrompt: options.appendSystemPrompt }),
    ...(options.onUsage === undefined ? {} : { onUsage: options.onUsage }),
  });
  return withSolarFallback(own, assistPort, {
    solarEnabled: options.solarEnabled,
    ...(options.onFallback === undefined ? {} : { onFallback: options.onFallback }),
  });
}

// === Google Calendar 관련 ===

export const googleAuthPort: IGoogleAuthPort = new GoogleOAuthClient();

const googleCalendarApiClient = new GoogleCalendarApiClient();
export const googleCalendarPort: IGoogleCalendarPort = googleCalendarApiClient;

export const calendarSyncRepo: ICalendarSyncRepository = new GoogleCalendarSyncRepository(storage);

export const authenticateGoogle = new AuthenticateGoogle(googleAuthPort, calendarSyncRepo);

// 401 재시도를 위한 토큰 갱신 콜백 등록
googleCalendarApiClient.setTokenRefreshCallback(() => authenticateGoogle.getValidAccessToken());

export const syncToGoogle = new SyncToGoogle(googleCalendarPort, calendarSyncRepo, () =>
  authenticateGoogle.getValidAccessToken(),
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

// === Google Tasks 관련 ===

const googleTasksApiClient = new GoogleTasksApiClient();
export const googleTasksPort: IGoogleTasksPort = googleTasksApiClient;

// 401 재시도를 위한 토큰 갱신 콜백 등록
googleTasksApiClient.setTokenRefreshCallback(() => authenticateGoogle.getValidAccessToken());

// === Analytics ===

export const analyticsPort: IAnalyticsPort = new SupabaseAnalyticsAdapter();

// === 과제수합 관련 ===

export const assignmentRepository: IAssignmentRepository = new JsonAssignmentRepository(storage);

// 구체 클래스 참조 (startPolling 접근용)
export const assignmentSupabaseClient = new AssignmentSupabaseClient();

export const assignmentServicePort: IAssignmentServicePort = assignmentSupabaseClient;

/**
 * 제출 파일 본문 추출기 — 뽑아 둔 본문을 **메모리에 들고 있으므로 하나만** 만든다
 * (매번 새로 만들면 캐시가 매번 비어 같은 파일을 다시 내려받는다).
 */
let _extractSubmissionTexts: ExtractSubmissionTexts | null = null;

export function getExtractSubmissionTexts(
  getAccessToken: () => Promise<string>,
): ExtractSubmissionTexts {
  if (!_extractSubmissionTexts) {
    _extractSubmissionTexts = new ExtractSubmissionTexts(
      new JsonSubmissionTextRepository(storage),
      new SubmissionFileClient(getAccessToken),
      documentParserPort,
    );
  }
  return _extractSubmissionTexts;
}

// === 서명받기 관련 ===

// 구체 클래스 참조 (startStatusPolling 접근용 + ISignaturePort 구현)
export const signatureSupabaseClient = new SignatureSupabaseClient();

export const signaturePort: ISignaturePort = signatureSupabaseClient;

// === 온라인 교무실 (M1) ===

export const staffRoomPort: IStaffRoomPort = new StaffRoomSupabaseClient();

// GoogleSheetClient는 토큰 getter가 필요 → lazy 초기화
let _sheetClient: GoogleSheetClient | null = null;

export function getGoogleSheetClient(getAccessToken: () => Promise<string>): IGoogleSheetPort {
  if (!_sheetClient) {
    _sheetClient = new GoogleSheetClient(getAccessToken, getGoogleDriveClient(getAccessToken));
  }
  return _sheetClient;
}

export function resetGoogleSheetClient(): void {
  _sheetClient = null;
}

// 현황 폴링은 토큰 불필요(anon key) → 즉시 생성 가능
export const submitMonitorSignature = new SubmitMonitorSignature(signatureSupabaseClient);

export const publishSignatureSession = new PublishSignatureSession(signaturePort);

// 시트 내보내기는 Sheet 클라이언트가 lazy이므로 팩토리 패턴
export function createExportRegisterToSheet(
  getAccessToken: () => Promise<string>,
): ExportRegisterToSheet {
  const sheetPort = getGoogleSheetClient(getAccessToken);
  return new ExportRegisterToSheet(signaturePort, sheetPort);
}

// === 숏링크 ===

export const shortLinkClient = new ShortLinkClient();

// GoogleDriveClient는 토큰 getter가 필요 → 인증 후 lazy 초기화
let _driveClient: GoogleDriveClient | null = null;

export function getGoogleDriveClient(getAccessToken: () => Promise<string>): IGoogleDrivePort {
  if (!_driveClient) {
    _driveClient = new GoogleDriveClient(getAccessToken);
  }
  return _driveClient;
}

// === 상담 예약 ===

export const consultationRepository: IConsultationRepository = new JsonConsultationRepository(
  storage,
);

export const consultationSupabaseClient = new ConsultationSupabaseClient();

// === 설문/체크리스트 ===

export const surveyRepository: ISurveyRepository = new JsonSurveyRepository(storage);

// === 수행평가 채점 (rubric-grading) ===

export const rubricRepository: IRubricRepository = new JsonRubricRepository(storage);

export const manageRubrics = new ManageRubrics(rubricRepository);

// === 성적 분석 (grade-analysis) — 로컬 전용, syncRegistry 제외 ===
export const gradeAnalysisRepository: IGradeAnalysisRepository = new JsonGradeAnalysisRepository(
  storage,
);
export const manageGradeAnalysis = new ManageGradeAnalysis(gradeAnalysisRepository);
export { parseGradeExcel } from '@infrastructure/parse/NeisGradeExcelParser';

// === 담임 학급 전과목 성적 (transcripts) — 로컬 전용, syncRegistry 제외 ===
export const transcriptRepository: IImportedTranscriptRepository =
  new JsonImportedTranscriptRepository(storage);
export const manageImportedTranscript = new ManageImportedTranscript(transcriptRepository);
export { parseTranscriptExcel } from '@infrastructure/parse/NeisTranscriptExcelParser';

// === 학교 평가 운영계획 불러오기 (evaluation-rubric-import) ===
// 통신/파싱은 electron main(safeFetch + kordoc)에 IPC 위임 → markdown 구조화는 순수 도메인 파서.
export const evaluationPlanPort: IEvaluationPlanPort = new SchoolInfoEvaluationAdapter();
export const importEvaluationPlan = new ImportEvaluationPlan(evaluationPlanPort);

// === 학교알리미 공시 조회 (school-announcements) ===
// 통신은 electron main(safeFetch + openApi.do)에 IPC 위임. 인증키는 어댑터가 빌드 env로 주입.
export const schoolDisclosurePort: ISchoolDisclosurePort = new SchoolDisclosureAdapter();

// === 온보딩 학교 보강 (school-enrich ②) ===
// ②-A 날씨 좌표(순수·오프라인) + ②-B 학교알리미 식별자(① 검색 인프라 재사용, best-effort).
export const enrichSchoolOnSelect = new EnrichSchoolOnSelect(evaluationPlanPort);

// === 마크다운 변환기 (markdown-convert) ===
// 파싱은 KordocParserAdapter → IPC → kordoc(메인, 로컬). 복원표는 secureStorage 암호화 저장.
// 주의: maskMappingRepository는 개인정보(실명↔별칭)이므로 syncRegistry에 등록하지 않는다(GDrive 제외).
export const documentParserPort: IDocumentParserPort = new KordocParserAdapter();
export const maskMappingRepository: IMaskMappingRepository = new SecureMaskMappingRepository();
export const convertDocument = new ConvertDocument(documentParserPort);
export const maskMarkdown = new MaskMarkdown();
export const manageMaskSessions = new ManageMaskSessions(maskMappingRepository);

export const surveySupabaseClient = new SurveySupabaseClient();

export function resetGoogleDriveClient(): void {
  _driveClient = null;
}

// === 메모 교실 공유 (Google Drive) ===

// MemoShareDriveClient는 토큰 getter가 필요 → 인증 후 lazy 초기화.
// 구현 파일(src/infrastructure/google/MemoShareDriveClient.ts)은 다른 세션이 병렬 작성 중이므로
// 정적 import 대신 호출 시점 dynamic import를 사용한다 — 파일이 아직 없어도
// container를 import하는 기존 테스트/번들이 깨지지 않는다.
let _memoShareClient: IMemoShareClient | null = null;

export async function getMemoShareClient(
  getAccessToken: () => Promise<string>,
): Promise<IMemoShareClient> {
  if (!_memoShareClient) {
    const { MemoShareDriveClient } = await import('@infrastructure/google/MemoShareDriveClient');
    _memoShareClient = new MemoShareDriveClient(getAccessToken);
  }
  return _memoShareClient;
}

export function resetMemoShareClient(): void {
  _memoShareClient = null;
}

/**
 * 교실 화면 수신 확인증 읽기 클라이언트 — 토큰 불필요(anon key) → 즉시 생성.
 * 메타데이터만 조회(ADR-012), 메모 내용 무전송.
 */
export const memoSharePresenceClient: IMemoSharePresencePort = new MemoSharePresenceClient();

// === Google Drive 동기화 ===

export const driveSyncRepository: IDriveSyncRepository = new JsonDriveSyncRepository(storage);

// DriveSyncAdapter는 토큰 getter가 필요 → lazy 초기화
let _driveSyncAdapter: DriveSyncAdapter | null = null;

export function getDriveSyncAdapter(getAccessToken: () => Promise<string>): IDriveSyncPort {
  if (!_driveSyncAdapter) {
    _driveSyncAdapter = new DriveSyncAdapter(getAccessToken);
  }
  return _driveSyncAdapter;
}

export function resetDriveSyncAdapter(): void {
  _driveSyncAdapter = null;
}

/**
 * 다른 기기의 Drive 백업에서 settings.json만 가져와 이 기기에 적용하는 유스케이스 팩토리.
 * (machine-specific 필드는 로컬 값을 유지, 자세한 병합 정책은 ImportSettingsFromCloud 참조)
 */
export function createImportSettingsFromCloud(
  getAccessToken: () => Promise<string>,
): ImportSettingsFromCloud {
  const drivePort = getDriveSyncAdapter(getAccessToken);
  return new ImportSettingsFromCloud(storage, drivePort, driveSyncRepository);
}

// (협업 보드 조립은 electron/ipc/board.ts 가 담당 — 상단 import 주석 참조)

// UseCase 팩토리 (Drive 클라이언트가 lazy이므로 팩토리 패턴)
export function createAssignmentUseCases(getAccessToken: () => Promise<string>) {
  const drivePort = getGoogleDriveClient(getAccessToken);

  return {
    createAssignment: new CreateAssignment(
      assignmentRepository,
      drivePort,
      assignmentServicePort,
      getAccessToken,
      () => authenticateGoogle.getEmail(),
    ),
    getAssignments: new GetAssignments(assignmentRepository, assignmentServicePort),
    getSubmissions: new GetSubmissions(assignmentRepository, assignmentServicePort),
    deleteAssignment: new DeleteAssignment(assignmentRepository, assignmentServicePort),
    copyMissingList: new CopyMissingList(assignmentRepository, assignmentServicePort),
  };
}
