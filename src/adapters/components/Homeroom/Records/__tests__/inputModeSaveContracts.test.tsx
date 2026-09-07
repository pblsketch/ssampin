/**
 * @vitest-environment jsdom
 *
 * 담임 기록 입력을 **실제로 렌더해서** 저장 계약을 확인한다 (계획 §4.2·§5.2, AC-03).
 *
 * 왜 이 파일이 필요한가: 이 화면에는 그동안 렌더 테스트가 하나도 없었다. 참조하는 테스트 네 개는
 * 전부 소스 파일을 문자열로 읽어 `toContain` 하는 메타 테스트라, 값이 **잘못된 함수에 넘어가도**
 * 통과한다. 그 사각지대에서 아래 결함이 게이트 4종이 초록인 채 존재했다:
 *
 * > 학생을 바꿔도 고른 주제가 남아, A 에게 고른 주제 이름으로 **C 밑에 새 주제가 생겼다.**
 * > `kind:'new'` 는 스토어의 소유권 검사에 걸릴 대상 자체가 없어 막히지도 않는다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const { fakeStore, ensureSpy, moveToNewThreadSpy, addRecordSpy, storeState } = vi.hoisted(() => {
  const store = <T extends object>(state: T) => {
    const hook = (sel?: (s: T) => unknown) => (sel ? sel(state) : state);
    hook.getState = () => state;
    hook.setState = () => {};
    return hook;
  };
  const ensure = vi.fn(async () => ({ evidenceId: 'ev-1', reused: false, threadLinked: true }));
  const moveToNew = vi.fn(async () => ({ movedIds: ['ev-1'], skippedIds: [], threadId: 'thr-1' }));
  const addRecord = vi.fn(async () => 'rec-1');
  return {
    fakeStore: store,
    ensureSpy: ensure,
    moveToNewThreadSpy: moveToNew,
    addRecordSpy: addRecord,
    storeState: {
      records: [],
      categories: [],
      loaded: true,
      viewMode: 'input',
      load: async () => {},
      setViewMode: () => {},
      addRecord,
      updateRecord: async () => {},
      deleteRecord: async () => {},
      toggleFollowUpDone: async () => {},
      toggleNeisReport: async () => {},
      toggleDocumentSubmitted: async () => {},
    },
  };
});

// 컨테이너는 실제 저장소(파일 IO)를 물고 오므로 전부 빈 껍데기로 둔다.
// 이 테스트가 보는 것은 화면 배선이고, 저장은 위 스토어 spy 로 확인한다.
vi.mock('@adapters/di/container', () => ({
  storage: {},
  scheduleRepository: {},
  seatingRepository: {},
  seatingSnapshotRepository: {},
  eventsRepository: {},
  memoRepository: {},
  todoRepository: {},
  settingsRepository: {},
  miniAppRepository: {},
  studentRecordsRepository: {},
  messageRepository: {},
  studentRepository: {},
  externalCalendarRepository: {},
  seatConstraintsRepository: {},
  seatPickerConfigRepository: {},
  teachingClassRepository: {},
  bookmarkRepository: {},
  desktopOrganizeRepository: {},
  ddayRepository: {},
  coolImportHistoryRepository: {},
  staffContactRepository: {},
  interactiveLessonRepository: {},
  manualMealRepository: {},
  imageWidgetRepository: {},
  wordCloudRepository: {},
  toolTemplateRepository: {},
  toolResultRepository: {},
  observationRepository: {},
  observationAttachmentRepository: {},
  studentPhotoRepository: {},
  imageResizer: {},
  photoRosterParser: {},
  recordDraftsRepository: {},
  recordEvidenceRepository: {},
  recordAiDraftRepository: {},
  inquiryThreadRepository: {},
  reminderFireRepository: {},
  noteRepository: {},
  wallBoardRepository: {},
  stickerRepository: {},
  classroomAgreementRepository: {},
  formRepository: {},
  formThumbnailer: {},
  formPreviewExtractor: {},
  formPrinter: {},
  neisPort: {},
  comciganPort: {},
  appinPort: {},
  assistPort: {},
  fetchRecordPromptL1: {},
  fetchModelCatalog: {},
  googleAuthPort: {},
  googleCalendarPort: {},
  calendarSyncRepo: {},
  authenticateGoogle: {},
  syncToGoogle: {},
  manageCalendarMapping: {},
  syncFromGoogle: {},
  googleTasksPort: {},
  analyticsPort: {},
  assignmentRepository: {},
  assignmentSupabaseClient: {},
  assignmentServicePort: {},
  signatureSupabaseClient: {},
  signaturePort: {},
  staffRoomPort: {},
  submitMonitorSignature: {},
  publishSignatureSession: {},
  shortLinkClient: {},
  consultationRepository: {},
  consultationSupabaseClient: {},
  surveyRepository: {},
  rubricRepository: {},
  manageRubrics: {},
  gradeAnalysisRepository: {},
  manageGradeAnalysis: {},
  transcriptRepository: {},
  manageImportedTranscript: {},
  evaluationPlanPort: {},
  importEvaluationPlan: {},
  schoolDisclosurePort: {},
  enrichSchoolOnSelect: {},
  documentParserPort: {},
  maskMappingRepository: {},
  convertDocument: {},
  maskMarkdown: {},
  manageMaskSessions: {},
  surveySupabaseClient: {},
  memoSharePresenceClient: {},
  driveSyncRepository: {},
}));
// 스토어 훅만 가짜로 바꾸고 같은 모듈의 상수·헬퍼는 진짜를 그대로 쓴다.
vi.mock('@adapters/stores/useStudentRecordsStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@adapters/stores/useStudentRecordsStore')>()),
  useStudentRecordsStore: fakeStore(storeState),
}));
vi.mock('@adapters/stores/useRecordEvidenceStore', () => ({
  useRecordEvidenceStore: fakeStore({
    records: [],
    loaded: true,
    loadError: null,
    load: async () => {},
    ensureEvidenceFromSource: ensureSpy,
    moveToNewThread: moveToNewThreadSpy,
  }),
}));
vi.mock('@adapters/stores/useInquiryThreadStore', () => ({
  useInquiryThreadStore: fakeStore({
    records: [],
    loaded: true,
    loadError: null,
    load: async () => {},
    assertLinkable: async () => {},
  }),
}));
vi.mock('@adapters/stores/useObservationAttachmentStore', () => ({
  useObservationAttachmentStore: fakeStore({
    attachments: [],
    load: async () => {},
    addAttachment: async () => 'att-1',
  }),
}));
// 음성 입력은 브라우저 API 를 끌고 온다 - 이 계약과 무관하다.
vi.mock('@adapters/components/common/VoiceTypingButton', () => ({
  VoiceTypingButton: () => null,
}));

import { InputMode } from '../InputMode';
import { DEFAULT_RECORD_CATEGORIES } from '@domain/valueObjects/RecordCategory';

const STUDENTS = [
  { id: 'stu-A', name: '김지훈', number: 1 },
  { id: 'stu-C', name: '박서연', number: 2 },
] as never;

function renderInput() {
  return render(
    <InputMode
      students={STUDENTS}
      records={[]}
      categories={DEFAULT_RECORD_CATEGORIES}
      selectedDate="2026-09-07"
    />,
  );
}

/** 학생 이름 단추를 눌러 고른다(명단은 왼쪽 열). */
async function pickStudent(name: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));
  });
}

beforeEach(() => {
  ensureSpy.mockClear();
  moveToNewThreadSpy.mockClear();
  addRecordSpy.mockClear();
});

afterEach(cleanup);

describe('AC-03 주제는 고른 그 학생의 것이다', () => {
  it('★학생을 바꾸면 앞 학생에게 고른 주제가 화면에서 사라진다', async () => {
    renderInput();
    await pickStudent('김지훈');
    // 본문이 있어야 주제를 고를 수 있다(계획 §4.1).
    const memo = screen.getByPlaceholderText(/관찰 내용|메모/);
    await act(async () => {
      fireEvent.change(memo, { target: { value: '토론에서 근거를 들어 말했다' } });
    });
    // A 에게 새 주제를 고른다.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /새 주제/ }));
    });
    const dialog = await screen.findByRole('dialog');
    await act(async () => {
      fireEvent.change(within(dialog).getByLabelText('주제 이름'), {
        target: { value: '발표 준비' },
      });
    });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: '만들기' }));
    });
    // 고른 뒤에는 단추 라벨이 '새 주제: 발표 준비' 로 바뀐다.
    expect(screen.getByText(/새 주제: 발표 준비/)).toBeTruthy();

    // 저장하지 않고 학생을 C 로 바꾼다(A 해제 → C 선택).
    await pickStudent('김지훈');
    await pickStudent('박서연');

    // ★C 화면에 A 의 주제가 남아 있으면, 저장 순간 C 밑에 그 이름으로 새 주제가 생긴다.
    await waitFor(() => expect(screen.queryByText(/새 주제: 발표 준비/)).toBeNull());
    // 다시 '새 주제 만들기' 로 돌아와 있다 - C 에게는 고른 것이 없다.
    expect(screen.getByText('새 주제 만들기')).toBeTruthy();
    expect(moveToNewThreadSpy).not.toHaveBeenCalled();
    expect(ensureSpy).not.toHaveBeenCalled();
  });
});
