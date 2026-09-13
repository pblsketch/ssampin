import { settleRecordMapRun } from '@usecases/recordMap/recordMapRunSupport';
import { RegenerateRecordMapTopic } from '@usecases/recordMap/RegenerateRecordMapTopic';
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { FocusTrap } from 'focus-trap-react';
import type { RecordArea } from '@domain/entities/RecordDraft';
import { RECORD_AREA_LABELS } from '@domain/entities/RecordDraft';
import { evidenceInArea } from '@domain/entities/RecordEvidence';
import type {
  RecordMapProposalData,
  RecordMapReviewPace,
  RecordMapRunStatus,
  RecordMapScaffoldPolicy,
  RecordMapScaffoldSnapshot,
  RecordMapStudentContext,
  RecordMapReviewStatus,
  RecordMapTargetMode,
} from '@domain/entities/RecordMapProposal';
import type { RecordMapApplication } from '@domain/entities/RecordMapApplication';
import { recordMapSourceFingerprint } from '@domain/rules/recordMapApplication';
import { academicTermForDate } from '@domain/rules/academicCalendar';
import type { KeywordGroup } from '@domain/privacy/types';
import type { OwnAiProviderId } from '@domain/entities/OwnAiProvider';
import { CreateRecordMapRun } from '@usecases/recordMap/CreateRecordMapRun';
import { GenerateRecordMapStudent } from '@usecases/recordMap/GenerateRecordMapStudent';
import type {
  RecordMapAiPort,
  RecordMapStudentSourcePort,
} from '@usecases/recordMap/RecordMapAiPort';
import { RecoverRecordMapRuns } from '@usecases/recordMap/RecoverRecordMapRuns';
import { ResumeRecordMapRun } from '@usecases/recordMap/ResumeRecordMapRun';
import { RunRecordMapBatch } from '@usecases/recordMap/RunRecordMapBatch';
import { StopRecordMapRun } from '@usecases/recordMap/StopRecordMapRun';
import { RequeueRecordMapStudent } from '@usecases/recordMap/RequeueRecordMapStudent';
import {
  ApplyRecordMapProposal,
  type ApplyRecordMapProposalResult,
} from '@usecases/recordMap/ApplyRecordMapProposal';
import { ApplyReviewedRecordMapBatch } from '@usecases/recordMap/ApplyReviewedRecordMapBatch';
import { RecoverRecordMapApplications } from '@usecases/recordMap/RecoverRecordMapApplications';
import { UndoRecordMapApplication } from '@usecases/recordMap/UndoRecordMapApplication';
import {
  EMPTY_RECORD_MAP_PROPOSAL_DATA,
  replaceRecordMapProposal,
} from '@usecases/recordMap/recordMapRunSupport';
import { recordMapApplicationPort, recordMapProposalRepository } from '@adapters/di/container';
import { askOnce, runApi } from './ownAiRun';
import { useRecordEvidenceStore } from '@adapters/stores/useRecordEvidenceStore';
import { useInquiryThreadStore } from '@adapters/stores/useInquiryThreadStore';
import { useRecordMapRunStore } from '@adapters/stores/useRecordMapRunStore';
import type { EvidenceStudentRow } from './RecordEvidenceBoard';
import {
  RecordMapProposalReview,
  recordMapProposalReviewBlockers,
} from './RecordMapProposalReview';

export interface RecordMapBatchPanelProps {
  readonly students: readonly EvidenceStudentRow[];
  readonly currentStudentRef: string | null;
  readonly classId?: string;
  readonly className?: string;
  readonly classSubject?: string;
  readonly areas: readonly RecordArea[];
  readonly initialArea: RecordArea | null;
  readonly provider: OwnAiProviderId;
  readonly roster: readonly KeywordGroup[];
  readonly scaffoldConfigurationForArea: (area: RecordArea) => {
    readonly candidates: readonly RecordMapScaffoldSnapshot[];
    readonly defaultScaffold: RecordMapScaffoldSnapshot;
  };
  onClose: () => void;
}

let recoveryCheckedThisSession = false;
const activeControllers = new Map<string, AbortController>();

function createRunId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `record-map-${Date.now()}-${Math.random()}`;
}

function sourceMatchesContext(
  context: RecordMapStudentContext,
  item: { readonly studentRef: string; readonly classId?: string },
): boolean {
  return (
    item.studentRef === context.studentRef &&
    (context.classId === undefined || item.classId === context.classId)
  );
}

const RECORD_MAP_STATUS_LABELS: Readonly<Record<RecordMapRunStatus, string>> = {
  queued: '대기',
  generating: '제안 만드는 중',
  generated: '확인 필요',
  failed: '다시 시도',
  skipped: '보낼 근거 없음',
  cancelled: '중단됨',
};

export function recordMapFailureLabel(message: string | undefined): string {
  const value = (message ?? '').toLocaleLowerCase('en');
  if (value.includes('empty') || value.includes('빈 응답')) return 'AI가 빈 응답을 보냈습니다.';
  if (value.includes('evidence') || value.includes('근거') || value.includes('reference')) {
    return 'AI 응답의 근거 참조가 맞지 않습니다.';
  }
  if (
    value.includes('json') ||
    value.includes('format') ||
    value.includes('schema') ||
    value.includes('parse')
  ) {
    return 'AI 응답 형식을 확인할 수 없습니다.';
  }
  if (value.includes('scaffold') || value.includes('뼈대'))
    return '제안의 뼈대 구성을 확인할 수 없습니다.';
  if (value.includes('recovery') || value.includes('복구'))
    return '끝나지 않은 저장을 먼저 복구해야 합니다.';
  if (
    value.includes('storage') ||
    value.includes('save') ||
    value.includes('file') ||
    value.includes('disk') ||
    value.includes('저장')
  ) {
    return '제안 저장 상태를 확인하지 못했습니다.';
  }
  if (
    value.includes('provider') ||
    value.includes('auth') ||
    value.includes('quota') ||
    value.includes('rate') ||
    value.includes('api') ||
    value.includes('연결')
  ) {
    return 'AI 제공자 연결을 확인해 주세요.';
  }
  return 'AI 제안을 만들지 못했습니다. 이 학생만 다시 시도해 주세요.';
}

function selectTargetStudents(
  students: readonly EvidenceStudentRow[],
  targetMode: RecordMapTargetMode,
  currentStudentRef: string | null,
  selectedStudentRefs: ReadonlySet<string>,
): readonly EvidenceStudentRow[] {
  if (targetMode === 'current') {
    return students.filter((student) => student.studentRef === currentStudentRef);
  }
  if (targetMode === 'class') return students;
  return students.filter((student) => selectedStudentRefs.has(student.studentRef));
}

function reviewStatusAfterApply(result: ApplyRecordMapProposalResult): RecordMapReviewStatus {
  if (result.ok) return 'applied';
  return result.code === 'source-changed' ? 'source-changed' : 'save-failed';
}

function createReviewPace(
  kind: RecordMapReviewPace['kind'],
  batchSize: number,
): RecordMapReviewPace {
  if (kind === 'batch') return { kind, size: batchSize };
  return { kind };
}

export function recordMapScaffoldDisplayName(
  policy: RecordMapScaffoldPolicy,
  scaffoldId: string | null,
): string {
  if (policy.kind === 'existing') return '기존 구성 유지';
  if (policy.kind === 'fixed') return policy.scaffold.name;
  if (scaffoldId === null) return '뼈대 선택 필요';
  return (
    policy.candidates.find((candidate) => candidate.id === scaffoldId)?.name ?? '직접 확인 필요'
  );
}

export function RecordMapBatchPanel(props: RecordMapBatchPanelProps): ReactElement {
  const { scaffoldConfigurationForArea } = props;
  const ui = useRecordMapRunStore();
  const [query, setQuery] = useState('');
  const [data, setData] = useState<RecordMapProposalData | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [applications, setApplications] = useState<readonly RecordMapApplication[]>([]);
  const closeRef = useRef<HTMLButtonElement>(null);
  const liveEvidences = useRecordEvidenceStore((state) => state.records);
  const liveThreads = useInquiryThreadStore((state) => state.records);

  const refresh = async (): Promise<RecordMapProposalData> => {
    const latest =
      (await recordMapProposalRepository.getRecordMapProposals()) ?? EMPTY_RECORD_MAP_PROPOSAL_DATA;
    setData(latest);
    return latest;
  };

  const restoreLatestRunSelection = (latest: RecordMapProposalData): void => {
    const state = useRecordMapRunStore.getState();
    const term = academicTermForDate(new Date().toISOString().slice(0, 10));
    const matchesClass = (context: RecordMapStudentContext): boolean =>
      (context.classId ?? '') === (props.classId ?? '') &&
      props.areas.includes(context.area) &&
      (context.term === undefined || context.term === term);
    const selected = latest.runs.find((candidate) => candidate.runId === state.activeRunId);
    if (selected?.targetContexts.some(matchesClass)) return;
    state.setActiveRunId(null);
    const latestRun = latest.runs
      .filter((candidate) => candidate.targetContexts.some(matchesClass))
      .slice()
      .sort((left, right) => right.updatedAt - left.updatedAt)[0];
    if (latestRun === undefined) return;
    const firstContext = latestRun.targetContexts.find(matchesClass);
    if (firstContext === undefined) return;
    const firstProposal = latest.proposals.find(
      (proposal) => proposal.runId === latestRun.runId && matchesClass(proposal.context),
    );
    state.setActiveRunId(latestRun.runId);
    state.setArea(firstContext.area);
    state.setFocusedStudentRef(firstProposal?.context.studentRef ?? firstContext.studentRef);
  };

  const reloadVisibleState = async (reloadMapStores: boolean): Promise<void> => {
    const [proposalResult, applicationResult] = await Promise.allSettled([
      recordMapProposalRepository.getRecordMapProposals(),
      recordMapApplicationPort.loadApplications(),
    ]);
    if (proposalResult.status === 'fulfilled' && proposalResult.value !== null) {
      setData(proposalResult.value);
    }
    if (applicationResult.status === 'fulfilled') {
      setApplications(applicationResult.value.applications);
    }
    if (reloadMapStores) {
      await Promise.allSettled([
        useRecordEvidenceStore.getState().forceReload(),
        useInquiryThreadStore.getState().forceReload(),
      ]);
    }
  };

  const reportUnexpectedFailure = async (
    action: string,
    error: unknown,
    possibleMapWrite: boolean,
  ): Promise<void> => {
    console.error(`[record-map] ${action} 실패`, error);
    await reloadVisibleState(possibleMapWrite);
    setMessage(
      possibleMapWrite
        ? `${action} 중 저장 상태를 확인하지 못했습니다. 화면을 다시 열어 실제 적용 결과를 확인해 주세요.`
        : `${action}하지 못했습니다. 저장 상태를 다시 확인한 뒤 시도해 주세요.`,
    );
  };

  useEffect(() => {
    const initialize = async (): Promise<void> => {
      try {
        if (recoveryCheckedThisSession) {
          const [latest, applicationData] = await Promise.all([
            recordMapProposalRepository.getRecordMapProposals(),
            recordMapApplicationPort.loadApplications(),
          ]);
          if (latest !== null) {
            setData(latest);
            restoreLatestRunSelection(latest);
          }
          setApplications(applicationData.applications);
          return;
        }
        const [latest] = await Promise.all([
          new RecoverRecordMapRuns(recordMapProposalRepository, Date.now).execute(),
          new RecoverRecordMapApplications(recordMapApplicationPort, Date.now).execute(),
        ]);
        recoveryCheckedThisSession = true;
        setData(latest);
        restoreLatestRunSelection(latest);
        setApplications((await recordMapApplicationPort.loadApplications()).applications);
      } catch (error) {
        await reportUnexpectedFailure('저장된 지도 제안과 적용 기록을 불러오기', error, false);
      }
    };
    void initialize();
    // 초기 복원은 mount 시점의 학급·허용 영역만 사용한다. 이후 학생 전환은 작업 선택을 바꾸지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeRunIsRunning =
    data?.runs.some((item) => item.runId === ui.activeRunId && item.lifecycle === 'running') ??
    false;

  useEffect(() => {
    if (!busy && !activeRunIsRunning) return;
    const timer = window.setInterval(() => {
      void recordMapProposalRepository
        .getRecordMapProposals()
        .then((latest) => {
          if (latest !== null) setData(latest);
        })
        .catch((error: unknown) => {
          console.error('[record-map] 진행 상태 읽기 실패', error);
          setMessage('진행 상태를 읽지 못했습니다. 잠시 후 다시 확인해 주세요.');
        });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeRunIsRunning, busy]);

  const area = ui.area;
  const areaScaffoldConfiguration = useMemo(
    () => (area === null ? null : scaffoldConfigurationForArea(area)),
    [area, scaffoldConfigurationForArea],
  );
  const areaScaffoldCandidates = useMemo(
    () => areaScaffoldConfiguration?.candidates ?? [],
    [areaScaffoldConfiguration],
  );
  const areaDefaultScaffold = areaScaffoldConfiguration?.defaultScaffold ?? null;

  useEffect(() => {
    if (
      ui.scaffoldId !== null &&
      !areaScaffoldCandidates.some((candidate) => candidate.id === ui.scaffoldId)
    ) {
      ui.setScaffoldId(null);
    }
  }, [area, areaScaffoldCandidates, ui]);
  const evidenceCount = (studentRef: string): number => {
    return liveEvidences.filter(
      (item) =>
        item.studentRef === studentRef &&
        (props.classId === undefined || item.classId === props.classId) &&
        (area === null || evidenceInArea(item, area)),
    ).length;
  };
  const visibleStudents = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ko');
    if (needle.length === 0) return props.students;
    return props.students.filter(
      (student) =>
        student.name.toLocaleLowerCase('ko').includes(needle) ||
        String(student.number).includes(needle),
    );
  }, [props.students, query]);

  const run = data?.runs.find((item) => item.runId === ui.activeRunId) ?? null;
  const proposals = run
    ? (data?.proposals.filter((proposal) => proposal.runId === run.runId) ?? [])
    : [];
  const focusedProposal =
    proposals.find((proposal) => proposal.context.studentRef === ui.focusedStudentRef) ??
    proposals[0] ??
    null;

  const selectedSet = new Set(ui.selectedStudentRefs);
  const filteredEligible = visibleStudents.filter(
    (student) => evidenceCount(student.studentRef) > 0,
  );
  const allFilteredSelected =
    filteredEligible.length > 0 &&
    filteredEligible.every((student) => selectedSet.has(student.studentRef));
  const someFilteredSelected =
    !allFilteredSelected && filteredEligible.some((student) => selectedSet.has(student.studentRef));

  const batchSize = Number(ui.batchSize);
  const batchSizeError =
    ui.reviewPaceKind === 'batch' && (!Number.isInteger(batchSize) || batchSize <= 0)
      ? 'N은 1 이상의 정수로 입력해 주세요.'
      : null;

  const targetStudents = selectTargetStudents(
    props.students,
    ui.targetMode,
    props.currentStudentRef,
    selectedSet,
  );
  const runnableStudents = targetStudents.filter(
    (student) => evidenceCount(student.studentRef) > 0,
  );

  const buildScaffoldPolicy = (): RecordMapScaffoldPolicy | null => {
    if (ui.scaffoldMode === 'existing') {
      if (areaDefaultScaffold === null) return null;
      return { kind: 'existing', defaultScaffold: areaDefaultScaffold };
    }
    if (ui.scaffoldMode === 'fixed') {
      const scaffold = areaScaffoldCandidates.find((candidate) => candidate.id === ui.scaffoldId);
      return scaffold ? { kind: 'fixed', scaffold } : null;
    }
    return areaScaffoldCandidates.length > 0
      ? { kind: 'ai', candidates: areaScaffoldCandidates }
      : null;
  };

  const createServices = () => {
    const ai: RecordMapAiPort = {
      ask: async (request) => {
        const api = runApi();
        if (api === null) throw new Error('AI 연결을 시작할 수 없습니다.');
        const abort = new AbortController();
        activeControllers.set(request.attemptId, abort);
        try {
          return await askOnce(api, request.provider, request.text, undefined, abort.signal);
        } finally {
          activeControllers.delete(request.attemptId);
        }
      },
      cancel: (_runId, attemptId) => activeControllers.get(attemptId)?.abort(),
    };
    const sources: RecordMapStudentSourcePort = {
      load: async (context) => {
        const evidences = useRecordEvidenceStore
          .getState()
          .records.filter((item) => sourceMatchesContext(context, item));
        const threads = useInquiryThreadStore
          .getState()
          .records.filter((item) => sourceMatchesContext(context, item));
        const termThreads = threads.filter(
          (item) =>
            context.term === undefined || item.term === undefined || item.term === context.term,
        );
        const student = props.students.find((item) => item.studentRef === context.studentRef);
        const fingerprint = recordMapSourceFingerprint({
          context,
          evidences,
          threads: termThreads,
        });
        return {
          studentName: student?.name ?? '학생',
          roster: props.roster,
          evidences,
          threads: termThreads,
          sourceFingerprint: fingerprint,
        };
      },
    };
    const generate = new GenerateRecordMapStudent(
      recordMapProposalRepository,
      ai,
      sources,
      createRunId,
      Date.now,
    );
    return {
      ai,
      sources,
      generate,
      batch: new RunRecordMapBatch(recordMapProposalRepository, generate, Date.now),
    };
  };

  const start = async (): Promise<void> => {
    if (activeRunIsRunning || area === null || batchSizeError !== null) return;
    const scaffoldPolicy = buildScaffoldPolicy();
    if (scaffoldPolicy === null) {
      setMessage('사용할 뼈대를 골라 주세요.');
      return;
    }
    if (runnableStudents.length === 0) {
      setMessage('선택한 범위에 AI로 보낼 수 있는 근거가 없습니다.');
      return;
    }
    const reviewPace = createReviewPace(ui.reviewPaceKind, batchSize);
    const currentTerm = academicTermForDate(new Date().toISOString().slice(0, 10));
    const contexts: RecordMapStudentContext[] = targetStudents.map((student) => ({
      studentRef: student.studentRef,
      ...(props.classId === undefined ? {} : { classId: props.classId }),
      area,
      ...(currentTerm === null ? {} : { term: currentTerm }),
    }));
    setBusy(true);
    setMessage(null);
    try {
      const runId = createRunId();
      await new CreateRecordMapRun(recordMapProposalRepository, Date.now).execute({
        runId,
        targetMode: ui.targetMode,
        targetContexts: contexts,
        reviewPace,
        scaffoldPolicy,
        provider: props.provider,
      });
      ui.setActiveRunId(runId);
      await refresh();
      const services = createServices();
      await services.batch.execute(runId);
      await refresh();
    } catch (error) {
      await reportUnexpectedFailure('지도 제안 시작을 저장', error, false);
    } finally {
      setBusy(false);
    }
  };

  const continueRun = async (): Promise<void> => {
    if (!run || run.lifecycle === 'running') return;
    setBusy(true);
    setMessage(null);
    try {
      const services = createServices();
      if (run.lifecycle === 'stopped') {
        await new ResumeRecordMapRun(recordMapProposalRepository, Date.now).execute(run.runId);
      }
      await services.batch.execute(run.runId);
      await refresh();
    } catch (error) {
      await reportUnexpectedFailure('지도 제안 이어 하기를 저장', error, false);
    } finally {
      setBusy(false);
    }
  };

  const stop = async (): Promise<void> => {
    if (!run) return;
    setBusy(true);
    setMessage(null);
    try {
      const services = createServices();
      await new StopRecordMapRun(recordMapProposalRepository, services.ai, Date.now).execute(
        run.runId,
      );
      await refresh();
    } catch (error) {
      await reportUnexpectedFailure('지도 제안 중단을 저장', error, false);
    } finally {
      setBusy(false);
    }
  };

  const settleIsolatedLifecycle = (runId: string): Promise<void> =>
    settleRecordMapRun(recordMapProposalRepository, runId, Date.now());

  const retry = async (context: RecordMapStudentContext): Promise<void> => {
    if (!run || run.lifecycle === 'running') return;
    setBusy(true);
    try {
      const services = createServices();
      await services.generate.execute(run.runId, context);
      await settleIsolatedLifecycle(run.runId);
      await refresh();
    } catch (error) {
      await reportUnexpectedFailure('학생 지도 제안 다시 시도를 저장', error, false);
    } finally {
      setBusy(false);
    }
  };

  const rerunCurrentSource = async (
    proposal: NonNullable<typeof focusedProposal>,
  ): Promise<void> => {
    if (run === null || run.lifecycle === 'running') return;
    setBusy(true);
    setMessage(null);
    try {
      const requeued = await new RequeueRecordMapStudent(
        recordMapProposalRepository,
        Date.now,
      ).execute(run.runId, proposal.context);
      if (!requeued) {
        setMessage('이 학생은 지금 다시 만들 수 없습니다. 진행 상태를 확인해 주세요.');
        return;
      }
      const result = await createServices().generate.execute(run.runId, proposal.context);
      await settleIsolatedLifecycle(run.runId);
      await refresh();
      setMessage(
        result === 'generated'
          ? '현재 자료로 이 학생의 제안을 다시 만들었습니다.'
          : '이 학생의 제안을 다시 만들지 못했습니다.',
      );
    } catch (error) {
      await reportUnexpectedFailure('현재 자료로 학생 지도 제안을 다시 만들기', error, false);
    } finally {
      setBusy(false);
    }
  };

  const rerunWithScaffold = async (
    proposal: NonNullable<typeof focusedProposal>,
    scaffoldId: string,
    topicId: string,
  ): Promise<void> => {
    if (activeRunIsRunning) return;
    const scaffold = areaScaffoldCandidates.find((item) => item.id === scaffoldId);
    if (!scaffold) return;
    setBusy(true);
    try {
      const services = createServices();
      const accepted = await new RegenerateRecordMapTopic(
        recordMapProposalRepository,
        services.ai,
        services.sources,
        createRunId,
        Date.now,
      ).execute(proposal, topicId, scaffold);
      await refresh();
      setMessage(
        accepted
          ? '고른 주제만 다시 제안했습니다. 내용을 검토해 주세요.'
          : '주제를 다시 만들지 못해 기존 제안을 보존했습니다.',
      );
    } catch (error) {
      await reportUnexpectedFailure('주제 다시 제안', error, false);
    } finally {
      setBusy(false);
    }
  };

  const proposalFingerprint = (proposal: NonNullable<typeof focusedProposal>): string =>
    recordMapSourceFingerprint({
      context: proposal.context,
      evidences: liveEvidences,
      threads: liveThreads,
    });

  const persistReviewStatus = async (
    proposal: NonNullable<typeof focusedProposal>,
    reviewStatus: RecordMapReviewStatus,
  ): Promise<void> => {
    const latest = await recordMapProposalRepository.updateRecordMapProposals((current) => {
      const currentProposal = current.proposals.find(
        (item) =>
          item.runId === proposal.runId &&
          item.context.studentRef === proposal.context.studentRef &&
          item.context.classId === proposal.context.classId &&
          item.context.area === proposal.context.area,
      );
      if (currentProposal === undefined || currentProposal.attemptId !== proposal.attemptId) {
        return current;
      }
      return replaceRecordMapProposal(current, {
        ...currentProposal,
        reviewStatus,
        updatedAt: Date.now(),
      });
    });
    setData(latest);
  };

  const changeReviewStatus = async (
    proposal: NonNullable<typeof focusedProposal>,
    reviewStatus: RecordMapReviewStatus,
  ): Promise<void> => {
    setMessage(null);
    if (reviewStatus === 'reviewed') {
      if (run === null || run.lifecycle === 'running') return;
      const blockers = recordMapProposalReviewBlockers(proposal, liveEvidences, run.scaffoldPolicy);
      const sourceChanged = proposalFingerprint(proposal) !== proposal.sourceFingerprint;
      if (
        sourceChanged ||
        blockers.unresolvedScaffold ||
        blockers.missingEvidenceIds.length > 0 ||
        blockers.incomplete
      ) {
        setMessage('확인이 필요한 항목을 해결한 뒤 검토를 완료해 주세요.');
        return;
      }
    }
    try {
      await persistReviewStatus(proposal, reviewStatus);
    } catch (error) {
      await reportUnexpectedFailure('검토 상태를 저장', error, false);
    }
  };

  const publishMapStores = async (): Promise<void> => {
    await Promise.all([
      useRecordEvidenceStore.getState().forceReload(),
      useInquiryThreadStore.getState().forceReload(),
    ]);
  };

  const applyOne = async (proposal: NonNullable<typeof focusedProposal>): Promise<boolean> => {
    if (run === null) return false;
    setBusy(true);
    setMessage(null);
    try {
      const result = await new ApplyRecordMapProposal(
        recordMapApplicationPort,
        createRunId,
        Date.now,
        recordMapProposalRepository,
      ).execute(proposal);
      if (!result.ok) {
        await persistReviewStatus(
          proposal,
          result.code === 'source-changed' ? 'source-changed' : 'save-failed',
        );
        setMessage(result.message);
        return false;
      }
      await persistReviewStatus(proposal, 'applied');
      await publishMapStores();
      setApplications((await recordMapApplicationPort.loadApplications()).applications);
      setMessage('이 학생의 지도를 적용했습니다.');
      return true;
    } catch (error) {
      await reportUnexpectedFailure('지도 적용', error, true);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const applyReviewed = async (): Promise<void> => {
    if (run === null || run.lifecycle === 'running') return;
    const reviewed = proposals.filter((proposal) => proposal.reviewStatus === 'reviewed');
    if (reviewed.length === 0) {
      setMessage('검토 완료한 학생이 없습니다.');
      return;
    }
    const hasProposalBlocker = reviewed.some((proposal) => {
      const blockers = recordMapProposalReviewBlockers(proposal, liveEvidences, run.scaffoldPolicy);
      return (
        blockers.unresolvedScaffold || blockers.missingEvidenceIds.length > 0 || blockers.incomplete
      );
    });
    if (hasProposalBlocker) {
      setMessage('확인이 필요한 제안이 있어 여러 학생에게 적용할 수 없습니다.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const apply = new ApplyRecordMapProposal(
        recordMapApplicationPort,
        createRunId,
        Date.now,
        recordMapProposalRepository,
      );
      const results = await new ApplyReviewedRecordMapBatch(apply).execute(reviewed);
      for (const item of results) {
        const proposal = reviewed.find(
          (candidate) => candidate.context.studentRef === item.studentRef,
        );
        if (proposal === undefined) continue;
        await persistReviewStatus(proposal, reviewStatusAfterApply(item.result));
      }
      const success = results.filter((item) => item.result.ok).length;
      const conflict = results.filter(
        (item) => !item.result.ok && item.result.code === 'source-changed',
      ).length;
      const failure = results.length - success - conflict;
      const stopped = reviewed.length - results.length;
      if (success > 0) await publishMapStores();
      setApplications((await recordMapApplicationPort.loadApplications()).applications);
      setMessage(
        `적용 ${success}명 · 원본 변경 ${conflict}명 · 저장 실패 ${failure}명${stopped > 0 ? ` · 복구 대기 ${stopped}명` : ''}`,
      );
    } catch (error) {
      await reportUnexpectedFailure('검토한 학생 지도 적용', error, true);
    } finally {
      setBusy(false);
    }
  };

  const undo = async (
    applicationId: string,
    proposal: NonNullable<typeof focusedProposal>,
  ): Promise<void> => {
    setBusy(true);
    try {
      const result = await new UndoRecordMapApplication(recordMapApplicationPort, Date.now).execute(
        applicationId,
      );
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      await publishMapStores();
      await persistReviewStatus(proposal, 'unreviewed');
      setApplications((await recordMapApplicationPort.loadApplications()).applications);
      setMessage('이 학생의 지도 적용을 되돌렸습니다. 다시 적용하려면 검토해 주세요.');
    } catch (error) {
      await reportUnexpectedFailure('지도 적용 되돌리기', error, true);
    } finally {
      setBusy(false);
    }
  };

  const completed = run?.items.filter((item) => item.runStatus === 'generated').length ?? 0;
  const failed = run?.items.filter((item) => item.runStatus === 'failed').length ?? 0;
  const waiting =
    run?.items.filter((item) => item.runStatus === 'queued' || item.runStatus === 'cancelled')
      .length ?? 0;
  const generating = run?.items.filter((item) => item.runStatus === 'generating').length ?? 0;
  const unavailableTargetCount = targetStudents.length - runnableStudents.length;
  const reviewedCount = proposals.filter((proposal) => proposal.reviewStatus === 'reviewed').length;
  const reviewedHasProposalBlocker =
    run !== null &&
    proposals
      .filter((proposal) => proposal.reviewStatus === 'reviewed')
      .some((proposal) => {
        const blockers = recordMapProposalReviewBlockers(
          proposal,
          liveEvidences,
          run.scaffoldPolicy,
        );
        return (
          blockers.unresolvedScaffold ||
          blockers.missingEvidenceIds.length > 0 ||
          blockers.incomplete
        );
      });
  const focusedSourceChanged =
    focusedProposal !== null &&
    focusedProposal.reviewStatus !== 'applied' &&
    proposalFingerprint(focusedProposal) !== focusedProposal.sourceFingerprint;
  const focusedBlockers =
    focusedProposal === null
      ? null
      : recordMapProposalReviewBlockers(focusedProposal, liveEvidences, run!.scaffoldPolicy);
  const focusedReviewBlocked =
    focusedSourceChanged ||
    focusedBlockers === null ||
    focusedBlockers.unresolvedScaffold ||
    focusedBlockers.missingEvidenceIds.length > 0 ||
    focusedBlockers.incomplete;
  const focusedApplication =
    focusedProposal === null
      ? null
      : (applications
          .filter(
            (item) =>
              item.runId === focusedProposal.runId &&
              item.studentRef === focusedProposal.context.studentRef &&
              item.proposalAttemptId === focusedProposal.attemptId &&
              item.phase === 'committed',
          )
          .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null);

  return createPortal(
    <FocusTrap
      focusTrapOptions={{
        initialFocus: () => closeRef.current ?? undefined,
        fallbackFocus: () => closeRef.current ?? document.body,
        escapeDeactivates: false,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-map-batch-title"
        className="fixed inset-0 z-sp-modal flex items-stretch justify-end bg-sp-bg"
        onKeyDown={(event) => {
          if (event.key === 'Escape') props.onClose();
        }}
      >
        <section className="flex h-full w-full max-w-5xl flex-col bg-sp-bg shadow-2xl">
          <header className="flex items-center justify-between border-b border-sp-border bg-sp-card px-6 py-4">
            <div>
              <h2 id="record-map-batch-title" className="text-lg font-bold text-sp-text">
                여러 학생의 지도 제안
              </h2>
              <p className="mt-1 text-sm text-sp-muted">
                {props.className ?? '현재 학급'}
                {props.classSubject ? ` · ${props.classSubject}` : ''} · 제안은 검토 전까지 지도에
                반영되지 않습니다.
              </p>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={props.onClose}
              aria-label="여러 학생의 지도 제안 닫기"
              className="rounded-lg p-2 text-sp-muted hover:bg-sp-surface"
            >
              <span aria-hidden="true" className="material-symbols-outlined">
                close
              </span>
            </button>
          </header>

          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-auto lg:grid-cols-[22rem_1fr]">
            <div className="space-y-5 border-r border-sp-border p-5">
              {area === null && props.areas.length > 1 && (
                <fieldset>
                  <legend className="text-sm font-semibold text-sp-text">
                    먼저 영역을 골라 주세요
                  </legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {props.areas.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => ui.setArea(item)}
                        className="rounded-lg border border-sp-border bg-sp-card px-3 py-2 text-sm text-sp-text hover:bg-sp-surface"
                      >
                        {RECORD_AREA_LABELS[item]}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}

              {area !== null && (
                <>
                  <fieldset>
                    <legend className="text-sm font-semibold text-sp-text">대상 학생</legend>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {(
                        [
                          ['current', '현재 학생'],
                          ['selected', '직접 선택'],
                          ['class', '반 전체'],
                        ] as const
                      ).map(([value, label]) => (
                        <label
                          key={value}
                          className="flex cursor-pointer items-center gap-1 rounded-lg border border-sp-border bg-sp-card px-2 py-2 text-sm text-sp-text"
                        >
                          <input
                            type="radio"
                            name="target-mode"
                            checked={ui.targetMode === value}
                            onChange={() => ui.setTargetMode(value)}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  {ui.targetMode === 'selected' && (
                    <div className="rounded-xl border border-sp-border bg-sp-card p-3">
                      <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="이름 또는 출석번호 검색"
                        aria-label="학생 검색"
                        className="w-full rounded-lg border border-sp-border bg-sp-bg px-3 py-2 text-sm text-sp-text outline-none focus:ring-2 focus:ring-sp-accent"
                      />
                      <label className="mt-3 flex items-center gap-2 border-b border-sp-border pb-2 text-sm font-medium text-sp-text">
                        <input
                          type="checkbox"
                          checked={allFilteredSelected}
                          ref={(node) => {
                            if (node) node.indeterminate = someFilteredSelected;
                          }}
                          onChange={() => {
                            const visible = new Set(
                              filteredEligible.map((student) => student.studentRef),
                            );
                            ui.setSelectedStudentRefs(
                              allFilteredSelected
                                ? ui.selectedStudentRefs.filter((ref) => !visible.has(ref))
                                : [...new Set([...ui.selectedStudentRefs, ...visible])],
                            );
                          }}
                        />
                        검색 결과 전체 선택 ({filteredEligible.length}명)
                      </label>
                      <div className="mt-2 max-h-48 space-y-1 overflow-auto">
                        {visibleStudents.map((student) => {
                          const count = evidenceCount(student.studentRef);
                          return (
                            <label
                              key={student.studentRef}
                              className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-sp-surface"
                            >
                              <span className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  disabled={count === 0}
                                  checked={selectedSet.has(student.studentRef)}
                                  onChange={() =>
                                    ui.setSelectedStudentRefs(
                                      selectedSet.has(student.studentRef)
                                        ? ui.selectedStudentRefs.filter(
                                            (ref) => ref !== student.studentRef,
                                          )
                                        : [...ui.selectedStudentRefs, student.studentRef],
                                    )
                                  }
                                />
                                <span className="w-7 text-right text-sp-muted">
                                  {student.number}
                                </span>
                                <span className="text-sp-text">{student.name}</span>
                              </span>
                              <span className="text-xs text-sp-muted">
                                {count > 0 ? `근거 ${count}건` : '근거 없음'}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      <p className="mt-2 text-sm text-sp-muted">
                        선택 {ui.selectedStudentRefs.length}명 · 검색어를 바꿔도 선택은 유지됩니다.
                      </p>
                    </div>
                  )}

                  <fieldset>
                    <legend className="text-sm font-semibold text-sp-text">
                      몇 명씩 확인할까요?
                    </legend>
                    <div className="mt-2 space-y-2 text-sm text-sp-text">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="pace"
                          checked={ui.reviewPaceKind === 'one'}
                          onChange={() => ui.setReviewPaceKind('one')}
                        />
                        1명씩
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="pace"
                          checked={ui.reviewPaceKind === 'batch'}
                          onChange={() => ui.setReviewPaceKind('batch')}
                        />
                        N명씩{' '}
                        <input
                          aria-label="한 번에 확인할 학생 수"
                          value={ui.batchSize}
                          onChange={(event) => ui.setBatchSize(event.target.value)}
                          className="w-16 rounded-md border border-sp-border bg-sp-card px-2 py-1"
                        />
                      </label>
                      {batchSizeError && (
                        <p role="alert" className="text-sm text-sp-error">
                          {batchSizeError}
                        </p>
                      )}
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="pace"
                          checked={ui.reviewPaceKind === 'continuous'}
                          onChange={() => ui.setReviewPaceKind('continuous')}
                        />
                        전체 계속 만들기
                      </label>
                    </div>
                  </fieldset>

                  <fieldset>
                    <legend className="text-sm font-semibold text-sp-text">뼈대</legend>
                    <div className="mt-2 space-y-2 text-sm text-sp-text">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="scaffold"
                          checked={ui.scaffoldMode === 'existing'}
                          onChange={() => ui.setScaffoldMode('existing')}
                        />
                        기존 구성 유지
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="scaffold"
                          checked={ui.scaffoldMode === 'fixed'}
                          onChange={() => ui.setScaffoldMode('fixed')}
                        />
                        직접 선택
                      </label>
                      {ui.scaffoldMode === 'fixed' && (
                        <select
                          aria-label="사용할 뼈대"
                          value={ui.scaffoldId ?? ''}
                          onChange={(event) => ui.setScaffoldId(event.target.value || null)}
                          className="ml-6 w-[calc(100%-1.5rem)] rounded-lg border border-sp-border bg-sp-card px-3 py-2"
                        >
                          <option value="">뼈대를 골라 주세요</option>
                          {areaScaffoldCandidates.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      )}
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="scaffold"
                          checked={ui.scaffoldMode === 'ai'}
                          onChange={() => ui.setScaffoldMode('ai')}
                        />
                        AI에게 주제별로 맡기기
                      </label>
                    </div>
                  </fieldset>
                </>
              )}
            </div>

            <div className="min-h-0 p-5">
              {run === null ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined text-5xl text-sp-muted"
                  >
                    account_tree
                  </span>
                  <p className="mt-3 font-semibold text-sp-text">
                    {targetStudents.length}명 선택 · 제안 가능 {runnableStudents.length}명 · 근거
                    없음 {unavailableTargetCount}명
                  </p>
                  <p className="mt-1 text-sm text-sp-muted">
                    학생별로 차례대로 만들며, 실제 지도는 바꾸지 않습니다.
                  </p>
                  <button
                    type="button"
                    disabled={
                      busy ||
                      area === null ||
                      batchSizeError !== null ||
                      runnableStudents.length === 0
                    }
                    onClick={() => void start()}
                    className="mt-5 rounded-lg bg-sp-accent px-5 py-2.5 text-sm font-semibold text-sp-accent-fg disabled:opacity-40"
                  >
                    {busy ? '제안 만드는 중…' : `${runnableStudents.length}명 제안 만들기`}
                  </button>
                </div>
              ) : (
                <div className="flex h-full min-h-0 flex-col">
                  <div
                    aria-live="polite"
                    className="rounded-xl border border-sp-border bg-sp-card p-4"
                  >
                    <p className="font-semibold text-sp-text">
                      {run.items.length}명 중 {completed}명 확인 가능 · 생성 중 {generating}명 ·
                      실패 {failed}명 · 남음 {waiting}명
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {waiting > 0 && (
                        <button
                          type="button"
                          disabled={busy || activeRunIsRunning}
                          onClick={() => void continueRun()}
                          className="rounded-lg bg-sp-accent px-3 py-2 text-sm font-semibold text-sp-accent-fg disabled:opacity-40"
                        >
                          {run.lifecycle === 'stopped'
                            ? `이어 하기 (${waiting}명 남음)`
                            : '계속 만들기'}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy || reviewedCount === 0 || reviewedHasProposalBlocker}
                        onClick={() => void applyReviewed()}
                        className="rounded-lg border border-sp-accent px-3 py-2 text-sm font-semibold text-sp-accent disabled:opacity-40"
                      >
                        검토한 {reviewedCount}명 적용
                      </button>
                      {(run.lifecycle === 'running' || busy) && (
                        <button
                          type="button"
                          onClick={() => void stop()}
                          className="rounded-lg border border-sp-border px-3 py-2 text-sm text-sp-text"
                        >
                          중단
                        </button>
                      )}
                      {run.lifecycle !== 'running' && !busy && (
                        <button
                          type="button"
                          onClick={() => ui.setActiveRunId(null)}
                          className="rounded-lg border border-sp-border px-3 py-2 text-sm text-sp-text"
                        >
                          새 작업
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
                    <div className="overflow-auto rounded-xl border border-sp-border bg-sp-card p-2">
                      {run.items.map((item) => {
                        const student = props.students.find(
                          (candidate) => candidate.studentRef === item.context.studentRef,
                        );
                        const selected = item.context.studentRef === ui.focusedStudentRef;
                        const statusDescription =
                          item.runStatus === 'failed'
                            ? `${RECORD_MAP_STATUS_LABELS[item.runStatus]} · ${recordMapFailureLabel(item.failureMessage)}`
                            : RECORD_MAP_STATUS_LABELS[item.runStatus];
                        return (
                          <button
                            key={item.context.studentRef}
                            type="button"
                            onClick={() => ui.setFocusedStudentRef(item.context.studentRef)}
                            aria-current={selected ? 'true' : undefined}
                            aria-pressed={selected}
                            aria-label={`${student?.name ?? '학생'} · ${statusDescription}`}
                            className={`mb-1 flex w-full items-center justify-between rounded-lg border px-2 py-2 text-left text-sm ${selected ? 'border-sp-accent bg-sp-surface text-sp-text' : 'border-transparent text-sp-text hover:bg-sp-surface'}`}
                          >
                            <span>
                              <span className="mr-2 text-sp-muted">{student?.number ?? ''}</span>
                              {student?.name ?? '학생'}
                            </span>
                            <span className="ml-2 text-right text-xs text-sp-muted">
                              {statusDescription}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="overflow-auto rounded-xl border border-sp-border bg-sp-card p-4">
                      {focusedProposal ? (
                        <>
                          <h3 className="font-semibold text-sp-text">
                            {props.students.find(
                              (student) =>
                                student.studentRef === focusedProposal.context.studentRef,
                            )?.name ?? '학생'}
                            의 제안
                          </h3>
                          <p className="mt-2 text-sm text-sp-muted">
                            현재 주제{' '}
                            {
                              liveThreads.filter((thread) =>
                                sourceMatchesContext(focusedProposal.context, thread),
                              ).length
                            }
                            개 → 제안 주제 {focusedProposal.topics.length}개 · 자리 미정{' '}
                            {focusedProposal.unplacedEvidence.length}건
                          </p>
                          <div className="mt-4">
                            <RecordMapProposalReview
                              proposal={focusedProposal}
                              policy={run.scaffoldPolicy}
                              evidences={liveEvidences}
                              threads={liveThreads}
                              scaffoldCandidates={areaScaffoldCandidates}
                              sourceChanged={focusedSourceChanged}
                              busy={busy}
                              onRerunSource={() => void rerunCurrentSource(focusedProposal)}
                              onRerunWithScaffold={(scaffoldId, topicId) =>
                                void rerunWithScaffold(focusedProposal, scaffoldId, topicId)
                              }
                            />
                          </div>
                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            <label className="flex items-center gap-2 rounded-lg border border-sp-border px-3 py-2 text-sm font-medium text-sp-text">
                              <input
                                type="checkbox"
                                checked={
                                  focusedProposal.reviewStatus === 'reviewed' ||
                                  focusedProposal.reviewStatus === 'applied'
                                }
                                disabled={
                                  busy ||
                                  focusedReviewBlocked ||
                                  focusedProposal.reviewStatus === 'applied'
                                }
                                onChange={(event) =>
                                  void changeReviewStatus(
                                    focusedProposal,
                                    event.target.checked ? 'reviewed' : 'unreviewed',
                                  )
                                }
                              />
                              검토 완료
                            </label>
                            <button
                              type="button"
                              disabled={busy || focusedProposal.reviewStatus === 'applied'}
                              onClick={() => void changeReviewStatus(focusedProposal, 'held')}
                              className="rounded-lg border border-sp-border px-3 py-2 text-sm text-sp-text disabled:opacity-40"
                            >
                              보류
                            </button>
                            <button
                              type="button"
                              disabled={
                                busy ||
                                focusedReviewBlocked ||
                                focusedProposal.reviewStatus !== 'reviewed'
                              }
                              onClick={() => void applyOne(focusedProposal)}
                              className="rounded-lg bg-sp-accent px-4 py-2 text-sm font-semibold text-sp-accent-fg disabled:opacity-40"
                            >
                              이 학생 지도에 적용
                            </button>
                            {focusedApplication !== null && (
                              <button
                                type="button"
                                disabled={busy || activeRunIsRunning}
                                onClick={() => void undo(focusedApplication.id, focusedProposal)}
                                className="rounded-lg border border-sp-border px-3 py-2 text-sm text-sp-text disabled:opacity-40"
                              >
                                적용 후 되돌리기
                              </button>
                            )}
                          </div>
                        </>
                      ) : (
                        <p className="text-sm text-sp-muted">
                          학생을 선택하면 현재 지도와 제안의 차이를 보여 줍니다.
                        </p>
                      )}
                      {run.items
                        .filter((item) => item.runStatus === 'failed')
                        .map((item) => (
                          <div key={`retry-${item.context.studentRef}`} className="mt-3">
                            <button
                              type="button"
                              disabled={busy || activeRunIsRunning}
                              onClick={() => void retry(item.context)}
                              className="mt-3 mr-2 rounded-lg border border-sp-border px-3 py-2 text-sm text-sp-text"
                            >
                              {props.students.find(
                                (student) => student.studentRef === item.context.studentRef,
                              )?.name ?? '학생'}{' '}
                              다시 시도
                            </button>
                            <p className="mt-1 text-sm text-sp-error">
                              {recordMapFailureLabel(item.failureMessage)}
                            </p>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}
              {message && (
                <p role="alert" className="mt-3 text-sm text-sp-error">
                  {message}
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </FocusTrap>,
    document.body,
  );
}
