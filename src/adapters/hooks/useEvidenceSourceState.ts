/**
 * 정리한 근거의 **원본이 지금 어떤 상태인가** — 저장소에서 직접 읽어 온다(계획 §5.3, AC-15).
 *
 * 왜 스토어(`useObservationStore`·`useStudentRecordsStore`)를 그냥 쓰지 않는가:
 * 두 스토어의 `load` 는 **읽기 실패를 삼키고** `loaded: true` 로 끝난다(각각 catch 블록).
 * 그래서 스토어만 보면 "파일을 못 읽었다"와 "원본이 없다"가 똑같이 빈 목록으로 보인다.
 * 그 상태로 화면을 그리면 멀쩡한 원본을 **'원본을 찾을 수 없습니다'** 라고 말한다 -
 * 계획 §5.3 이 명시적으로 금지한 오진이다. 그래서 여기서 저장소를 한 번 더 읽고
 * 실패는 실패로 남긴다.
 *
 * 이 훅이 하는 일은 셋이다.
 *  1. 이 학생의 원본을 `sourceId` 로 찾을 수 있게 모아 둔다(`lookup`).
 *  2. 읽기 상태를 `loading`/`error`/`ready` 로 구별하고 `retry` 를 준다.
 *  3. 반영 직전 재검증용 `readLatestSource` 를 만들어 준다 -
 *     스토어의 `applySourceFields` 가 이 함수를 주입받아 쓴다(ADR-086 결정 5).
 *
 * 범위는 **관찰기록·누가기록뿐**이다(계획 §5.3 마지막 문단). 평가·과제물·첨부는 비교하지 않는다 -
 * 원본이 파일이거나 점수라 "본문을 바꿔 준다"는 말이 성립하지 않는다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ObservationRecord } from '@domain/entities/Observation';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { EvidenceSourceType } from '@domain/entities/RecordEvidence';
import type { ComparableRecordFields } from '@domain/rules/evidenceSourceComparison';
import { isMirrorEligibleStudentRecord } from '@usecases/studentRecords/collectEvidenceCandidates';
import { observationRepository, studentRecordsRepository } from '@adapters/di/container';
import { useObservationStore } from '@adapters/stores/useObservationStore';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';

type RecordContext = 'homeroom' | 'teaching';

/** 비교·반영이 가능한 출처. 나머지 출처의 근거는 이 훅이 아예 다루지 않는다. */
export const COMPARABLE_SOURCE_TYPES: readonly EvidenceSourceType[] = [
  'observation',
  'studentRecord',
];

export function isComparableSourceType(t: EvidenceSourceType | undefined): boolean {
  return t !== undefined && COMPARABLE_SOURCE_TYPES.includes(t);
}

/** 지금 저장소에 있는 원본 한 장 - 비교 화면이 왼쪽에 그리는 값. */
export interface EvidenceSourceSnapshot {
  readonly sourceId: string;
  readonly sourceType: 'observation' | 'studentRecord';
  readonly content: string;
  readonly date?: string;
  readonly slots?: readonly string[];
  /**
   * 자동 거울 후보로 적격인가(출결 아님·본문 있음, AC-17).
   * 삭제 안내가 '원본은 남고 미분류에 다시 표시됩니다'를 **약속해도 되는지**가 여기에 달렸다 -
   * 적격이 아니면 지워도 거울로 돌아오지 않으므로 그 문구를 쓰면 거짓말이 된다.
   */
  readonly mirrorEligible: boolean;
  /** 본문이 비었다. 이 값으로 근거를 덮는 단추는 잠근다(계획 §5.3). */
  readonly blank: boolean;
  /** 담임 기록이 출결로 바뀌었다. 존재하므로 '없음'이 아니다. */
  readonly attendance: boolean;
}

/** 원본 한 건의 지금 상태. `error` 와 `missing` 을 절대 뭉개지 않는다. */
export type EvidenceSourceLookup =
  | { readonly state: 'loading' }
  /** 파일을 못 읽었다. **삭제됐다고 말하지 않는다.** */
  | { readonly state: 'error' }
  /** 읽기는 됐는데 그 id 가 없다. 삭제·동기화 지연·학년도 이동 중 무엇인지 단정하지 않는다. */
  | { readonly state: 'missing' }
  | { readonly state: 'found'; readonly source: EvidenceSourceSnapshot }
  /** 평가·과제물·첨부 등 이번 비교 범위 밖. 차이 표시도 반영도 하지 않는다. */
  | { readonly state: 'out-of-scope' };

export interface UseEvidenceSourceStateInput {
  /** 고른 학생. 없으면 아무것도 읽지 않는다. */
  readonly student: {
    readonly studentRef: string;
    /** 담임 학생 id. */
    readonly studentId?: string;
    /** 수업반 학생 번호 키. */
    readonly studentKey?: string;
  } | null;
  readonly context: RecordContext;
  readonly classId?: string;
}

export interface EvidenceSourceState {
  readonly status: 'loading' | 'error' | 'ready';
  /** `sourceId` → 지금 상태. 출처 종류를 함께 넘겨야 범위 밖을 구별한다. */
  readonly lookup: (
    sourceId: string | undefined,
    sourceType: EvidenceSourceType | undefined,
  ) => EvidenceSourceLookup;
  /** '다시 시도' - 저장소를 한 번 더 읽는다. */
  readonly retry: () => void;
  /**
   * 반영 직전 재검증용. 스토어의 `applySourceFields` 에 그대로 넘긴다.
   *
   * ★캐시를 쓰지 않고 **부를 때마다 저장소를 다시 읽는다.** 화면이 들고 있는 값으로 대조하면
   *   대화상자를 열어 둔 사이의 변경을 못 잡아 재검증 자체가 무의미해진다.
   * ★읽기 실패는 **던진다.** `null`(정말 없음)로 뭉개면 멀쩡한 원본을 '삭제됨'으로 처리한다.
   * ★이 학생 것이 아니면 `null` 이다. 소유권이 바뀐 원본으로 근거를 덮으면 남의 기록이 섞인다.
   */
  readonly readLatestSource: (
    sourceId: string,
    sourceType: EvidenceSourceType | undefined,
  ) => () => Promise<(ComparableRecordFields & { readonly studentRef: string }) | null>;
}

/** 관찰기록 한 장 → 비교용 스냅샷. 관찰에는 출결 개념이 없다. */
function snapshotOfObservation(o: ObservationRecord): EvidenceSourceSnapshot {
  const blank = o.content.trim().length === 0;
  return {
    sourceId: o.id,
    sourceType: 'observation',
    content: o.content,
    ...(o.date ? { date: o.date } : {}),
    ...(o.slots && o.slots.length > 0 ? { slots: [...o.slots] } : {}),
    mirrorEligible: !blank,
    blank,
    attendance: false,
  };
}

/** 누가기록 한 장 → 비교용 스냅샷. 적격 판정은 후보 목록과 **같은 함수**를 쓴다(건수와 화면이 어긋나지 않게). */
function snapshotOfStudentRecord(r: StudentRecord): EvidenceSourceSnapshot {
  return {
    sourceId: r.id,
    sourceType: 'studentRecord',
    content: r.content,
    ...(r.date ? { date: r.date } : {}),
    ...(r.slots && r.slots.length > 0 ? { slots: [...r.slots] } : {}),
    mirrorEligible: isMirrorEligibleStudentRecord(r),
    blank: r.content.trim().length === 0,
    attendance: r.category === 'attendance',
  };
}

/**
 * 저장소에서 이 학생의 원본만 골라 읽는다. **학생 경계를 여기서 자른다** -
 * 전부 읽어 두고 화면에서 거르면 남의 기록이 한 번은 화면 메모리에 올라온다.
 */
async function readOwnSources(
  context: RecordContext,
  student: NonNullable<UseEvidenceSourceStateInput['student']>,
  classId: string | undefined,
): Promise<Map<string, EvidenceSourceSnapshot>> {
  const map = new Map<string, EvidenceSourceSnapshot>();
  if (context === 'teaching') {
    if (!student.studentKey || !classId) return map;
    const data = await observationRepository.getObservations();
    for (const o of data?.records ?? []) {
      if (o.studentId !== student.studentKey || o.classId !== classId) continue;
      map.set(o.id, snapshotOfObservation(o));
    }
    return map;
  }
  if (!student.studentId) return map;
  const data = await studentRecordsRepository.getRecords();
  for (const r of data?.records ?? []) {
    if (r.studentId !== student.studentId) continue;
    map.set(r.id, snapshotOfStudentRecord(r));
  }
  return map;
}

const LOADING: EvidenceSourceLookup = { state: 'loading' };
const ERROR: EvidenceSourceLookup = { state: 'error' };
const MISSING: EvidenceSourceLookup = { state: 'missing' };
const OUT_OF_SCOPE: EvidenceSourceLookup = { state: 'out-of-scope' };

export function useEvidenceSourceState({
  student,
  context,
  classId,
}: UseEvidenceSourceStateInput): EvidenceSourceState {
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [sources, setSources] = useState<ReadonlyMap<string, EvidenceSourceSnapshot>>(new Map());
  const [attempt, setAttempt] = useState(0);
  /**
   * 진행 중인 읽기의 순번. 늦게 끝난 옛 읽기가 새 결과를 덮지 않게 한다 -
   * 학생을 빠르게 바꾸면 앞 학생의 원본이 뒤 학생 화면에 붙는다.
   */
  const seq = useRef(0);

  /**
   * 원본이 저장된 뒤 다시 읽게 하는 신호. 스토어의 목록이 바뀌었다는 것은 누군가 저장했거나
   * 동기화가 갈아 끼웠다는 뜻이다. 값 자체를 쓰지는 않는다(정본은 항상 파일이다).
   */
  const observationRecords = useObservationStore((s) => s.records);
  const studentRecordRecords = useStudentRecordsStore((s) => s.records);
  const changeSignal = context === 'teaching' ? observationRecords : studentRecordRecords;

  const studentRef = student?.studentRef ?? null;
  const studentId = student?.studentId;
  const studentKey = student?.studentKey;

  useEffect(() => {
    if (studentRef === null) {
      setSources(new Map());
      setStatus('ready');
      return;
    }
    const mine = (seq.current += 1);
    setStatus('loading');
    void readOwnSources(
      context,
      {
        studentRef,
        ...(studentId !== undefined ? { studentId } : {}),
        ...(studentKey !== undefined ? { studentKey } : {}),
      },
      classId,
    )
      .then((map) => {
        if (seq.current !== mine) return;
        setSources(map);
        setStatus('ready');
      })
      .catch(() => {
        if (seq.current !== mine) return;
        // 실패에는 빈 목록을 남기지 않는다. 옛 값을 그대로 두고 상태만 error 로 말한다.
        setStatus('error');
      });
  }, [studentRef, studentId, studentKey, context, classId, attempt, changeSignal]);

  const lookup = useCallback(
    (
      sourceId: string | undefined,
      sourceType: EvidenceSourceType | undefined,
    ): EvidenceSourceLookup => {
      if (sourceId === undefined || !isComparableSourceType(sourceType)) return OUT_OF_SCOPE;
      if (status === 'loading') return LOADING;
      if (status === 'error') return ERROR;
      const source = sources.get(sourceId);
      // 읽기가 성공한 뒤에만 '없음'이라고 말한다. 실패는 위에서 이미 걸렀다.
      if (!source) return MISSING;
      // 출처 종류가 어긋나면 같은 id 라도 그 원본이 아니다. 임의로 잇지 않는다(ADR-086 결정 3과 같은 태도).
      if (source.sourceType !== sourceType) return MISSING;
      return { state: 'found', source };
    },
    [status, sources],
  );

  const readLatestSource = useCallback(
    (sourceId: string, sourceType: EvidenceSourceType | undefined) =>
      async (): Promise<(ComparableRecordFields & { readonly studentRef: string }) | null> => {
        if (studentRef === null || !isComparableSourceType(sourceType)) return null;
        // 실패하면 그대로 던진다 - catch 하지 않는 것이 이 함수의 계약이다.
        const map = await readOwnSources(
          context,
          {
            studentRef,
            ...(studentId !== undefined ? { studentId } : {}),
            ...(studentKey !== undefined ? { studentKey } : {}),
          },
          classId,
        );
        const source = map.get(sourceId);
        if (!source || source.sourceType !== sourceType) return null;
        return {
          content: source.content,
          ...(source.date !== undefined ? { date: source.date } : {}),
          ...(source.slots !== undefined ? { slots: source.slots } : {}),
          studentRef,
        };
      },
    [studentRef, studentId, studentKey, context, classId],
  );

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return useMemo(
    () => ({ status, lookup, retry, readLatestSource }),
    [status, lookup, retry, readLatestSource],
  );
}
