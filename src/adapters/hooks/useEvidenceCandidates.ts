/**
 * 학생의 **아직 근거로 넣지 않은 원본 기록**(거울 카드 후보) — 스토어를 `collectEvidenceCandidates` 에 물려 준다.
 *
 * 계산은 유스케이스(순수)가 하고, 여기서는 (1) 컨텍스트에 필요한 원본 스토어를 1회 로드하고 (2) 학생·원본·저장된 근거가
 * 바뀔 때만 다시 센다(`useMemo`). 보드(목록)·초안 행·오른쪽 패널(수)이 같은 계산을 본다(설계서 §4-1).
 *
 *  - `useEvidenceCandidates` — 학생 한 명의 후보 목록(보드·오른쪽 패널).
 *  - `useEvidenceCandidateCounts` — 여러 학생의 후보 수(초안 행의 [미분류 N건]).
 */
import { useEffect, useMemo } from 'react';
import { useRecordEvidenceStore } from '@adapters/stores/useRecordEvidenceStore';
import { useObservationStore } from '@adapters/stores/useObservationStore';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useRubricStore } from '@adapters/stores/useRubricStore';
import { useGradeAnalysisStore } from '@adapters/stores/useGradeAnalysisStore';
import { useObservationAttachmentStore } from '@adapters/stores/useObservationAttachmentStore';
import { useAssignmentStore } from '@adapters/stores/useAssignmentStore';
import {
  collectEvidenceCandidates,
  type CollectEvidenceCandidatesInput,
  type EvidenceCandidate,
  type EvidenceCandidateStudent,
} from '@usecases/studentRecords/collectEvidenceCandidates';

type RecordContext = 'homeroom' | 'teaching';

const EMPTY: readonly EvidenceCandidate[] = [];

/** 원본 스토어 구독 + 컨텍스트에 필요한 것만 1회 로드. 두 훅이 같이 쓴다. */
function useEvidenceSources(
  context: RecordContext,
  classId: string | undefined,
): Omit<CollectEvidenceCandidatesInput, 'student' | 'storedSourceIds'> {
  const observations = useObservationStore((s) => s.records);
  const loadObservations = useObservationStore((s) => s.load);
  const studentRecords = useStudentRecordsStore((s) => s.records);
  const loadStudentRecords = useStudentRecordsStore((s) => s.load);
  const rubrics = useRubricStore((s) => s.rubrics);
  const gradings = useRubricStore((s) => s.gradings);
  const loadRubrics = useRubricStore((s) => s.load);
  const plans = useGradeAnalysisStore((s) => s.plans);
  const performanceResults = useGradeAnalysisStore((s) => s.performanceResults);
  const semesterResults = useGradeAnalysisStore((s) => s.semesterResults);
  const loadGrades = useGradeAnalysisStore((s) => s.load);
  const attachments = useObservationAttachmentStore((s) => s.attachments);
  const loadAttachments = useObservationAttachmentStore((s) => s.load);
  const submissions = useAssignmentStore((s) => s.submissions);
  const assignments = useAssignmentStore((s) => s.assignments);

  // 컨텍스트에 필요한 원본만 1회 로드(가져오기 서랍이 하던 것과 같다). 스토어가 이미 로드됐으면 각자 알아서 건너뛴다.
  useEffect(() => {
    if (context === 'teaching') {
      void loadObservations();
      void loadRubrics();
      void loadGrades();
      void loadAttachments();
    } else {
      void loadStudentRecords();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context]);

  return useMemo(
    () => ({
      context,
      ...(classId !== undefined ? { classId } : {}),
      observations,
      studentRecords,
      rubrics,
      gradings,
      plans,
      performanceResults,
      semesterResults,
      attachments,
      submissions,
      assignments,
    }),
    [
      context,
      classId,
      observations,
      studentRecords,
      rubrics,
      gradings,
      plans,
      performanceResults,
      semesterResults,
      attachments,
      submissions,
      assignments,
    ],
  );
}

/** 이 학생 근거로 이미 저장된 sourceId 집합. */
function storedSourceIdsOf(
  records: readonly { studentRef: string; sourceId?: string }[],
  studentRef: string,
): Set<string> {
  return new Set(
    records
      .filter((r) => r.studentRef === studentRef)
      .map((r) => r.sourceId)
      .filter((x): x is string => typeof x === 'string' && x.length > 0),
  );
}

export interface UseEvidenceCandidatesInput {
  /** 없으면(학생 미선택) 빈 목록. */
  readonly student: EvidenceCandidateStudent | null;
  readonly context: RecordContext;
  readonly classId?: string;
}

export function useEvidenceCandidates({
  student,
  context,
  classId,
}: UseEvidenceCandidatesInput): readonly EvidenceCandidate[] {
  const records = useRecordEvidenceStore((s) => s.records);
  const sources = useEvidenceSources(context, classId);
  return useMemo(() => {
    if (student === null) return EMPTY;
    return collectEvidenceCandidates({
      ...sources,
      student,
      storedSourceIds: storedSourceIdsOf(records, student.studentRef),
    });
  }, [student, sources, records]);
}

export interface UseEvidenceCandidateCountsInput {
  readonly students: readonly EvidenceCandidateStudent[];
  readonly context: RecordContext;
  readonly classId?: string;
}

/** 학생별 후보 수(`studentRef` → 건수). 초안 행의 [미분류 N건]이 저장 미분류에 더해 쓴다. */
export function useEvidenceCandidateCounts({
  students,
  context,
  classId,
}: UseEvidenceCandidateCountsInput): ReadonlyMap<string, number> {
  const records = useRecordEvidenceStore((s) => s.records);
  const sources = useEvidenceSources(context, classId);
  return useMemo(() => {
    const m = new Map<string, number>();
    for (const student of students) {
      m.set(
        student.studentRef,
        collectEvidenceCandidates({
          ...sources,
          student,
          storedSourceIds: storedSourceIdsOf(records, student.studentRef),
        }).length,
      );
    }
    return m;
  }, [students, sources, records]);
}
