import { create } from 'zustand';
import {
  coerceSchoolLevel,
  isAreaLimitVerified,
  neisByteLength,
  resolveAreaLimit,
  RECORD_AREA_LABELS,
  type RecordArea,
  type RecordDraft,
  type RecordDraftStatus,
  type SchoolLevel,
} from '@domain/entities/RecordDraft';
import { recordDraftsRepository } from '@adapters/di/container';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { detectProhibitedTerms } from '@domain/rules/prohibitedRecordTerms';
import { generateUUID } from '@infrastructure/utils/uuid';

/** (area + studentRef + subject) upsert 입력 — UI 직접 편집 / live-sync 수신 공통. */
export interface RecordDraftUpsertInput {
  area: RecordArea;
  /** 학생 신원 키(담임=Student.id / 수업반='tc:{classId}:{studentKey}'). */
  studentRef: string;
  classId?: string;
  studentKey?: string;
  studentId?: string;
  subject?: string;
  content: string;
  basisObservationIds?: readonly string[];
  groundingFlags?: readonly string[];
  status?: RecordDraftStatus;
  /**
   * 누가 쓰는가. 미지정이면 교사(화면 직접 편집)로 본다.
   *
   * ★확정(confirmed) 초안은 **AI 만** 못 덮는다. 교사는 자기 기록이므로 계속 고칠 수 있다.
   * 브릿지 core 는 이 잠금을 이미 갖고 있었지만(write.ts 'confirmed 잠금'), 앱이 켜져 있으면
   * 브릿지 쓰기가 loopback 으로 이 스토어를 타서 **잠금을 우회했다** — 앱이 꺼져 있으면
   * 막히고 켜져 있으면 뚫리는 상태였다. 잠금을 여기(단일 효과경계)로 올려 경로와 무관하게 막는다.
   */
  origin?: 'teacher' | 'bridge' | 'assist';
  /**
   * 학교급 — 영역별 바이트 한도 판정에 쓴다. **미지정이면 설정의 학교급을 읽는다**
   * (화면 경로와 같은 판정). 설정이 아직 로드되지 않았으면 한도로 막지 않는다 — 아래 참조.
   */
  level?: SchoolLevel | string;
}

/**
 * 바이트 한도를 넘겨 저장이 거부됐을 때 던진다.
 *
 * ★한도를 프롬프트로 지키게 하지 않는다 — 실측에서 교사 커스텀 지시 한 줄에 모델이 한도의
 * 4배(7,156B)를 창작으로 채웠다. 코드에서 자른다(ADR-072 결정 5).
 */
/** 확정된 초안을 AI 가 덮으려 할 때. 교사에게는 무슨 일이 막혔는지 한국어로 전한다. */
export class RecordDraftConfirmedError extends Error {
  constructor(readonly area: RecordArea) {
    super(
      `${RECORD_AREA_LABELS[area]}는 검토 완료된 초안입니다. AI 가 덮어쓰지 않습니다. ` +
        `다시 쓰려면 상태를 '작성 중'으로 되돌리세요.`,
    );
    this.name = 'RecordDraftConfirmedError';
  }
}

export class RecordDraftLimitError extends Error {
  constructor(
    readonly area: RecordArea,
    readonly byteLength: number,
    readonly limit: number,
  ) {
    super(
      `${RECORD_AREA_LABELS[area]} 한도를 넘었습니다 — ${byteLength.toLocaleString()}바이트 / ` +
        `${limit.toLocaleString()}바이트. 내용을 줄인 뒤 저장하세요.`,
    );
    this.name = 'RecordDraftLimitError';
  }
}

interface RecordDraftsState {
  records: readonly RecordDraft[];
  loaded: boolean;

  load: (force?: boolean) => Promise<void>;
  /** (area+studentRef+subject) 키로 upsert. 반환 = 저장된 draft id. */
  upsert: (input: RecordDraftUpsertInput) => Promise<string>;
  setStatus: (id: string, status: RecordDraftStatus) => Promise<void>;
  remove: (id: string) => Promise<void>;
  exists: (id: string) => boolean;

  // 파생 조회
  getByStudentRef: (studentRef: string) => readonly RecordDraft[];
  getDraft: (area: RecordArea, studentRef: string, subject?: string) => RecordDraft | undefined;
}

const subjectKey = (s?: string): string => s ?? '';

function matchKey(r: RecordDraft, area: RecordArea, studentRef: string, subject?: string): boolean {
  return (
    r.area === area && r.studentRef === studentRef && subjectKey(r.subject) === subjectKey(subject)
  );
}

export const useRecordDraftsStore = create<RecordDraftsState>((set, get) => {
  /** 변경된 records 를 메모리 반영 후 파일에 통째로 저장(repo whole-file API). */
  const persist = async (next: readonly RecordDraft[]): Promise<void> => {
    set({ records: next });
    await recordDraftsRepository.saveRecordDrafts({ records: next });
  };

  return {
    records: [],
    loaded: false,

    load: async (force = false) => {
      // force=true: 동기화 리로드용 — loaded를 유지한 채 데이터만 조용히 갱신
      if (get().loaded && !force) return;
      try {
        const data = await recordDraftsRepository.getRecordDrafts();
        set({ records: data?.records ?? [], loaded: true });
      } catch (err) {
        console.error('[RecordDraftsStore] load failed:', err);
        set({ loaded: true });
      }
    },

    upsert: async (input) => {
      // 통째로 저장하는 구조라 메모리가 파일을 반영해야 한다(미로드 상태에서 저장 시 기존 초안 유실 방지).
      await get().load();
      const now = Date.now();
      const byteLength = neisByteLength(input.content);
      // 한도 초과는 저장 전에 끊는다. 다만 초등처럼 한도 수치가 공식 확인되지 않은 영역은
      // 거부하지 않는다 — 확인 안 된 숫자로 교사 입력을 막으면 안 된다(isAreaLimitVerified).
      // ★기본값을 'high' 로 굳히면 안 된다. 브릿지 live-sync 는 level 을 넘기지 않는데,
      //   초등 자율·진로·행특은 고등 맵에 존재하고 limitVerified=true 라 "확인 안 된 숫자라
      //   막지 않기로 한" 한도가 확인된 한도로 승격돼 **전에는 되던 쓰기가 거부된다**(회귀).
      //   설정의 학교급을 읽어 화면 경로(RecordDraftView)와 같은 판정을 쓴다.
      const settings = useSettingsStore.getState();
      // 설정이 아직 로드되지 않았으면 기본값('middle')으로 판정하게 된다. 앱 시작 직후 브릿지
      // 쓰기가 들어오는 짧은 창에서 초등 교사의 정상 초안을 거부할 수 있으므로, level 을
      // 명시하지 않았고 설정도 미로드면 **막지 않는다**. 잘못 거부하는 쪽이 더 나쁘다.
      const levelKnown = typeof input.level === 'string' || settings.loaded;
      const level = coerceSchoolLevel(
        typeof input.level === 'string' ? input.level : settings.settings.schoolLevel,
      );
      if (levelKnown && isAreaLimitVerified(input.area, level)) {
        const limit = resolveAreaLimit(input.area, level);
        if (byteLength > limit) throw new RecordDraftLimitError(input.area, byteLength, limit);
      }
      // 기재 금지 항목 최종 확인 — NEIS 에 실제로 들어가는 것은 초안이므로 **여기가 마지막 문**이다.
      // ★막지 않고 경고만 한다(오너 결정 2026-08-25). 자동 판정은 오탐이 나고, 이 앱은 모든 초안에
      //   교사 최종 검토를 강제하므로(requiresTeacherReview) 판단을 사람에게 남긴다.
      // ★프롬프트로 시키지 않는 이유: 실측에서 금지 항목을 전부 열거하고 재강조해도 모델이
      //   세특 본문에 그대로 옮겨 적었다(2/2 → 보강 후에도 2/2 실패). 코드가 봐야 한다.
      // ★브릿지의 checkGrounding 은 이걸 못 잡는다 — 그건 "근거에 없는 말을 지어냈나"를 보는데,
      //   관찰기록에 '최우수상'이 실제로 있으면 근거가 확실하다며 통과시킨다(정반대로 동작).
      const prohibited = detectProhibitedTerms(input.content);
      const flags = [
        ...(input.groundingFlags ?? []),
        ...(prohibited.length > 0 ? ['prohibited_item'] : []),
      ];

      const existing = get().records.find((r) =>
        matchKey(r, input.area, input.studentRef, input.subject),
      );
      // ★확정 잠금 — 교사가 검토를 마친 법정기록을 AI 가 조용히 덮지 않는다.
      //   교사 본인(origin 미지정 또는 'teacher')은 계속 고칠 수 있다.
      if (existing?.status === 'confirmed' && input.origin && input.origin !== 'teacher') {
        throw new RecordDraftConfirmedError(input.area);
      }
      const base: RecordDraft = {
        id: existing?.id ?? generateUUID(),
        area: input.area,
        studentRef: input.studentRef,
        content: input.content,
        byteLength,
        basisObservationIds: input.basisObservationIds ? [...input.basisObservationIds] : [],
        requiresTeacherReview: true,
        status: input.status ?? existing?.status ?? 'draft',
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        ...(input.classId !== undefined ? { classId: input.classId } : {}),
        ...(input.studentKey !== undefined ? { studentKey: input.studentKey } : {}),
        ...(input.studentId !== undefined ? { studentId: input.studentId } : {}),
        ...(input.subject !== undefined ? { subject: input.subject } : {}),
        ...(flags.length > 0 ? { groundingFlags: flags } : {}),
      };
      const next = existing
        ? get().records.map((r) => (r.id === existing.id ? base : r))
        : [...get().records, base];
      await persist(next);
      return base.id;
    },

    setStatus: async (id, status) => {
      await get().load();
      const next = get().records.map((r) =>
        r.id === id ? { ...r, status, updatedAt: Date.now() } : r,
      );
      await persist(next);
    },

    remove: async (id) => {
      await get().load();
      await persist(get().records.filter((r) => r.id !== id));
    },

    exists: (id) => get().records.some((r) => r.id === id),

    getByStudentRef: (studentRef) => get().records.filter((r) => r.studentRef === studentRef),

    getDraft: (area, studentRef, subject) =>
      get().records.find((r) => matchKey(r, area, studentRef, subject)),
  };
});
