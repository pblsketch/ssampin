/**
 * Google Drive 동기화 단일 소스 (Single Source of Truth).
 *
 * 4곳에 분산되어 있던 매핑(SYNC_FILES, App.tsx subscribe, reloadStores switch,
 * FILE_TO_STORE)을 본 파일 하나로 통합한다. 새 동기화 도메인을 추가할 때는
 * 이 파일의 SYNC_REGISTRY 배열에 한 블록만 추가하면 모든 동기화 경로가
 * 자동으로 정합된다.
 *
 * 레이어 규칙 (Clean Architecture):
 *   - 본 파일은 usecases/ 레이어 → adapters/stores 직접 import 금지.
 *   - store 참조는 반드시 dynamic import lazy 함수로 캡슐화한다.
 *   - storeSubscribe는 동기 함수가 필요하므로 본 파일에서 정의하지 않고,
 *     App.tsx의 STORE_SUBSCRIBE_MAP이 fileName → store.subscribe를 매핑한다.
 */

/**
 * 단일 동기화 도메인의 모든 관심사를 하나의 레코드로 표현한다.
 */
export interface SyncDomain {
  /**
   * Drive에 저장되는 파일 기본명 (확장자 제외).
   * 매니페스트 키와 동일. e.g. 'class-schedule' → Drive에 'class-schedule.json' 생성.
   */
  fileName: string;

  /**
   * App.tsx autoSyncOnSave 구독에서 제외할지 여부.
   * true = 자동 업로드 구독 제외 (settings 무한루프 방지, 또는 동일 store 중복 구독 방지).
   * 기본값: false.
   */
  subscribeExcluded?: boolean;

  /**
   * 다운로드 완료 후 해당 store를 재로드하는 함수.
   * subscribeExcluded인 도메인(settings 등)도 다운로드 후 reload가 필요하므로 분리.
   *
   * 반드시 dynamic import lazy로 구현 (usecases → adapters 직접 의존 금지).
   *
   * ⚠️ setState({ loaded: false })를 켜지 말 것 — 페이지의 `!loaded` 로딩 가드가
   * 화면(편집 중인 입력 포함)을 통째로 언마운트해 작성 내용이 소실된다.
   * store.load(true) / reload() / refresh() 등으로 loaded를 유지한 채 조용히 갱신한다.
   * (예외: useScheduleStore — 타 세션 작업 중 파일이라 force 미지원, 후속 전환 대상)
   */
  reload: () => Promise<void>;

  /**
   * true = fileName이 런타임에 결정되는 동적 파일군.
   * e.g. 노트 페이지 본문: 'note-body--{pageId}'
   * isDynamic === true이면 enumerateDynamic을 반드시 제공해야 한다.
   *
   * 본 리팩터에서는 인터페이스만 준비. 실제 활용은 note-cloud-sync PDCA에서.
   */
  isDynamic?: boolean;

  /**
   * 런타임에 실제 fileName 목록을 반환하는 함수.
   * isDynamic === true인 도메인에만 사용.
   * SyncToCloud.execute()가 정적 SYNC_FILES 외에 이 목록을 합집합하여 업로드.
   */
  enumerateDynamic?: () => Promise<string[]>;
}

export const SYNC_REGISTRY: SyncDomain[] = [
  // 1. settings ─ 무한루프 방지: 자동 업로드 구독 제외
  {
    fileName: 'settings',
    subscribeExcluded: true,
    reload: async () => {
      const { useSettingsStore } = await import('@adapters/stores/useSettingsStore');
      await useSettingsStore.getState().load(true);
    },
  },
  // 2. class-schedule ─ useScheduleStore (대표 키)
  {
    fileName: 'class-schedule',
    reload: async () => {
      const { useScheduleStore } = await import('@adapters/stores/useScheduleStore');
      useScheduleStore.setState({ loaded: false });
      await useScheduleStore.getState().load();
    },
  },
  // 3. teacher-schedule ─ useScheduleStore 중복 subscribe 방지
  {
    fileName: 'teacher-schedule',
    subscribeExcluded: true,
    reload: async () => {
      const { useScheduleStore } = await import('@adapters/stores/useScheduleStore');
      useScheduleStore.setState({ loaded: false });
      await useScheduleStore.getState().load();
    },
  },
  // 4. timetable-overrides ─ useScheduleStore 중복 subscribe 방지
  {
    fileName: 'timetable-overrides',
    subscribeExcluded: true,
    reload: async () => {
      const { useScheduleStore } = await import('@adapters/stores/useScheduleStore');
      useScheduleStore.setState({ loaded: false });
      await useScheduleStore.getState().load();
    },
  },
  // 5. students
  {
    fileName: 'students',
    reload: async () => {
      const { useStudentStore } = await import('@adapters/stores/useStudentStore');
      await useStudentStore.getState().load(true);
    },
  },
  // 6. seating
  {
    fileName: 'seating',
    reload: async () => {
      const { useSeatingStore } = await import('@adapters/stores/useSeatingStore');
      await useSeatingStore.getState().load(true);
    },
  },
  // 7. events
  {
    fileName: 'events',
    reload: async () => {
      const { useEventsStore } = await import('@adapters/stores/useEventsStore');
      // reload()는 loaded를 유지한 채 데이터만 교체하는 기존 전용 함수
      await useEventsStore.getState().reload();
    },
  },
  // 8. memos
  {
    fileName: 'memos',
    reload: async () => {
      const { useMemoStore } = await import('@adapters/stores/useMemoStore');
      // loaded:false로 떨어뜨리지 않고 force 리로드 — 편집 중인 메모 카드가
      // 페이지 스피너로 언마운트돼 입력이 소실되는 것을 막는다.
      await useMemoStore.getState().load(true);
    },
  },
  // 9. todos
  {
    fileName: 'todos',
    reload: async () => {
      const { useTodoStore } = await import('@adapters/stores/useTodoStore');
      // refresh()는 loaded를 유지한 채 데이터만 교체하는 기존 전용 함수
      await useTodoStore.getState().refresh();
    },
  },
  // 10. student-records
  {
    fileName: 'student-records',
    reload: async () => {
      const { useStudentRecordsStore } = await import('@adapters/stores/useStudentRecordsStore');
      await useStudentRecordsStore.getState().load(true);
    },
  },
  // 11. bookmarks ─ loaded 플래그 없는 패턴 (loadAll 직접 호출)
  {
    fileName: 'bookmarks',
    reload: async () => {
      const { useBookmarkStore } = await import('@adapters/stores/useBookmarkStore');
      await useBookmarkStore.getState().loadAll();
    },
  },
  // 12. surveys
  {
    fileName: 'surveys',
    reload: async () => {
      const { useSurveyStore } = await import('@adapters/stores/useSurveyStore');
      // useSurveyStore.load()는 loaded 가드가 없어 항상 재조회한다
      await useSurveyStore.getState().load();
    },
  },
  // 13. assignments ─ loaded 플래그 없는 패턴 (loadAssignments 직접 호출)
  {
    fileName: 'assignments',
    reload: async () => {
      const { useAssignmentStore } = await import('@adapters/stores/useAssignmentStore');
      await useAssignmentStore.getState().loadAssignments();
    },
  },
  // 14. seat-constraints
  {
    fileName: 'seat-constraints',
    reload: async () => {
      const { useSeatConstraintsStore } = await import('@adapters/stores/useSeatConstraintsStore');
      await useSeatConstraintsStore.getState().load(true);
    },
  },
  // 15. teaching-classes ─ useTeachingClassStore (대표 키)
  {
    fileName: 'teaching-classes',
    reload: async () => {
      const { useTeachingClassStore } = await import('@adapters/stores/useTeachingClassStore');
      await useTeachingClassStore.getState().load(true);
    },
  },
  // 16. curriculum-progress ─ useTeachingClassStore 중복 subscribe 방지
  {
    fileName: 'curriculum-progress',
    subscribeExcluded: true,
    reload: async () => {
      const { useTeachingClassStore } = await import('@adapters/stores/useTeachingClassStore');
      await useTeachingClassStore.getState().load(true);
    },
  },
  // 17. attendance ─ useTeachingClassStore 중복 subscribe 방지
  {
    fileName: 'attendance',
    subscribeExcluded: true,
    reload: async () => {
      const { useTeachingClassStore } = await import('@adapters/stores/useTeachingClassStore');
      await useTeachingClassStore.getState().load(true);
    },
  },
  // 18. dday
  {
    fileName: 'dday',
    reload: async () => {
      const { useDDayStore } = await import('@adapters/stores/useDDayStore');
      await useDDayStore.getState().load(true);
    },
  },
  // 18-1. staff-contacts ─ 교직원 연락처 (학생·보호자 연락처는 students 키에 이미 포함)
  {
    fileName: 'staff-contacts',
    reload: async () => {
      const { useStaffContactStore } = await import('@adapters/stores/useStaffContactStore');
      await useStaffContactStore.getState().load(true);
    },
  },
  // 19. consultations
  {
    fileName: 'consultations',
    reload: async () => {
      const { useConsultationStore } = await import('@adapters/stores/useConsultationStore');
      // useConsultationStore.load()는 loaded 가드가 없어 항상 재조회한다
      await useConsultationStore.getState().load();
    },
  },
  // 20. manual-meals ─ useMealStore는 loaded 플래그 없는 패턴 (loadManualMeals 직접 호출)
  {
    fileName: 'manual-meals',
    reload: async () => {
      const { useMealStore } = await import('@adapters/stores/useMealStore');
      await useMealStore.getState().loadManualMeals();
    },
  },
  // 21. note-notebooks ─ 노트북 메타 (정적). useNoteStore subscribe 대표 키.
  {
    fileName: 'note-notebooks',
    reload: async () => {
      const { useNoteStore } = await import('@adapters/stores/useNoteStore');
      // loaded:false로 떨어뜨리지 않고 force 리로드 — 노트 편집기가 스피너로
      // 언마운트돼 작성 중인 본문/입력이 소실되는 것을 막는다.
      await useNoteStore.getState().load(true);
    },
  },
  // 22. note-sections ─ 섹션 메타. 동일 store(useNoteStore) 중복 subscribe 방지.
  {
    fileName: 'note-sections',
    subscribeExcluded: true,
    reload: async () => {
      const { useNoteStore } = await import('@adapters/stores/useNoteStore');
      // loaded:false로 떨어뜨리지 않고 force 리로드 — 노트 편집기가 스피너로
      // 언마운트돼 작성 중인 본문/입력이 소실되는 것을 막는다.
      await useNoteStore.getState().load(true);
    },
  },
  // 23. note-pages-meta ─ 페이지 메타. 동일 store(useNoteStore) 중복 subscribe 방지.
  {
    fileName: 'note-pages-meta',
    subscribeExcluded: true,
    reload: async () => {
      const { useNoteStore } = await import('@adapters/stores/useNoteStore');
      // loaded:false로 떨어뜨리지 않고 force 리로드 — 노트 편집기가 스피너로
      // 언마운트돼 작성 중인 본문/입력이 소실되는 것을 막는다.
      await useNoteStore.getState().load(true);
    },
  },
  // 24. note-body ─ 페이지 본문 (동적, 페이지마다 1파일).
  // 실제 동적 enumeration은 SyncToCloud/SyncFromCloud 생성자의 getDynamicSyncFiles 훅
  // (container.ts에서 INotebookRepository.listPageBodyKeys() 래퍼로 주입)이 담당한다.
  // 본 registry의 enumerateDynamic은 메타테스트(f) 정합성을 위한 placeholder이다.
  {
    fileName: 'note-body',
    subscribeExcluded: true,
    isDynamic: true,
    enumerateDynamic: async () => [],
    reload: async () => {
      const { useNoteStore } = await import('@adapters/stores/useNoteStore');
      // loaded:false로 떨어뜨리지 않고 force 리로드 — 노트 편집기가 스피너로
      // 언마운트돼 작성 중인 본문/입력이 소실되는 것을 막는다.
      await useNoteStore.getState().load(true);
    },
  },
  // 25. stickers ─ 내 이모티콘
  {
    fileName: 'stickers',
    reload: async () => {
      const { useStickerStore } = await import('@adapters/stores/useStickerStore');
      await useStickerStore.getState().load(true);
    },
  },
  // 26. rubrics ─ 수행평가 채점 (루브릭 + 채점 기록)
  {
    fileName: 'rubrics',
    reload: async () => {
      const { useRubricStore } = await import('@adapters/stores/useRubricStore');
      // useRubricStore.load()는 loaded 가드가 없어 항상 재조회한다
      await useRubricStore.getState().load();
    },
  },
  // 27. observations ─ 학생별 수업 기록 (특기사항/관찰 기록)
  {
    fileName: 'observations',
    reload: async () => {
      const { useObservationStore } = await import('@adapters/stores/useObservationStore');
      await useObservationStore.getState().load(true);
    },
  },
  // 28. record-drafts ─ AI 브릿지 생기부 초안 (영역별 write-back 수신)
  {
    fileName: 'record-drafts',
    reload: async () => {
      const { useRecordDraftsStore } = await import('@adapters/stores/useRecordDraftsStore');
      await useRecordDraftsStore.getState().load(true);
    },
  },
  // 29. observation-attachments ─ 관찰 첨부 메타(JSON). useObservationAttachmentStore 대표 키.
  {
    fileName: 'observation-attachments',
    reload: async () => {
      const { useObservationAttachmentStore } =
        await import('@adapters/stores/useObservationAttachmentStore');
      await useObservationAttachmentStore.getState().load(true);
    },
  },
  // 30. obs-attachment-binary ─ 관찰 첨부 바이너리 (동적, 첨부마다 1파일).
  // 실제 동적 enumeration은 SyncToCloud/SyncFromCloud의 getDynamicSyncFiles 훅
  // (useDriveSyncStore.ts에서 observationAttachmentRepository.listBinaryKeys() 래퍼로 주입)이 담당한다.
  // 본 registry의 enumerateDynamic은 메타테스트(f) 정합성을 위한 placeholder이다.
  // subscribeExcluded: true — 메타(#29)가 대표 구독 키이므로 중복 구독 방지.
  {
    fileName: 'obs-attachment-binary',
    subscribeExcluded: true,
    isDynamic: true,
    enumerateDynamic: async () => [],
    reload: async () => {
      // 바이너리는 store 재로드 불필요 — 메타(#29) reload가 useObservationAttachmentStore를 갱신한다.
      // 다운로드된 바이너리 파일은 IStoragePort.writeBinary로 직접 기록되며 store를 거치지 않는다.
    },
  },
  // 31. archives ─ 학년도 보관함 파일군 (S4.1, 동적: 'archives/{term}/{relPath}').
  // 아카이브는 전환 실행 시에만 생기는 불변 파일군이라 대응하는 스토어가 없다 —
  // subscribeExcluded(자동 업로드 구독 대상 아님) + isDynamic(정적 SYNC_FILES 제외).
  // 실제 열거·업로드·배치는 SyncToCloud/SyncFromCloud의 아카이브 훅
  // (useDriveSyncStore가 archiveSyncGateway로 주입 — 데스크톱 전용)이 담당하고,
  // 본 registry의 enumerateDynamic은 메타테스트(f) 정합성용 placeholder이다.
  {
    fileName: 'archives',
    subscribeExcluded: true,
    isDynamic: true,
    enumerateDynamic: async () => [],
    reload: async () => {
      // 스토어 없음 — 보관함 뷰어의 파일 캐시만 무효화(다음 열람이 새 학기를 읽는다).
      const { invalidateArchiveFileCache } =
        await import('@adapters/components/Archive/useArchiveFile');
      invalidateArchiveFileCache();
    },
  },
  // 32. student-photos ─ 학생 얼굴 사진 메타(JSON). 관찰 첨부(#29)와 같은 구조다.
  //
  // subscribeExcluded: true — **구독할 스토어가 없다.**
  // 사진은 명렬표 가져오기·삭제 때만 바뀌고, 화면은 학습 모드를 열 때 리포지토리에서 직접 읽는다
  // (`useStudentPhotoUrls`). 사진 바이트가 화면에 들어오는 관문을 하나로 좁혀 두려고
  // 일부러 스토어를 만들지 않았으므로, 자동 업로드 구독 대상에서도 빠진다.
  // 변경분은 다음 동기화(수동·주기)에서 매니페스트 비교로 자연히 올라간다.
  {
    fileName: 'student-photos',
    subscribeExcluded: true,
    reload: async () => {
      // 사진 메타에는 대응 스토어가 없다 — 화면이 열릴 때 리포지토리에서 직접 읽는다
      // (`useStudentPhotoUrls`). 사진 바이트가 화면에 들어오는 관문을 하나로 좁혀 두기 위한 설계라,
      // 여기서 스토어를 새로 만들면 그 관문이 둘이 된다.
    },
  },
  // 33. student-photo-binary ─ 학생 얼굴 사진 본체 (동적, 학생마다 1파일).
  // 실제 열거는 `collectBinarySyncKeys`(관찰 첨부와 합쳐 저장소별 실패를 격리)가 담당하고,
  // 여기 enumerateDynamic 은 메타테스트 정합성용 placeholder 다 — #30 과 같은 계약.
  // subscribeExcluded: true — 메타(#32)가 대표 구독 키다.
  {
    fileName: 'student-photo-binary',
    subscribeExcluded: true,
    isDynamic: true,
    enumerateDynamic: async () => [],
    reload: async () => {
      // 바이너리는 store 재로드가 필요 없다 — 다운로드된 파일은 writeBinary 로 직접 기록되고,
      // 다음에 학습 모드를 열 때 읽힌다.
    },
  },
];

/**
 * 기존 코드 후방 호환을 위한 파생 상수.
 * SyncToCloud / SyncFromCloud는 이 export를 그대로 import하여 사용한다.
 *
 * isDynamic 도메인은 정적 목록에서 제외 (런타임 enumerateDynamic으로 합집합).
 */
export const SYNC_FILES: readonly string[] = SYNC_REGISTRY.filter((d) => !d.isDynamic).map(
  (d) => d.fileName,
);

export type SyncFileName = (typeof SYNC_FILES)[number];

/**
 * 파일 쓰기 락(withFileLock) 키 정본 — 쓰기 직렬화 대상(record-merge 3도메인)의 이름 있는 키.
 *
 * 역할 분리(sync-hardening-2 계획 §10 A1): 동기화 도메인의 원천은 SYNC_REGISTRY이고
 * SYNC_FILES는 그 파생이다. SYNC_FILE_KEYS는 그중 "파일 쓰기 락"에 쓰는 부분집합의
 * named 정본일 뿐, 동기화 도메인 목록을 대체하지 않는다.
 *
 * 락 키는 반드시 이 상수로만 접근한다(리터럴 금지) — 오타 하나가 별개 락 도메인을
 * 만들어 직렬화가 조용히 깨진다. 값은 각 도메인의 SYNC_REGISTRY.fileName이자
 * 리포지토리 storage 키와 동일해야 하며, 정합은 fileWriteLock.test.ts가 잠근다.
 */
export const SYNC_FILE_KEYS = {
  studentRecords: 'student-records',
  attendance: 'attendance',
  observations: 'observations',
} as const;
