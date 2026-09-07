/**
 * 근거 후보 모으기 — 한 학생의 **아직 근거로 넣지 않은 원본 기록**(관찰·누가기록·수행평가·성적 서술·첨부·과제 제출)을
 * 한 곳에서 센다(설계서 record-evidence-board-v2 §4-1, ADR-085 보강 2 R1).
 *
 * 예전에는 이 계산이 가져오기 서랍(`RecordEvidenceImportDrawer`) 안에만 있어 보드도 초안 행도 "아직 안 넣은 기록"을
 * 몰랐다. 이제 보드의 거울 카드·초안 행의 미분류 수·오른쪽 패널이 **같은 함수의 같은 수**를 본다.
 *
 * 순수 함수 — 스토어·IO·React 를 모른다. 필요한 원본 목록을 전부 인자로 받는다.
 *  - 변환은 `evidenceImport.ts` 의 함수를 그대로 쓴다(점수·석차 숫자는 거기서 이미 빠진다).
 *  - ★다른 학생 것은 애초에 만들지 않는다 — 학생 경계는 여기서 자른다.
 *  - ★이미 근거로 저장된 `sourceId` 는 뺀다(`storedSourceIds`).
 *  - 정렬: 날짜 내림차순, 날짜 없는 것은 뒤로. 같은 날짜면 출처·sourceId 순으로 결정론적.
 */
import type { EvidenceSourceType } from '@domain/entities/RecordEvidence';
import type { ObservationRecord } from '@domain/entities/Observation';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { Rubric, RubricGrading } from '@domain/entities/Rubric';
import type {
  AssessmentPlanItem,
  PerformanceAssessmentResult,
  SemesterGradeResult,
} from '@domain/entities/GradeAnalysis';
import type { ObservationAttachment } from '@domain/entities/ObservationAttachment';
import type { Assignment, Submission } from '@domain/entities/Assignment';
import {
  attachmentToEvidence,
  gradeToEvidence,
  rubricGradingToEvidence,
  semesterGradeToEvidence,
  submissionToEvidence,
  type ImportedEvidence,
} from '@usecases/studentRecords/evidenceImport';

/** 어느 원본에서 왔는지(가져오기 메뉴의 출처와 같은 갈래). */
export type EvidenceCandidateSource =
  | 'observation'
  | 'studentRecord'
  | 'rubric'
  | 'grade'
  | 'attachment'
  | 'submission';

/** 컨텍스트별 출처 — 담임은 누가기록·과제 제출, 교과는 관찰·수행평가·성적 서술·첨부·과제 제출. */
export const EVIDENCE_CANDIDATE_SOURCES: Readonly<
  Record<'homeroom' | 'teaching', readonly EvidenceCandidateSource[]>
> = {
  homeroom: ['studentRecord', 'submission'],
  teaching: ['observation', 'rubric', 'grade', 'attachment', 'submission'],
};

export interface EvidenceCandidate {
  readonly source: EvidenceCandidateSource;
  readonly sourceId: string;
  readonly sourceType: EvidenceSourceType;
  /** 화면 칩에 쓰는 짧은 이름(태그·평가 이름·과제 이름 등). */
  readonly label: string;
  readonly content: string;
  readonly date?: string;
  readonly slots?: readonly string[];
}

/** 후보를 셀 학생 한 명. 담임은 `studentId`, 수업반은 `studentKey` 로 원본과 잇는다. */
export interface EvidenceCandidateStudent {
  readonly studentRef: string;
  readonly number: number;
  readonly studentId?: string;
  readonly studentKey?: string;
}

/** 과제 수합 화면이 들고 있는 제출 목록의 한 줄 — 여기서 필요한 것만. */
export interface EvidenceCandidateSubmissionRow {
  readonly studentId: string;
  readonly studentNumber: number;
  readonly submission?: Submission;
}

export interface CollectEvidenceCandidatesInput {
  readonly student: EvidenceCandidateStudent;
  readonly context: 'homeroom' | 'teaching';
  readonly classId?: string;
  readonly observations: readonly ObservationRecord[];
  readonly studentRecords: readonly StudentRecord[];
  readonly rubrics: readonly Rubric[];
  readonly gradings: readonly RubricGrading[];
  readonly plans: readonly AssessmentPlanItem[];
  readonly performanceResults: readonly PerformanceAssessmentResult[];
  readonly semesterResults: readonly SemesterGradeResult[];
  readonly attachments: readonly ObservationAttachment[];
  readonly submissions: readonly EvidenceCandidateSubmissionRow[];
  readonly assignments: readonly Assignment[];
  /** 이 학생 근거로 이미 저장된 `sourceId` 들 — 후보에서 뺀다. */
  readonly storedSourceIds: ReadonlySet<string>;
}

function candidate(
  source: EvidenceCandidateSource,
  label: string,
  ev: ImportedEvidence,
): EvidenceCandidate {
  return {
    source,
    sourceId: ev.sourceId,
    sourceType: ev.sourceType,
    label,
    content: ev.content,
    ...(ev.date !== undefined ? { date: ev.date } : {}),
    ...(ev.slots !== undefined && ev.slots.length > 0 ? { slots: [...ev.slots] } : {}),
  };
}

/**
 * 담임 기록이 **자동 거울 후보로 적격**인가(계획 §5.3, AC-17).
 *
 * 제외하는 것:
 * - **출결**: 지각·결석은 생기부 근거가 아니다. 보드에 쌓이면 진짜 근거가 묻힌다.
 * - **공백 본문**: 담임은 분류만 저장하는 업무가 있어 본문 없는 기록이 정상적으로 존재한다.
 *   그것까지 거울로 만들면 빈 카드가 화면을 채운다.
 *
 * ★슬롯 미선택은 제외 조건이 **아니다**. 장면을 안 골랐다고 근거가 아닌 것은 아니다.
 * ★이 함수는 후보 목록과 미분류 건수 **양쪽이 같이** 쓴다. 한쪽만 걸러 두면 "3건"이라 해 놓고
 *   열면 1건인 화면이 된다.
 * ★이미 저장된 근거나 기존 원본을 지우지 않는다. 여기서 거르는 것은 앞으로의 후보뿐이다.
 */
export function isMirrorEligibleStudentRecord(r: {
  readonly category: string;
  readonly content: string;
}): boolean {
  if (r.category === 'attendance') return false;
  if (r.content.trim().length === 0) return false;
  return true;
}

/**
 * 한 출처의 후보 — 원본 순서 그대로, 저장 여부를 보지 않는다.
 * 가져오기 서랍이 "추가됨" 표시를 위해 저장된 것까지 보여 주므로 이 단계를 따로 둔다.
 */
export function listEvidenceCandidates(
  input: Omit<CollectEvidenceCandidatesInput, 'storedSourceIds'>,
  source: EvidenceCandidateSource,
): EvidenceCandidate[] {
  const { student: st, classId } = input;
  switch (source) {
    case 'studentRecord': {
      if (!st.studentId) return [];
      return input.studentRecords
        .filter((r) => r.studentId === st.studentId && isMirrorEligibleStudentRecord(r))
        .map((r) =>
          candidate('studentRecord', r.subcategory || r.category, {
            content: r.content,
            sourceType: 'studentRecord',
            sourceId: r.id,
            ...(r.date ? { date: r.date } : {}),
            // 원본 슬롯을 이어받는다 — 창고에서 사라지면 AI 가 근거의 갈래를 잃는다.
            ...(r.slots && r.slots.length > 0 ? { slots: [...r.slots] } : {}),
          }),
        );
    }
    case 'observation': {
      if (!st.studentKey || !classId) return [];
      return input.observations
        .filter((o) => o.studentId === st.studentKey && o.classId === classId)
        .map((o) =>
          candidate('observation', o.tags.join(', ') || '관찰', {
            content: o.content,
            sourceType: 'observation',
            sourceId: o.id,
            ...(o.date ? { date: o.date } : {}),
            ...(o.slots && o.slots.length > 0 ? { slots: [...o.slots] } : {}),
          }),
        );
    }
    case 'rubric': {
      if (!st.studentKey || !classId) return [];
      return input.gradings
        .filter((g) => g.studentId === st.studentKey && g.classId === classId)
        .map((g) => {
          const rubric = input.rubrics.find((r) => r.id === g.rubricId);
          return candidate(
            'rubric',
            rubric?.title ?? '수행평가',
            rubricGradingToEvidence(g, rubric),
          );
        });
    }
    case 'grade': {
      if (!st.studentKey) return [];
      // 수행평가 결과의 교사 서술(점수 제외)
      const perf = input.performanceResults
        .filter((p) => p.studentKey === st.studentKey && (p.evidenceNote?.trim() || p.memo?.trim()))
        .map((p) => {
          const plan = input.plans.find((pl) => pl.id === p.assessmentId);
          return candidate('grade', plan?.subject ?? '평가', gradeToEvidence(p, plan));
        });
      // 학기 성적의 성취도(A~E) — 점수·석차 숫자는 제외(변환이 보장)
      const levels = input.semesterResults
        .filter(
          (r) => r.studentKey === st.studentKey && (!classId || r.teachingClassId === classId),
        )
        .map((r) => semesterGradeToEvidence(r))
        .filter((ev): ev is ImportedEvidence => ev !== null)
        .map((ev) => candidate('grade', '성취도', ev));
      return [...perf, ...levels];
    }
    case 'attachment': {
      if (!st.studentKey || !classId) return [];
      const obsIds = new Set(
        input.observations
          .filter((o) => o.studentId === st.studentKey && o.classId === classId)
          .map((o) => o.id),
      );
      return input.attachments
        .filter((a) => obsIds.has(a.observationId))
        .map((a) =>
          candidate(
            'attachment',
            a.source === 'student' ? '학생 제출물' : '교사 자료',
            attachmentToEvidence(a),
          ),
        );
    }
    case 'submission': {
      // 과제 수합으로 불러온 in-memory 제출물에서 매칭 — 담임은 학생 id, 수업반은 번호로.
      const out: EvidenceCandidate[] = [];
      for (const sd of input.submissions) {
        const sub = sd.submission;
        if (!sub) continue;
        const mine = st.studentId ? sd.studentId === st.studentId : sd.studentNumber === st.number;
        if (!mine) continue;
        const assignment = input.assignments.find((x) => x.id === sub.assignmentId);
        out.push(
          candidate(
            'submission',
            assignment?.title ?? '과제',
            submissionToEvidence(sub, assignment),
          ),
        );
      }
      return out;
    }
  }
}

/** 날짜 내림차순, 날짜 없는 것은 뒤로. 같은 날짜면 출처·sourceId 순 — 렌더마다 순서가 흔들리지 않게. */
export function sortEvidenceCandidates(items: readonly EvidenceCandidate[]): EvidenceCandidate[] {
  return [...items].sort((a, b) => {
    if (a.date !== b.date) {
      if (a.date === undefined) return 1;
      if (b.date === undefined) return -1;
      return b.date.localeCompare(a.date);
    }
    if (a.source !== b.source) return a.source.localeCompare(b.source);
    return a.sourceId.localeCompare(b.sourceId);
  });
}

/**
 * 이 학생의 **아직 근거로 넣지 않은** 원본 기록 전부 — 컨텍스트의 모든 출처를 합쳐 날짜순으로.
 * 보드의 거울 카드와 초안 행·오른쪽 패널의 미분류 수가 이 결과를 본다.
 */
export function collectEvidenceCandidates(
  input: CollectEvidenceCandidatesInput,
): EvidenceCandidate[] {
  const all = EVIDENCE_CANDIDATE_SOURCES[input.context].flatMap((source) =>
    listEvidenceCandidates(input, source),
  );
  return sortEvidenceCandidates(all.filter((c) => !input.storedSourceIds.has(c.sourceId)));
}
