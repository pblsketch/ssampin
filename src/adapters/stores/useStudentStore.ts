import { create } from 'zustand';
import type { Student, StudentStatus } from '@domain/entities/Student';
import { isStudentActive, normalizeStudentList } from '@domain/rules/studentActivity';
import { planStudentCountReduce } from '@domain/rules/studentCountRules';
import type { ReduceCountPlan } from '@domain/rules/studentCountRules';
import { studentRepository } from '@adapters/di/container';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useSampleBannerStore } from '@adapters/stores/useSampleBannerStore';
import { collectSampleRosterExternalRefs } from '@usecases/roster/collectExternalRefs';
import { decideCleanupAction } from '@usecases/roster/cleanupSampleRoster';
import { useToastStore } from '@adapters/components/common/Toast';
import { toLocalDateString } from '@shared/utils/localDate';

interface StudentState {
  students: readonly Student[];
  loaded: boolean;

  load: (force?: boolean) => Promise<void>;
  updateStudents: (students: readonly Student[]) => Promise<void>;
  updateStudentName: (id: string, name: string) => Promise<void>;
  updateStudentField: (
    studentId: string,
    field:
      | 'name'
      | 'phone'
      | 'parentPhone'
      | 'parentPhoneLabel'
      | 'parentPhone2'
      | 'parentPhone2Label'
      | 'studentNumber'
      | 'birthDate'
      | 'status'
      | 'statusNote'
      | 'statusChangedAt',
    value: string | number,
  ) => Promise<void>;
  toggleVacant: (studentId: string) => Promise<void>;
  changeStatus: (studentId: string, status: StudentStatus, note?: string) => Promise<void>;
  /**
   * Phase 4 — 학생 수 변경 계획 수립 (실제 저장 X).
   *
   * 증가 → 안전 case (committed에 추가된 학생 포함)
   * 감소 → planStudentCountReduce 결과:
   *   - safe: 비활성 학생만 제거 → 호출자가 commitStudentCountChange로 즉시 적용
   *   - requiresConfirm: 활성 학생 제거 필요 → 호출자가 confirm 모달 노출 후 commit
   */
  planStudentCountChange: (count: number) => ReduceCountPlan | null;
  /** Phase 4 — planStudentCountChange로 받은 newStudents를 디스크에 영속화 */
  commitStudentCountChange: (newStudents: readonly Student[]) => Promise<void>;

  /** 파생 값 */
  getStudent: (id: string | null) => Student | undefined;
  activeStudents: () => readonly Student[];
}

/**
 * roster-sample-data-removal Phase 2 — 사용자 수정 흔적 세팅 (가드 F 입력).
 *
 * 명렬 수정 액션이 호출될 때마다 `settings.everEditedRoster = true`로 세팅한다.
 * 마이그레이션이 한 번이라도 사용자가 만진 명렬을 자동 정리하지 않게 막는
 * 핵심 가드이므로 **모든** 수정 액션에서 반드시 호출되어야 한다.
 *
 * 이미 true여도 멱등(설정 update가 동일 값 set을 안전하게 다룸)이므로 가드 없이 호출.
 * 실패해도 명렬 저장 자체는 이미 끝났으므로 silent fail로 둔다.
 */
async function markRosterEdited(): Promise<void> {
  try {
    await useSettingsStore.getState().update({ everEditedRoster: true });
  } catch {
    // 무시 — 명렬 데이터는 이미 저장됨. 다음 수정 시 다시 시도된다.
  }
}

export const useStudentStore = create<StudentState>((set, get) => ({
  students: [],
  loaded: false,

  load: async (force = false) => {
    // force=true: 동기화 리로드용 — loaded를 유지한 채 데이터만 조용히 갱신
    if (get().loaded && !force) return;
    try {
      const data = await studentRepository.getStudents();
      if (!data) {
        // 신규 설치: SAMPLE_STUDENTS 자동 시드를 제거 (Phase 1).
        // 디스크에는 students.json을 쓰지 않고 메모리만 빈 배열로 초기화한다.
        // 사용자가 명렬 관리 탭에서 명단을 등록할 때 비로소 파일이 생성된다.
        set({ students: [], loaded: true });
        return;
      }

      // status ↔ isVacant 양방향 정규화 (마이그레이션).
      // changeStatus가 정상 경로에서 두 필드를 동기화하지만, 외부 sync·legacy 데이터·field 직접 변경 등으로
      // 불일치가 들어올 수 있으므로 load 시 한 번 강제 동기화한다.
      const normalized = normalizeStudentList(data);

      // ── roster-sample-data-removal Phase 2 마이그레이션 검사 ──
      // 6중 가드(A·B·C·D·E·F·G)를 통과한 경우에만 빈 명렬로 정리한다.
      // 가드 한 개라도 실패하면 명렬을 보존하고 (필요 시) 상단 배너만 띄운다.
      // (static import로 변경 — dynamic import가 Vite HMR boundary를 깨면서
      //  Toast.tsx React 컴포넌트 chunk 분리 → React 인스턴스 split 발생.)
      const externalRefs = await collectSampleRosterExternalRefs(normalized);
      const settings = useSettingsStore.getState().settings;
      const action = decideCleanupAction(normalized, externalRefs, settings);

      if (action === 'cleanup') {
        // 1) 디스크에서 35명 제거 (빈 배열로 덮어쓰기) — **반드시** 플래그 세팅보다 먼저.
        //    write 실패 시 didCleanSampleRoster=true가 박혀버리면 다음 load 때 G 가드로
        //    스킵되어 영구 오염 — 디자인 §8의 추가 위험표 참조.
        await studentRepository.saveStudents([]);

        // 2) 디스크 쓰기 성공 후에만 멱등 플래그 ON.
        await useSettingsStore.getState().update({ didCleanSampleRoster: true });

        // 3) 메모리도 정리하고 loaded 처리.
        set({ students: [], loaded: true });

        // 4) 마이그레이션 토스트 1회 발사 — sampleRosterMigrationToastShownAt 가드.
        const settingsAfter = useSettingsStore.getState().settings;
        if (!settingsAfter.sampleRosterMigrationToastShownAt) {
          useToastStore.getState().show(
            '이전에 자동으로 들어가 있던 샘플 명단을 정리했어요. 우리 반 학생을 등록해 주세요.',
            'success',
            {
              label: '지금 등록하기',
              onClick: () => {
                window.dispatchEvent(
                  new CustomEvent<string>('ssampin:navigate', { detail: 'homeroom' }),
                );
              },
            },
            5000,
          );
          await useSettingsStore.getState().update({
            sampleRosterMigrationToastShownAt: new Date().toISOString(),
          });
        }
        return;
      }

      if (action === 'banner') {
        // 명렬은 유지하고 상단 배너만 노출.
        useSampleBannerStore.getState().show();
        // fall-through — normalized 저장 + set
      }

      if (normalized !== data) {
        await studentRepository.saveStudents(normalized);
      }
      set({ students: normalized, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  updateStudents: async (newStudents) => {
    await studentRepository.saveStudents(newStudents);
    set({ students: newStudents });
    // 가드 F — 사용자가 명렬을 일괄 교체했음을 기록.
    await markRosterEdited();
  },

  updateStudentName: async (id, name) => {
    const { students } = get();
    const newStudents = students.map((s) => (s.id === id ? { ...s, name } : s));
    await studentRepository.saveStudents(newStudents);
    set({ students: newStudents });
    // 가드 F — 이름 수정도 사용자 의도 표식.
    await markRosterEdited();
  },

  updateStudentField: async (studentId, field, value) => {
    const { students } = get();
    const newStudents = students.map((s) => (s.id === studentId ? { ...s, [field]: value } : s));
    try {
      await studentRepository.saveStudents(newStudents);
      set({ students: newStudents });

      // 가드 F — 어떤 필드든 사용자가 수정했으면 표식 세팅.
      await markRosterEdited();

      // 생일 변경 시 일정 동기화
      if (field === 'birthDate' && useSettingsStore.getState().settings.syncBirthdaysToSchedule) {
        void useEventsStore.getState().syncBirthdayEvents(newStudents);
      }
    } catch {
      // 무시
    }
  },

  toggleVacant: async (studentId) => {
    const { students } = get();
    const student = students.find((s) => s.id === studentId);
    if (!student) return;

    const newStudents = students.map((s) =>
      s.id === studentId ? { ...s, isVacant: !student.isVacant } : s,
    );

    try {
      await studentRepository.saveStudents(newStudents);
      set({ students: newStudents });

      // 가드 F — 결번 토글도 사용자 의도 표식.
      await markRosterEdited();

      // 결번 변경 시 생일 동기화 반영
      if (student.birthDate && useSettingsStore.getState().settings.syncBirthdaysToSchedule) {
        void useEventsStore.getState().syncBirthdayEvents(newStudents);
      }
    } catch {
      // 무시
    }
  },

  changeStatus: async (studentId, status, note) => {
    const { students } = get();
    const today = toLocalDateString();
    const newStudents = students.map((s) =>
      s.id === studentId
        ? {
            ...s,
            status,
            statusNote: note ?? '',
            statusChangedAt: today,
            isVacant: status !== 'active',
          }
        : s,
    );

    // 낙관적 업데이트: UI 먼저 반영
    set({ students: newStudents });

    try {
      await studentRepository.saveStudents(newStudents);

      // 가드 F — 재적 상태 변경도 사용자 의도 표식.
      await markRosterEdited();

      // 상태 변경 시 생일 동기화 반영
      const student = students.find((s) => s.id === studentId);
      if (student?.birthDate && useSettingsStore.getState().settings.syncBirthdaysToSchedule) {
        void useEventsStore.getState().syncBirthdayEvents(newStudents);
      }
    } catch (err) {
      // 저장 실패 시 롤백
      set({ students });
      console.error('[changeStatus] 저장 실패, 롤백:', err);
    }
  },

  /**
   * Phase 4 — 학생 수 변경 계획 수립 (저장 X).
   *
   * - 증가 → safe + 새 학생 포함된 newStudents
   * - 감소 → planStudentCountReduce 위임 (비활성 우선 제거, 활성 제거 시 confirm 필요)
   * - count 변화 없음 → null 반환
   */
  planStudentCountChange: (count) => {
    const clamped = Math.max(1, Math.min(50, count));
    const { students } = get();

    if (clamped === students.length) return null;

    if (clamped > students.length) {
      // 증가 — 항상 안전. 새 학번은 max+1부터.
      const maxNum = students.reduce((max, s) => Math.max(max, s.studentNumber ?? 0), 0);
      const additions: Student[] = [];
      for (let i = 0; i < clamped - students.length; i++) {
        additions.push({
          id: `s${Date.now()}_${i}`,
          name: '',
          studentNumber: maxNum + i + 1,
          phone: '',
          parentPhone: '',
          isVacant: false,
        });
      }
      return {
        kind: 'safe',
        newStudents: [...students, ...additions],
        removedInactive: [],
      };
    }

    // 감소 — 도메인 규칙으로 위임 (비활성 우선 제거 + 활성 제거 시 confirm 필요)
    return planStudentCountReduce(students, clamped);
  },

  commitStudentCountChange: async (newStudents) => {
    try {
      await studentRepository.saveStudents(newStudents);
      set({ students: newStudents });
      // 가드 F — 인원 변경도 사용자 의도 표식.
      await markRosterEdited();
    } catch {
      // 무시
    }
  },

  getStudent: (id) => (id !== null ? get().students.find((s) => s.id === id) : undefined),
  activeStudents: () => get().students.filter(isStudentActive),
}));
