/**
 * Drive 동기화 후 스토어 리로드 유틸리티
 */
export async function reloadStores(downloadedFiles: string[]): Promise<void> {
  for (const file of downloadedFiles) {
    try {
      if (
        file === 'note-notebooks' ||
        file === 'note-sections' ||
        file === 'note-pages-meta' ||
        file.startsWith('note-body--')
      ) {
        const { useNoteStore } = await import('@adapters/stores/useNoteStore');
        useNoteStore.setState({ loaded: false });
        await useNoteStore.getState().load(true);
        continue;
      }

      switch (file) {
        case 'settings': {
          const { useSettingsStore } = await import('@adapters/stores/useSettingsStore');
          useSettingsStore.setState({ loaded: false });
          await useSettingsStore.getState().load();
          break;
        }
        case 'class-schedule':
        case 'teacher-schedule': {
          const { useScheduleStore } = await import('@adapters/stores/useScheduleStore');
          useScheduleStore.setState({ loaded: false });
          await useScheduleStore.getState().load();
          break;
        }
        case 'students': {
          const { useStudentStore } = await import('@adapters/stores/useStudentStore');
          useStudentStore.setState({ loaded: false });
          await useStudentStore.getState().load();
          break;
        }
        case 'seating': {
          const { useSeatingStore } = await import('@adapters/stores/useSeatingStore');
          useSeatingStore.setState({ loaded: false });
          await useSeatingStore.getState().load();
          break;
        }
        case 'events': {
          const { useEventsStore } = await import('@adapters/stores/useEventsStore');
          useEventsStore.setState({ loaded: false });
          await useEventsStore.getState().load();
          break;
        }
        case 'memos': {
          const { useMemoStore } = await import('@adapters/stores/useMemoStore');
          useMemoStore.setState({ loaded: false });
          await useMemoStore.getState().load();
          break;
        }
        case 'todos': {
          const { useTodoStore } = await import('@adapters/stores/useTodoStore');
          useTodoStore.setState({ loaded: false });
          await useTodoStore.getState().load();
          break;
        }
        case 'student-records': {
          const { useStudentRecordsStore } = await import('@adapters/stores/useStudentRecordsStore');
          useStudentRecordsStore.setState({ loaded: false });
          await useStudentRecordsStore.getState().load();
          break;
        }
        case 'bookmarks': {
          // useBookmarkStore는 loaded 플래그 없이 loadAll()로 재로드
          const { useBookmarkStore } = await import('@adapters/stores/useBookmarkStore');
          await useBookmarkStore.getState().loadAll();
          break;
        }
        case 'dday': {
          const { useDDayStore } = await import('@adapters/stores/useDDayStore');
          useDDayStore.setState({ loaded: false });
          await useDDayStore.getState().load();
          break;
        }
        case 'surveys': {
          const { useSurveyStore } = await import('@adapters/stores/useSurveyStore');
          useSurveyStore.setState({ loaded: false });
          await useSurveyStore.getState().load();
          break;
        }
        case 'seat-constraints': {
          const { useSeatConstraintsStore } = await import('@adapters/stores/useSeatConstraintsStore');
          useSeatConstraintsStore.setState({ loaded: false });
          await useSeatConstraintsStore.getState().load();
          break;
        }
        case 'teaching-classes': {
          const { useTeachingClassStore } = await import('@adapters/stores/useTeachingClassStore');
          useTeachingClassStore.setState({ loaded: false });
          await useTeachingClassStore.getState().load();
          break;
        }
        case 'consultations': {
          const { useConsultationStore } = await import('@adapters/stores/useConsultationStore');
          useConsultationStore.setState({ loaded: false });
          await useConsultationStore.getState().load();
          break;
        }
        // curriculum-progress, attendance는 useTeachingClassStore의 load()에서 처리됨
        case 'curriculum-progress':
        case 'attendance': {
          const { useTeachingClassStore } = await import('@adapters/stores/useTeachingClassStore');
          useTeachingClassStore.setState({ loaded: false });
          await useTeachingClassStore.getState().load();
          break;
        }
        case 'assignments': {
          const { useAssignmentStore } = await import('@adapters/stores/useAssignmentStore');
          await useAssignmentStore.getState().loadAssignments();
          break;
        }
      }
    } catch (err) {
      console.error(`[DriveSync] Failed to reload store for ${file}:`, err);
    }
  }
}
