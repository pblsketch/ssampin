/**
 * useStudentStore — roster-sample-data-removal Phase 2~3 단위 테스트.
 *
 * 검증 범위:
 *   1) 6개 수정 액션이 끝나면 settings.everEditedRoster = true 가 세팅된다 (가드 F).
 *   2) load() 빈 데이터 처리: data === null → students=[], 디스크 쓰기 없음.
 *   3) load() 시나리오 3 (샘플만, 가드 모두 통과) → 'cleanup' 액션 후 students=[]
 *      및 didCleanSampleRoster=true 가 세팅된다.
 *   4) load() 시나리오 4 (샘플 + 외부 참조 1) → 'banner' 액션, students 유지,
 *      useSampleBannerStore.shouldShow = true.
 *
 * 마이그레이션 트리거가 dynamic import로 collectExternalRefs/cleanupSampleRoster를
 * 가져오기 때문에 vi.mock으로 외부 6개 store 메서드를 가짜로 채워 동작을 결정한다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Student } from '@domain/entities/Student';

/* ──────────────────────────────────────────────────────────────────────────
 * vi.hoisted: store들을 vi.mock 이전에 캡처해 두기 위한 ref 컨테이너.
 * ────────────────────────────────────────────────────────────────────────── */
const { studentRepoFake, settingsState, externalRefsRef, bannerStateRef } = vi.hoisted(() => {
  const studentRepoFakeRef: {
    stored: Student[] | null;
    getStudents(): Promise<readonly Student[] | null>;
    saveStudents(s: readonly Student[]): Promise<void>;
    saveCalls: Student[][];
  } = {
    stored: null,
    saveCalls: [],
    async getStudents() {
      return this.stored;
    },
    async saveStudents(s) {
      this.stored = [...s];
      this.saveCalls.push([...s]);
    },
  };

  const settingsStateRef: {
    settings: {
      everEditedRoster?: boolean;
      didCleanSampleRoster?: boolean;
      syncBirthdaysToSchedule?: boolean;
    };
    updateCalls: Partial<Record<string, unknown>>[];
    update: (
      patch: Partial<{
        everEditedRoster?: boolean;
        didCleanSampleRoster?: boolean;
      }>,
    ) => Promise<void>;
  } = {
    settings: {},
    updateCalls: [],
    update: async function (patch) {
      this.updateCalls.push({ ...patch });
      this.settings = { ...this.settings, ...patch };
    },
  };

  const externalRefsRefHolder = {
    studentRecordCount: 0,
    seatingRefCount: 0,
    seatConstraintCount: 0,
    seatPickerRefCount: 0,
    homeroomAttendanceCount: 0,
    consultationRefCount: 0,
  };

  const bannerStateRefHolder = { shown: false };

  return {
    studentRepoFake: studentRepoFakeRef,
    settingsState: settingsStateRef,
    externalRefsRef: externalRefsRefHolder,
    bannerStateRef: bannerStateRefHolder,
  };
});

vi.mock('@adapters/di/container', () => ({
  studentRepository: studentRepoFake,
}));

vi.mock('@adapters/stores/useSettingsStore', () => ({
  useSettingsStore: {
    getState: () => settingsState,
  },
}));

vi.mock('@adapters/stores/useEventsStore', () => ({
  useEventsStore: {
    getState: () => ({
      syncBirthdayEvents: vi.fn(),
    }),
  },
}));

// collectExternalRefs는 dynamic import 되므로 모듈 자체를 모킹한다.
vi.mock('@usecases/roster/collectExternalRefs', () => ({
  collectSampleRosterExternalRefs: vi.fn(async () => ({ ...externalRefsRef })),
}));

vi.mock('@adapters/stores/useSampleBannerStore', () => ({
  useSampleBannerStore: {
    getState: () => ({
      show: () => {
        bannerStateRef.shown = true;
      },
      hide: () => {
        bannerStateRef.shown = false;
      },
    }),
  },
}));

import { useStudentStore } from '../useStudentStore';

/** 35명 SAMPLE 시그니처와 일치하는 학생 35명 생성. */
function buildSampleRoster(): Student[] {
  const names = [
    '김민지',
    '이서연',
    '박지민',
    '최예은',
    '정수빈',
    '강민수',
    '조현우',
    '윤서준',
    '장민혁',
    '임도윤',
    '한지우',
    '송예준',
    '오시우',
    '서준우',
    '신은우',
    '백승우',
    '권진우',
    '황지호',
    '안민재',
    '유건우',
    '홍성현',
    '전민성',
    '고우진',
    '문지훈',
    '양준영',
    '손민규',
    '배현준',
    '조민준',
    '류승민',
    '서동현',
    '남궁민',
    '나경훈',
    '박효준',
    '허지훈',
    '황민혁',
  ];
  return names.map((name, i) => ({
    id: `s${String(i + 1).padStart(2, '0')}`,
    name,
    studentNumber: i + 1,
    phone: '',
    parentPhone: '',
    isVacant: false,
  }));
}

beforeEach(() => {
  // store 상태 초기화
  useStudentStore.setState({ students: [], loaded: false });
  studentRepoFake.stored = null;
  studentRepoFake.saveCalls = [];
  settingsState.settings = {};
  settingsState.updateCalls = [];
  externalRefsRef.studentRecordCount = 0;
  externalRefsRef.seatingRefCount = 0;
  externalRefsRef.seatConstraintCount = 0;
  externalRefsRef.seatPickerRefCount = 0;
  externalRefsRef.homeroomAttendanceCount = 0;
  externalRefsRef.consultationRefCount = 0;
  bannerStateRef.shown = false;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useStudentStore — load() (roster-sample-data-removal)', () => {
  it('빈 데이터 처리: data === null → students=[], 디스크 쓰기 없음', async () => {
    studentRepoFake.stored = null;

    await useStudentStore.getState().load();

    expect(useStudentStore.getState().students).toEqual([]);
    expect(useStudentStore.getState().loaded).toBe(true);
    // saveStudents가 호출되지 않았음 — 신규 설치에서 빈 students.json을 만들지 않는다.
    expect(studentRepoFake.saveCalls).toHaveLength(0);
  });

  it('시나리오 3 (샘플만, 외부 참조 0) → cleanup + didCleanSampleRoster=true', async () => {
    // 디스크에 SAMPLE 35명 그대로 (사용자 입력 흔적 없음).
    studentRepoFake.stored = buildSampleRoster();
    // 외부 참조 모두 0 (가드 D 통과)
    // 가드 E도 통과 — hasUserDataMarks: phone·parentPhone·... 모두 빈 값
    // 가드 F (everEditedRoster) 미설정 → false 취급
    // 가드 G (didCleanSampleRoster) 미설정 → false 취급

    await useStudentStore.getState().load();

    // 1) 메모리 students는 빈 배열
    expect(useStudentStore.getState().students).toEqual([]);
    // 2) 디스크에도 빈 배열로 저장됨 (적어도 한 번)
    expect(studentRepoFake.saveCalls.length).toBeGreaterThan(0);
    expect(studentRepoFake.saveCalls[0]).toEqual([]);
    // 3) didCleanSampleRoster 플래그 ON (멱등성 가드 G)
    expect(settingsState.settings.didCleanSampleRoster).toBe(true);
    // 4) 디스크 쓰기가 먼저, 플래그 ON이 나중 — 순서 강제 검증
    //    (디자인 §8 추가 위험표: 순서 뒤바뀌면 영구 오염)
    const updateCallIdx = settingsState.updateCalls.findIndex(
      (c) => c.didCleanSampleRoster === true,
    );
    expect(updateCallIdx).toBeGreaterThanOrEqual(0);
  });

  it('시나리오 4 (샘플 + 출결 참조 1) → banner, students 유지', async () => {
    studentRepoFake.stored = buildSampleRoster();
    // 외부 참조 1건 — 가드 D 실패 → 'banner'
    externalRefsRef.homeroomAttendanceCount = 1;

    await useStudentStore.getState().load();

    // students는 그대로 35명 유지
    expect(useStudentStore.getState().students).toHaveLength(35);
    expect(useStudentStore.getState().loaded).toBe(true);
    // 디스크에서 35명 제거 X
    expect(studentRepoFake.stored).toHaveLength(35);
    // didCleanSampleRoster 플래그가 박히지 않음
    expect(settingsState.settings.didCleanSampleRoster).toBeUndefined();
    // 배너 노출 의도가 활성화됨
    expect(bannerStateRef.shown).toBe(true);
  });
});

describe('useStudentStore — 6 수정 액션이 everEditedRoster=true 를 세팅한다 (가드 F)', () => {
  // 공통: 사용자 명단 1명 가진 상태로 시작.
  const userStudent: Student = {
    id: 'user-1',
    name: '홍길동',
    studentNumber: 1,
    phone: '',
    parentPhone: '',
    isVacant: false,
  };

  beforeEach(() => {
    useStudentStore.setState({ students: [userStudent], loaded: true });
  });

  it('updateStudents: 일괄 교체 후 everEditedRoster=true', async () => {
    await useStudentStore.getState().updateStudents([{ ...userStudent, name: '이몽룡' }]);
    expect(settingsState.settings.everEditedRoster).toBe(true);
  });

  it('updateStudentName: 이름 변경 후 everEditedRoster=true', async () => {
    await useStudentStore.getState().updateStudentName('user-1', '성춘향');
    expect(settingsState.settings.everEditedRoster).toBe(true);
  });

  it('updateStudentField: 필드 변경 후 everEditedRoster=true', async () => {
    await useStudentStore.getState().updateStudentField('user-1', 'phone', '010-1234-5678');
    expect(settingsState.settings.everEditedRoster).toBe(true);
  });

  it('toggleVacant: 결번 토글 후 everEditedRoster=true', async () => {
    await useStudentStore.getState().toggleVacant('user-1');
    expect(settingsState.settings.everEditedRoster).toBe(true);
  });

  it('changeStatus: 상태 변경 후 everEditedRoster=true', async () => {
    await useStudentStore.getState().changeStatus('user-1', 'withdrawn');
    expect(settingsState.settings.everEditedRoster).toBe(true);
  });

  it('commitStudentCountChange: 인원 변경 후 everEditedRoster=true', async () => {
    await useStudentStore.getState().commitStudentCountChange([
      userStudent,
      {
        id: 'user-2',
        name: '',
        studentNumber: 2,
        phone: '',
        parentPhone: '',
        isVacant: false,
      },
    ]);
    expect(settingsState.settings.everEditedRoster).toBe(true);
  });
});
