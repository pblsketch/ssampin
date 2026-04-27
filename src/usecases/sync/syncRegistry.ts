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
      useSettingsStore.setState({ loaded: false });
      await useSettingsStore.getState().load();
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
      useStudentStore.setState({ loaded: false });
      await useStudentStore.getState().load();
    },
  },
  // 6. seating
  {
    fileName: 'seating',
    reload: async () => {
      const { useSeatingStore } = await import('@adapters/stores/useSeatingStore');
      useSeatingStore.setState({ loaded: false });
      await useSeatingStore.getState().load();
    },
  },
  // 7. events
  {
    fileName: 'events',
    reload: async () => {
      const { useEventsStore } = await import('@adapters/stores/useEventsStore');
      useEventsStore.setState({ loaded: false });
      await useEventsStore.getState().load();
    },
  },
  // 8. memos
  {
    fileName: 'memos',
    reload: async () => {
      const { useMemoStore } = await import('@adapters/stores/useMemoStore');
      useMemoStore.setState({ loaded: false });
      await useMemoStore.getState().load();
    },
  },
  // 9. todos
  {
    fileName: 'todos',
    reload: async () => {
      const { useTodoStore } = await import('@adapters/stores/useTodoStore');
      useTodoStore.setState({ loaded: false });
      await useTodoStore.getState().load();
    },
  },
  // 10. student-records
  {
    fileName: 'student-records',
    reload: async () => {
      const { useStudentRecordsStore } = await import('@adapters/stores/useStudentRecordsStore');
      useStudentRecordsStore.setState({ loaded: false });
      await useStudentRecordsStore.getState().load();
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
      useSurveyStore.setState({ loaded: false });
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
      useSeatConstraintsStore.setState({ loaded: false });
      await useSeatConstraintsStore.getState().load();
    },
  },
  // 15. teaching-classes ─ useTeachingClassStore (대표 키)
  {
    fileName: 'teaching-classes',
    reload: async () => {
      const { useTeachingClassStore } = await import('@adapters/stores/useTeachingClassStore');
      useTeachingClassStore.setState({ loaded: false });
      await useTeachingClassStore.getState().load();
    },
  },
  // 16. curriculum-progress ─ useTeachingClassStore 중복 subscribe 방지
  {
    fileName: 'curriculum-progress',
    subscribeExcluded: true,
    reload: async () => {
      const { useTeachingClassStore } = await import('@adapters/stores/useTeachingClassStore');
      useTeachingClassStore.setState({ loaded: false });
      await useTeachingClassStore.getState().load();
    },
  },
  // 17. attendance ─ useTeachingClassStore 중복 subscribe 방지
  {
    fileName: 'attendance',
    subscribeExcluded: true,
    reload: async () => {
      const { useTeachingClassStore } = await import('@adapters/stores/useTeachingClassStore');
      useTeachingClassStore.setState({ loaded: false });
      await useTeachingClassStore.getState().load();
    },
  },
  // 18. dday
  {
    fileName: 'dday',
    reload: async () => {
      const { useDDayStore } = await import('@adapters/stores/useDDayStore');
      useDDayStore.setState({ loaded: false });
      await useDDayStore.getState().load();
    },
  },
  // 19. consultations
  {
    fileName: 'consultations',
    reload: async () => {
      const { useConsultationStore } = await import('@adapters/stores/useConsultationStore');
      useConsultationStore.setState({ loaded: false });
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
      useNoteStore.setState({ loaded: false });
      await useNoteStore.getState().load(true);
    },
  },
  // 22. note-sections ─ 섹션 메타. 동일 store(useNoteStore) 중복 subscribe 방지.
  {
    fileName: 'note-sections',
    subscribeExcluded: true,
    reload: async () => {
      const { useNoteStore } = await import('@adapters/stores/useNoteStore');
      useNoteStore.setState({ loaded: false });
      await useNoteStore.getState().load(true);
    },
  },
  // 23. note-pages-meta ─ 페이지 메타. 동일 store(useNoteStore) 중복 subscribe 방지.
  {
    fileName: 'note-pages-meta',
    subscribeExcluded: true,
    reload: async () => {
      const { useNoteStore } = await import('@adapters/stores/useNoteStore');
      useNoteStore.setState({ loaded: false });
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
      useNoteStore.setState({ loaded: false });
      await useNoteStore.getState().load(true);
    },
  },
  // 25. stickers ─ 내 이모티콘
  {
    fileName: 'stickers',
    reload: async () => {
      const { useStickerStore } = await import('@adapters/stores/useStickerStore');
      useStickerStore.setState({ loaded: false });
      await useStickerStore.getState().load();
    },
  },
];

/**
 * 기존 코드 후방 호환을 위한 파생 상수.
 * SyncToCloud / SyncFromCloud는 이 export를 그대로 import하여 사용한다.
 *
 * isDynamic 도메인은 정적 목록에서 제외 (런타임 enumerateDynamic으로 합집합).
 */
export const SYNC_FILES: readonly string[] = SYNC_REGISTRY
  .filter(d => !d.isDynamic)
  .map(d => d.fileName);

export type SyncFileName = (typeof SYNC_FILES)[number];
