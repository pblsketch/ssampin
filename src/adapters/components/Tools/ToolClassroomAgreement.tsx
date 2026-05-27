import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { ToolLayout } from './ToolLayout';
import { LiveSessionClient } from '@infrastructure/supabase/LiveSessionClient';
import type {
  AgreementFinalItem,
  AgreementFinalScene,
  ClassroomAgreementCandidate,
  ClassroomAgreementClassContext,
  ClassroomAgreementProposal,
  ClassroomAgreementSaveMode,
  ClassroomAgreementSavedSession,
  ClassroomAgreementScene,
  ClassroomAgreementSession,
  ClassroomAgreementType,
} from '@domain/entities/ClassroomAgreement';
import { CLASSROOM_AGREEMENT_SCHEMA_VERSION } from '@domain/entities/ClassroomAgreement';
import { validateAgreementDraft } from '@domain/rules/classroomAgreementRules';
import { useClassroomAgreementStore } from '@adapters/stores/useClassroomAgreementStore';

interface ToolClassroomAgreementProps {
  readonly onBack: () => void;
  readonly isFullscreen: boolean;
}

interface ClassroomAgreementSetupInput {
  readonly title: string;
  readonly agreementType: ClassroomAgreementType;
  readonly classContext: ClassroomAgreementClassContext;
  readonly scenes: readonly string[];
  readonly maxProposalsPerStudent: number;
  readonly priorityVoteLimit: number;
  readonly allowNickname: boolean;
  readonly allowProposalsDuringReview: boolean;
  readonly saveMode: ClassroomAgreementSaveMode;
}

type ClassroomAgreementResultViewMode = 'list' | 'cards' | 'group' | 'lesson';
type ClassroomAgreementTeacherStep = 'setup' | 'share' | 'collect' | 'review' | 'vote' | 'final';

const TEACHER_FLOW_STEPS: Array<{
  readonly id: ClassroomAgreementTeacherStep;
  readonly label: string;
  readonly description: string;
}> = [
  { id: 'setup', label: '사전 설정', description: '활동 조건을 정해요' },
  { id: 'share', label: '링크 공유', description: '학생이 들어올 길을 열어요' },
  { id: 'collect', label: '학생 제안', description: '실행 문장을 모아요' },
  { id: 'review', label: '후보 다듬기', description: '함께 볼 문장으로 정리해요' },
  { id: 'vote', label: '투표', description: '의견과 우선순위를 확인해요' },
  { id: 'final', label: '최종 카드', description: '게시·저장할 결과를 만들어요' },
];

const AGREEMENT_TYPE_OPTIONS: Array<{
  readonly value: ClassroomAgreementType;
  readonly label: string;
  readonly description: string;
}> = [
  {
    value: 'class-rule',
    label: '학급 규칙',
    description: '우리 반 생활 장면을 함께 약속으로 정해요.',
  },
  {
    value: 'lesson-rule',
    label: '수업 규칙',
    description: '수업 흐름을 돕는 시작 행동을 정해요.',
  },
  {
    value: 'group-agreement',
    label: '모둠 활동 약속',
    description: '의견을 나누고 역할을 맡을 때의 약속을 정해요.',
  },
];

export const CLASSROOM_AGREEMENT_SCENES = [
  '수업 시작',
  '발표 듣기',
  '모둠 의견 충돌',
  '자리 이동',
  '과제 제출',
  '쉬는 시간 후 복귀',
  '준비물 정리',
  '역할 분담',
] as const;

export function ToolClassroomAgreement({ onBack, isFullscreen }: ToolClassroomAgreementProps) {
  const [title, setTitle] = useState('우리 반 교실 약속');
  const [agreementType, setAgreementType] = useState<ClassroomAgreementType>('class-rule');
  const [classContext, setClassContext] = useState<ClassroomAgreementClassContext>({
    kind: 'manual',
    label: '우리 반',
  });
  const [selectedScenes, setSelectedScenes] = useState<string[]>([CLASSROOM_AGREEMENT_SCENES[0]]);
  const [customScene, setCustomScene] = useState('');
  const [maxProposalsPerStudent, setMaxProposalsPerStudent] = useState(2);
  const [priorityVoteLimit, setPriorityVoteLimit] = useState(3);
  const [allowNickname, setAllowNickname] = useState(true);
  const [allowProposalsDuringReview, setAllowProposalsDuringReview] = useState(false);
  const [saveMode, setSaveMode] = useState<ClassroomAgreementSaveMode>('finalOnly');
  const [session, setSession] = useState<ClassroomAgreementSession | null>(null);
  const [serverInfo, setServerInfo] = useState<{ port: number; localIPs: string[] } | null>(null);
  const [connectedStudents, setConnectedStudents] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [shortUrl, setShortUrl] = useState<string | null>(null);
  const [shortCode, setShortCode] = useState<string | null>(null);
  const [tunnelLoading, setTunnelLoading] = useState(false);
  const [tunnelError, setTunnelError] = useState<string | null>(null);
  const [selectedProposalIds, setSelectedProposalIds] = useState<string[]>([]);
  const [resultView, setResultView] = useState<'list' | 'cards' | 'group' | 'lesson'>('list');
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const liveSessionClientRef = useRef(new LiveSessionClient());
  const savedSessions = useClassroomAgreementStore((state) => state.savedSessions);
  const loadSavedAgreementSessions = useClassroomAgreementStore((state) => state.load);
  const saveAgreementSession = useClassroomAgreementStore((state) => state.saveSession);
  const deleteAgreementSession = useClassroomAgreementStore((state) => state.deleteSession);

  const scenes = useMemo(
    () => normalizeSceneLabels([...selectedScenes, customScene]),
    [selectedScenes, customScene],
  );
  const studentUrl = shortUrl ?? tunnelUrl ?? '';
  const teacherStep = deriveClassroomAgreementTeacherStep(session);
  const activeCandidates = useMemo(
    () => session?.candidates.filter((candidate) => candidate.status !== 'removed') ?? [],
    [session?.candidates],
  );
  const activeSceneProposals = useMemo(
    () => session?.proposals.filter((proposal) => proposal.sceneId === session.activeSceneId) ?? [],
    [session],
  );
  const hasActiveCandidates = activeCandidates.length > 0;

  useEffect(() => {
    void loadSavedAgreementSessions();
  }, [loadSavedAgreementSessions]);

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onClassroomAgreementEvent?.((event) => {
      if (event.type === 'connection-count') {
        setConnectedStudents(event.count);
        return;
      }
      if (event.type === 'session-state') {
        setSession(event.session);
      }
      if (event.type === 'proposal-received') {
        setSession((prev) => {
          if (!prev) return prev;
          if (prev.proposals.some((proposal) => proposal.id === event.proposal.id)) return prev;
          return {
            ...prev,
            proposals: [event.proposal, ...prev.proposals],
            updatedAt: Date.now(),
          };
        });
      }
      if (event.type === 'phase-changed') {
        setSession((prev) => (prev ? { ...prev, phase: event.phase } : prev));
      }
    });
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!studentUrl) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(studentUrl, { margin: 1, width: 220 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [studentUrl]);

  const previewSession = useMemo(
    () =>
      createClassroomAgreementSession(
        {
          title,
          agreementType,
          classContext,
          scenes,
          maxProposalsPerStudent,
          priorityVoteLimit,
          allowNickname,
          allowProposalsDuringReview,
          saveMode,
        },
        Date.now,
        makeBrowserId,
      ),
    [
      title,
      agreementType,
      classContext,
      scenes,
      maxProposalsPerStudent,
      priorityVoteLimit,
      allowNickname,
      allowProposalsDuringReview,
      saveMode,
    ],
  );

  const startStudentAccessTunnel = useCallback(async () => {
    const api = window.electronAPI;
    setTunnelLoading(true);
    setTunnelError(null);
    setTunnelUrl(null);
    setShortUrl(null);
    setShortCode(null);

    try {
      if (
        !api?.classroomAgreementTunnelAvailable ||
        !api.classroomAgreementTunnelInstall ||
        !api.classroomAgreementTunnelStart
      ) {
        throw new Error('학생 참여 링크를 만들 수 없습니다.');
      }

      const available = await api.classroomAgreementTunnelAvailable();
      if (!available) await api.classroomAgreementTunnelInstall();

      const result = await api.classroomAgreementTunnelStart();
      const publicStudentUrl = buildClassroomAgreementStudentUrl(result.tunnelUrl);
      setTunnelUrl(publicStudentUrl);

      const liveSession = await liveSessionClientRef.current.registerSession(publicStudentUrl);
      if (liveSession) {
        setShortUrl(liveSession.shortUrl);
        setShortCode(liveSession.code);
      }
    } catch (err) {
      setTunnelError(
        err instanceof Error
          ? err.message
          : '학생 참여 링크를 만들지 못했습니다. 인터넷 연결을 확인해 주세요.',
      );
    } finally {
      setTunnelLoading(false);
    }
  }, []);

  const handleStart = useCallback(async () => {
    setError(null);
    const api = window.electronAPI;
    if (!api?.startClassroomAgreement) {
      setError('교실 약속 세션을 시작할 수 없습니다. 앱 환경을 확인해 주세요.');
      return;
    }
    try {
      const nextSession = createClassroomAgreementSession(
        {
          title,
          agreementType,
          classContext,
          scenes,
          maxProposalsPerStudent,
          priorityVoteLimit,
          allowNickname,
          allowProposalsDuringReview,
          saveMode,
        },
        Date.now,
        makeBrowserId,
      );
      const info = await api.startClassroomAgreement({ session: nextSession });
      setSession(nextSession);
      setServerInfo(info);
      setConnectedStudents(0);
      void startStudentAccessTunnel();
    } catch (err) {
      setError(err instanceof Error ? err.message : '세션을 시작하지 못했습니다.');
    }
  }, [
    title,
    agreementType,
    classContext,
    scenes,
    maxProposalsPerStudent,
    priorityVoteLimit,
    allowNickname,
    allowProposalsDuringReview,
    saveMode,
    startStudentAccessTunnel,
  ]);

  const handleStop = useCallback(async () => {
    setError(null);
    try {
      await window.electronAPI?.stopClassroomAgreement?.();
    } finally {
      setSession(null);
      setServerInfo(null);
      setConnectedStudents(0);
      setQrDataUrl(null);
      setTunnelUrl(null);
      setShortUrl(null);
      setShortCode(null);
      setTunnelLoading(false);
      setTunnelError(null);
    }
  }, []);

  const handleCopyLink = useCallback(async () => {
    if (!studentUrl) return;
    try {
      await navigator.clipboard.writeText(studentUrl);
    } catch {
      setError('링크 복사에 실패했습니다. 화면의 주소를 직접 복사해 주세요.');
    }
  }, [studentUrl]);

  const moveToCollecting = useCallback(async () => {
    if (!window.electronAPI?.setClassroomAgreementPhase) return;
    const result = await window.electronAPI.setClassroomAgreementPhase({
      command: 'start-collecting',
    });
    setSession((prev) => (prev ? { ...prev, phase: result.phase } : prev));
  }, []);

  const moveToTeacherReview = useCallback(async () => {
    if (!window.electronAPI?.setClassroomAgreementPhase) return;
    const result = await window.electronAPI.setClassroomAgreementPhase({
      command: 'start-teacher-review',
    });
    setSession((prev) => (prev ? { ...prev, phase: result.phase } : prev));
  }, []);

  const commitSession = useCallback(
    (updater: (current: ClassroomAgreementSession) => ClassroomAgreementSession) => {
      setSession((current) => {
        if (!current) return current;
        const next = updater(current);
        void window.electronAPI?.updateClassroomAgreementSession?.({ session: next });
        return next;
      });
    },
    [],
  );

  const changeActiveScene = useCallback(
    (sceneId: string) => {
      commitSession((current) => {
        if (!current.scenes.some((scene) => scene.id === sceneId)) return current;
        setSelectedProposalIds([]);
        return {
          ...current,
          activeSceneId: sceneId,
          updatedAt: Date.now(),
        };
      });
    },
    [commitSession],
  );

  const promoteProposal = useCallback(
    (proposal: ClassroomAgreementProposal) => {
      commitSession((current) => {
        const candidate = createCandidateFromProposal(
          proposal,
          current.settings.defaultShowAuthor,
          Date.now,
          makeBrowserId,
        );
        return {
          ...current,
          proposals: current.proposals.map((item) =>
            item.id === proposal.id ? { ...item, promotedCandidateId: candidate.id } : item,
          ),
          candidates: [candidate, ...current.candidates],
          updatedAt: Date.now(),
        };
      });
    },
    [commitSession],
  );

  const mergeSelectedProposals = useCallback(() => {
    commitSession((current) => {
      const proposals = current.proposals.filter((proposal) =>
        selectedProposalIds.includes(proposal.id),
      );
      if (proposals.length < 2) return current;
      const candidate = mergeProposalsIntoCandidate(proposals, Date.now, makeBrowserId);
      setSelectedProposalIds([]);
      return {
        ...current,
        proposals: current.proposals.map((proposal) =>
          selectedProposalIds.includes(proposal.id)
            ? { ...proposal, promotedCandidateId: candidate.id }
            : proposal,
        ),
        candidates: [candidate, ...current.candidates],
        updatedAt: Date.now(),
      };
    });
  }, [commitSession, selectedProposalIds]);

  const updateCandidate = useCallback(
    (candidateId: string, patch: Partial<ClassroomAgreementCandidate>) => {
      commitSession((current) => ({
        ...current,
        candidates: current.candidates.map((candidate) =>
          candidate.id === candidateId
            ? {
                ...candidate,
                ...patch,
                validationIssues: validateAgreementDraft({
                  ifText: patch.ifText ?? candidate.ifText,
                  thenText: patch.thenText ?? candidate.thenText,
                }),
              }
            : candidate,
        ),
        updatedAt: Date.now(),
      }));
    },
    [commitSession],
  );

  const removeCandidate = useCallback(
    (candidateId: string) => {
      commitSession((current) => ({
        ...current,
        candidates: current.candidates.map((candidate) =>
          candidate.id === candidateId ? { ...candidate, status: 'removed' } : candidate,
        ),
        updatedAt: Date.now(),
      }));
    },
    [commitSession],
  );

  const moveToRefinementVoting = useCallback(async () => {
    if (!window.electronAPI?.setClassroomAgreementPhase) return;
    const result = await window.electronAPI.setClassroomAgreementPhase({
      command: 'start-refinement-voting',
    });
    setSession((prev) => (prev ? { ...prev, phase: result.phase } : prev));
  }, []);

  const moveBackToTeacherReview = useCallback(async () => {
    if (!window.electronAPI?.setClassroomAgreementPhase) return;
    const result = await window.electronAPI.setClassroomAgreementPhase({
      command: 'start-teacher-review',
    });
    setSession((prev) => (prev ? { ...prev, phase: result.phase } : prev));
  }, []);

  const moveToPriorityVoting = useCallback(async () => {
    if (!window.electronAPI?.setClassroomAgreementPhase) return;
    const result = await window.electronAPI.setClassroomAgreementPhase({
      command: 'start-priority-voting',
    });
    setSession((prev) => (prev ? { ...prev, phase: result.phase } : prev));
  }, []);

  const finalizeResults = useCallback(async () => {
    if (!session || !window.electronAPI?.setClassroomAgreementPhase) return;
    const finalItems = buildFinalItemsFromCandidates(session.candidates, session.scenes);
    const nextSession: ClassroomAgreementSession = {
      ...session,
      candidates: session.candidates.map((candidate) =>
        candidate.status === 'active' ? { ...candidate, status: 'finalized' } : candidate,
      ),
      finalItems,
      updatedAt: Date.now(),
    };
    setSession(nextSession);
    await window.electronAPI?.updateClassroomAgreementSession?.({ session: nextSession });
    const result = await window.electronAPI.setClassroomAgreementPhase({ command: 'finalize' });
    setSession({ ...nextSession, phase: result.phase });
  }, [session]);

  const copyResults = useCallback(async () => {
    if (!session) return;
    try {
      await navigator.clipboard.writeText(
        formatClassroomAgreementCopyText(
          session.finalItems,
          session.title,
          session.classContext.label,
        ),
      );
      setSaveNotice('완성된 약속을 클립보드에 복사했습니다.');
    } catch {
      setSaveNotice('복사에 실패했습니다. 화면에서 직접 선택해 복사해 주세요.');
    }
  }, [session]);

  const printResults = useCallback(() => {
    window.print();
  }, []);

  const saveResults = useCallback(async () => {
    if (!session) return;
    if (session.settings.saveMode === 'includeProcess') {
      const ok = window.confirm(
        '과정 포함 저장은 학생 이름/닉네임, 제안, 투표 과정이 함께 저장됩니다. 계속할까요?',
      );
      if (!ok) return;
    }
    await saveAgreementSession(session, session.settings.saveMode);
    setSaveNotice(
      session.settings.saveMode === 'finalOnly'
        ? '완성 약속만 앱에 저장했습니다.'
        : '과정을 포함해 앱에 저장했습니다.',
    );
  }, [saveAgreementSession, session]);

  return (
    <ToolLayout
      title="교실 약속 정하기"
      emoji="🤝"
      onBack={onBack}
      isFullscreen={isFullscreen}
      disableZoom
    >
      <div className="space-y-5">
        <section className="rounded-2xl border border-sp-border bg-sp-card p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-sp-accent">함께 만드는 실행 문장</p>
              <h2 className="mt-2 text-2xl font-bold text-sp-text">
                “만약 ___하면, 우리는 ___한다.”
              </h2>
              <p className="mt-2 text-sm leading-6 text-sp-muted">
                이 도구는 문장을 대신 만들어 주지 않습니다. 선생님과 학생이 장면을 고르고, 바로
                시작할 수 있는 행동으로 함께 다듬도록 돕습니다.
              </p>
            </div>
            <div className="min-w-[220px] rounded-2xl bg-sp-surface p-4">
              <p className="text-xs font-semibold text-sp-muted">현재 진행</p>
              <p className="mt-1 text-lg font-bold text-sp-text">
                {labelForTeacherStep(teacherStep)}
              </p>
              <p className="mt-2 text-xs leading-5 text-sp-muted">
                참여 {connectedStudents}명 · 제안 {session?.proposals.length ?? 0}개 · 후보{' '}
                {activeCandidates.length}개{serverInfo ? ` · 포트 ${serverInfo.port}` : ''}
              </p>
            </div>
          </div>
          <ClassroomAgreementStepIndicator currentStep={teacherStep} />
        </section>

        {error && (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </p>
        )}

        {teacherStep === 'setup' && (
          <ClassroomAgreementSavedResultsPanel
            savedSessions={savedSessions}
            onDelete={deleteAgreementSession}
          />
        )}

        {teacherStep === 'setup' && (
          <section className="rounded-2xl border border-sp-border bg-sp-card p-5">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-sp-accent">1단계 · 사전 설정</p>
              <h3 className="text-xl font-bold text-sp-text">
                교사와 학생이 함께 약속이 필요한 장면을 정해요
              </h3>
              <p className="text-sm leading-6 text-sp-muted">
                이 단계에서는 활동 조건만 정합니다. 학생 제안, 후보 다듬기, 투표 화면은 다음
                단계에서 차례로 열립니다.
              </p>
            </div>

            <div className="mt-5 grid gap-5">
              <div className="rounded-2xl border border-sp-border bg-sp-surface p-5">
                <h4 className="text-lg font-bold text-sp-text">약속 유형</h4>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {AGREEMENT_TYPE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setAgreementType(option.value)}
                      className={`rounded-xl border p-4 text-left transition ${
                        agreementType === option.value
                          ? 'border-sp-accent bg-sp-accent/10 text-sp-text'
                          : 'border-sp-border bg-sp-card text-sp-text hover:border-sp-accent/60'
                      }`}
                    >
                      <span className="text-base font-bold">{option.label}</span>
                      <span className="mt-2 block text-xs leading-5 text-sp-muted">
                        {option.description}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-sp-border bg-sp-surface p-5">
                <h4 className="text-lg font-bold text-sp-text">약속이 필요한 장면</h4>
                <div className="mt-4 flex flex-wrap gap-2">
                  {CLASSROOM_AGREEMENT_SCENES.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        setSelectedScenes((current) =>
                          current.includes(item)
                            ? current.filter((sceneLabel) => sceneLabel !== item)
                            : [...current, item],
                        );
                      }}
                      className={`rounded-full border px-3 py-2 text-sm transition ${
                        selectedScenes.includes(item)
                          ? 'border-sp-accent bg-sp-accent/10 text-sp-text'
                          : 'border-sp-border bg-sp-card text-sp-muted hover:text-sp-text'
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <label className="mt-4 block">
                  <span className="text-sm font-medium text-sp-text">직접 입력</span>
                  <input
                    value={customScene}
                    onChange={(event) => setCustomScene(event.target.value)}
                    placeholder="예: 실험 도구 정리"
                    className="mt-2 w-full rounded-xl border border-sp-border bg-sp-card px-4 py-3 text-sm text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none"
                  />
                </label>
              </div>

              <div className="rounded-2xl border border-sp-border bg-sp-surface p-5">
                <h4 className="text-lg font-bold text-sp-text">참여 방식</h4>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-medium text-sp-text">활동 제목</span>
                    <input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      className="mt-2 w-full rounded-xl border border-sp-border bg-sp-card px-4 py-3 text-sm text-sp-text focus:border-sp-accent focus:outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-sp-text">학급/수업 맥락</span>
                    <input
                      value={classContext.label}
                      onChange={(event) =>
                        setClassContext({ kind: 'manual', label: event.target.value })
                      }
                      placeholder="예: 3학년 2반, 5교시 국어"
                      className="mt-2 w-full rounded-xl border border-sp-border bg-sp-card px-4 py-3 text-sm text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-sp-text">학생 1명당 제안 수</span>
                    <select
                      value={maxProposalsPerStudent}
                      onChange={(event) => setMaxProposalsPerStudent(Number(event.target.value))}
                      className="mt-2 w-full rounded-xl border border-sp-border bg-sp-card px-4 py-3 text-sm text-sp-text focus:border-sp-accent focus:outline-none"
                    >
                      {[1, 2, 3].map((count) => (
                        <option key={count} value={count}>
                          {count}개
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-sp-text">중요 약속 선택 수</span>
                    <select
                      value={priorityVoteLimit}
                      onChange={(event) => setPriorityVoteLimit(Number(event.target.value))}
                      className="mt-2 w-full rounded-xl border border-sp-border bg-sp-card px-4 py-3 text-sm text-sp-text focus:border-sp-accent focus:outline-none"
                    >
                      {[1, 2, 3, 4, 5].map((count) => (
                        <option key={count} value={count}>
                          {count}개
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-sp-text">저장 방식 기본값</span>
                    <select
                      value={saveMode}
                      onChange={(event) =>
                        setSaveMode(event.target.value as ClassroomAgreementSaveMode)
                      }
                      className="mt-2 w-full rounded-xl border border-sp-border bg-sp-card px-4 py-3 text-sm text-sp-text focus:border-sp-accent focus:outline-none"
                    >
                      <option value="finalOnly">완성 약속만 저장</option>
                      <option value="includeProcess">과정 포함 저장</option>
                    </select>
                  </label>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <ToggleCard
                    checked={allowNickname}
                    onChange={setAllowNickname}
                    title="실명 또는 닉네임 참여 허용"
                    description="학생이 교실 상황에 맞는 이름으로 참여할 수 있어요."
                  />
                  <ToggleCard
                    checked={allowProposalsDuringReview}
                    onChange={setAllowProposalsDuringReview}
                    title="검토 중 추가 제안 허용"
                    description="교사 검토 단계에서도 필요한 제안을 더 받을 수 있어요."
                  />
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 rounded-2xl border border-sp-border bg-sp-surface p-5 lg:grid-cols-[1fr_auto] lg:items-center">
              <dl className="grid gap-2 text-sm md:grid-cols-2">
                <InfoRow label="유형" value={labelForAgreementType(previewSession.agreementType)} />
                <InfoRow label="맥락" value={previewSession.classContext.label} />
                <InfoRow label="장면" value={formatSessionSceneLabels(previewSession)} />
                <InfoRow label="제안 수" value={`학생 1명당 ${maxProposalsPerStudent}개`} />
                <InfoRow label="선택 수" value={`${priorityVoteLimit}개까지`} />
              </dl>
              <button
                type="button"
                onClick={handleStart}
                className="rounded-xl bg-sp-accent px-5 py-3 text-sm font-bold text-white transition hover:brightness-110"
              >
                링크 만들기
              </button>
            </div>
          </section>
        )}

        {teacherStep === 'share' && session && (
          <section className="rounded-2xl border border-sp-border bg-sp-card p-5">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div>
                <p className="text-sm font-semibold text-sp-accent">2단계 · 링크 공유</p>
                <h3 className="mt-1 text-xl font-bold text-sp-text">
                  학생들이 들어올 수 있도록 링크를 공유해요
                </h3>
                <p className="mt-2 text-sm leading-6 text-sp-muted">
                  이 단계에서는 학생이 참여 준비를 합니다. 교사가 시작하기 전까지 학생 제안은 열리지
                  않습니다.
                </p>
                <dl className="mt-5 grid gap-3 text-sm md:grid-cols-2">
                  <InfoRow label="활동 제목" value={session.title} />
                  <InfoRow label="맥락" value={session.classContext.label} />
                  <InfoRow label="장면" value={formatSessionSceneLabels(session)} />
                  <InfoRow label="참여 학생" value={`${connectedStudents}명 연결`} />
                  <InfoRow label="학생 제안" value="대기 중" />
                </dl>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={moveToCollecting}
                    disabled={tunnelLoading || !studentUrl}
                    className="rounded-xl bg-sp-accent px-5 py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    학생 제안 시작
                  </button>
                  <button
                    type="button"
                    onClick={handleStop}
                    className="rounded-xl border border-sp-border px-5 py-3 text-sm font-bold text-sp-text transition hover:bg-sp-surface"
                  >
                    세션 닫기
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-sp-border bg-sp-surface p-5">
                <h4 className="text-lg font-bold text-sp-text">학생 참여 링크</h4>
                {tunnelLoading ? (
                  <p className="mt-3 text-sm leading-6 text-sp-muted">
                    학생이 접속할 수 있는 링크와 QR을 준비하고 있습니다.
                  </p>
                ) : studentUrl ? (
                  <div className="mt-4 space-y-3">
                    {qrDataUrl && (
                      <img
                        src={qrDataUrl}
                        alt="교실 약속 정하기 참여 QR"
                        className="mx-auto rounded-xl bg-white p-2"
                      />
                    )}
                    <p className="break-all rounded-xl bg-sp-card p-3 text-xs text-sp-muted">
                      {studentUrl}
                    </p>
                    {shortCode && (
                      <p className="rounded-xl bg-sp-accent/10 px-3 py-2 text-xs font-bold text-sp-accent">
                        참여 코드: {shortCode}
                      </p>
                    )}
                    {shortUrl && tunnelUrl && shortUrl !== tunnelUrl && (
                      <p className="break-all text-xs text-sp-muted">원본 접속 주소: {tunnelUrl}</p>
                    )}
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="w-full rounded-xl border border-sp-border px-4 py-3 text-sm font-bold text-sp-text transition hover:bg-sp-card"
                    >
                      링크 복사
                    </button>
                  </div>
                ) : tunnelError ? (
                  <p className="mt-3 text-sm leading-6 text-red-500">{tunnelError}</p>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-sp-muted">
                    링크를 준비하는 중입니다. 잠시만 기다려 주세요.
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        {teacherStep === 'collect' && session && (
          <section className="rounded-2xl border border-sp-border bg-sp-card p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-semibold text-sp-accent">3단계 · 학생 제안</p>
                <h3 className="mt-1 text-xl font-bold text-sp-text">
                  학생들이 보낸 실행 문장을 모아요
                </h3>
                <p className="mt-2 text-sm leading-6 text-sp-muted">
                  제안은 막지 않고 모은 뒤, 교사가 함께 볼 후보로 올립니다.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={mergeSelectedProposals}
                  disabled={selectedProposalIds.length < 2}
                  className="rounded-xl border border-sp-border px-4 py-3 text-sm font-bold text-sp-text transition hover:bg-sp-surface disabled:cursor-not-allowed disabled:opacity-50"
                >
                  선택 합치기
                </button>
                <button
                  type="button"
                  onClick={moveToTeacherReview}
                  disabled={session.phase !== 'collecting'}
                  className="rounded-xl bg-sp-accent px-4 py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  약속 후보 다듬기로 이동
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <SummaryCard label="참여 학생" value={`${connectedStudents}명`} />
              <SummaryCard label="들어온 제안" value={`${session.proposals.length}개`} />
              <SummaryCard label="현재 장면 제안" value={`${activeSceneProposals.length}개`} />
              <SummaryCard label="후보로 올린 약속" value={`${activeCandidates.length}개`} />
            </div>

            <ActiveSceneSelector session={session} onChange={changeActiveScene} />

            <div className="mt-5 space-y-3">
              {activeSceneProposals.length === 0 ? (
                <p className="rounded-xl bg-sp-surface p-4 text-sm text-sp-muted">
                  현재 장면에는 아직 들어온 제안이 없습니다. 장면을 바꾸거나 학생 제안을 기다려
                  주세요.
                </p>
              ) : (
                activeSceneProposals.map((proposal) => (
                  <article
                    key={proposal.id}
                    className="rounded-xl border border-sp-border bg-sp-surface p-4"
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedProposalIds.includes(proposal.id)}
                        onChange={(event) => {
                          setSelectedProposalIds((current) =>
                            event.target.checked
                              ? [...current, proposal.id]
                              : current.filter((id) => id !== proposal.id),
                          );
                        }}
                        className="mt-1"
                        aria-label="합칠 제안 선택"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-sp-muted">
                          {proposal.displayName} · {getSceneLabel(session.scenes, proposal.sceneId)}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-sp-text">
                          {proposal.ifText}, {proposal.thenText}.
                        </p>
                        {proposal.promotedCandidateId && (
                          <p className="mt-2 text-xs text-sp-accent">후보로 올림</p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => promoteProposal(proposal)}
                      disabled={Boolean(proposal.promotedCandidateId)}
                      className="mt-3 rounded-lg bg-sp-accent px-3 py-2 text-xs font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      후보로 올리기
                    </button>
                  </article>
                ))
              )}
            </div>
          </section>
        )}

        {teacherStep === 'review' && session && (
          <section className="rounded-2xl border border-sp-border bg-sp-card p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-semibold text-sp-accent">4단계 · 약속 후보 다듬기</p>
                <h3 className="mt-1 text-xl font-bold text-sp-text">
                  함께 실행할 수 있는 문장으로 정리해요
                </h3>
                <p className="mt-2 text-sm leading-6 text-sp-muted">
                  정답을 고르는 시간이 아니라, 바로 시작할 수 있는 공동 약속으로 다듬는 시간입니다.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={moveToCollecting}
                  className="rounded-xl border border-sp-border px-4 py-3 text-sm font-bold text-sp-text transition hover:bg-sp-surface"
                >
                  학생 제안으로 돌아가기
                </button>
                <button
                  type="button"
                  onClick={moveToRefinementVoting}
                  disabled={!hasActiveCandidates}
                  className="rounded-xl bg-sp-accent px-4 py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  의견 확인 투표 시작
                </button>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {!hasActiveCandidates ? (
                <p className="rounded-xl bg-sp-surface p-4 text-sm text-sp-muted">
                  아직 후보로 올린 약속이 없습니다. 학생 제안 단계로 돌아가 후보를 먼저 골라 주세요.
                </p>
              ) : (
                activeCandidates.map((candidate) => (
                  <CandidateEditor
                    key={candidate.id}
                    candidate={candidate}
                    sceneLabel={getSceneLabel(session.scenes, candidate.sceneId)}
                    onChange={updateCandidate}
                    onRemove={removeCandidate}
                  />
                ))
              )}
            </div>
          </section>
        )}

        {teacherStep === 'vote' && session && (
          <section className="rounded-2xl border border-sp-border bg-sp-card p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-semibold text-sp-accent">5단계 · 투표</p>
                <h3 className="mt-1 text-xl font-bold text-sp-text">
                  {session.phase === 'refinementVoting'
                    ? '실행 가능 여부를 함께 확인해요'
                    : '먼저 실천할 약속을 선택해요'}
                </h3>
                <p className="mt-2 text-sm leading-6 text-sp-muted">
                  {session.phase === 'refinementVoting'
                    ? '학생들은 각 후보가 바로 실행하기 좋은지 의견을 남깁니다.'
                    : `학생들은 중요한 약속을 ${session.settings.priorityVoteLimit}개까지 고릅니다.`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {session.phase === 'refinementVoting' ? (
                  <>
                    <button
                      type="button"
                      onClick={moveBackToTeacherReview}
                      className="rounded-xl border border-sp-border px-4 py-3 text-sm font-bold text-sp-text transition hover:bg-sp-surface"
                    >
                      후보 더 다듬기
                    </button>
                    <button
                      type="button"
                      onClick={moveToPriorityVoting}
                      className="rounded-xl bg-sp-accent px-4 py-3 text-sm font-bold text-white transition hover:brightness-110"
                    >
                      중요 약속 선택 시작
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={moveBackToTeacherReview}
                      className="rounded-xl border border-sp-border px-4 py-3 text-sm font-bold text-sp-text transition hover:bg-sp-surface"
                    >
                      후보 다듬기로 돌아가기
                    </button>
                    <button
                      type="button"
                      onClick={finalizeResults}
                      className="rounded-xl bg-sp-accent px-4 py-3 text-sm font-bold text-white transition hover:brightness-110"
                    >
                      결과 확정
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <SummaryCard label="참여 학생" value={`${connectedStudents}명`} />
              <SummaryCard label="약속 후보" value={`${activeCandidates.length}개`} />
              <SummaryCard
                label={session.phase === 'refinementVoting' ? '의견 수' : '중요 선택 수'}
                value={`${countCandidateVotes(activeCandidates, session.phase)}개`}
              />
            </div>

            <div className="mt-5 space-y-3">
              {activeCandidates.map((candidate) => (
                <CandidateVoteSummary
                  key={candidate.id}
                  candidate={candidate}
                  sceneLabel={getSceneLabel(session.scenes, candidate.sceneId)}
                />
              ))}
            </div>
          </section>
        )}

        {teacherStep === 'final' && session && (
          <section className="rounded-2xl border border-sp-border bg-sp-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-sp-accent">6단계 · 최종 카드</p>
                <h3 className="mt-1 text-xl font-bold text-sp-text">{session.title}</h3>
                <p className="mt-2 text-sm text-sp-muted">
                  완성된 약속을 학급 게시, 모둠 활동, 수업 루틴에 맞게 확인합니다.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(['list', 'cards', 'group', 'lesson'] as const).map((view) => (
                  <button
                    key={view}
                    type="button"
                    onClick={() => setResultView(view)}
                    className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${
                      resultView === view
                        ? 'border-sp-accent bg-sp-accent/10 text-sp-text'
                        : 'border-sp-border text-sp-muted hover:text-sp-text'
                    }`}
                  >
                    {resultViewLabel(view)}
                  </button>
                ))}
              </div>
            </div>

            <ClassroomAgreementResultView
              title={session.title}
              classContextLabel={session.classContext.label}
              view={resultView}
              finalScenes={session.finalItems}
            />

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={copyResults}
                className="rounded-xl border border-sp-border px-4 py-3 text-sm font-bold text-sp-text transition hover:bg-sp-surface"
              >
                복사하기
              </button>
              <button
                type="button"
                onClick={printResults}
                className="rounded-xl border border-sp-border px-4 py-3 text-sm font-bold text-sp-text transition hover:bg-sp-surface"
              >
                인쇄하기
              </button>
              <button
                type="button"
                onClick={saveResults}
                className="rounded-xl bg-sp-accent px-4 py-3 text-sm font-bold text-white transition hover:brightness-110"
              >
                앱에 저장
              </button>
            </div>
            {saveNotice && <p className="mt-3 text-sm text-sp-muted">{saveNotice}</p>}
          </section>
        )}
      </div>
    </ToolLayout>
  );
}

function normalizeSceneLabels(labels: readonly string[]): string[] {
  const normalized = labels.map((label) => label.trim()).filter(Boolean);
  const deduped = [...new Set(normalized)];
  return deduped.length > 0 ? deduped : [CLASSROOM_AGREEMENT_SCENES[0]];
}

function createClassroomAgreementScenes(
  labels: readonly string[],
  makeId: () => string,
): ClassroomAgreementScene[] {
  return normalizeSceneLabels(labels).map((label, index) => ({
    id: makeId(),
    label,
    order: index + 1,
  }));
}

function formatSceneLabels(labels: readonly string[]): string {
  return normalizeSceneLabels(labels).join(', ');
}

function formatSessionSceneLabels(session: Pick<ClassroomAgreementSession, 'scenes'>): string {
  return formatSceneLabels(session.scenes.map((scene) => scene.label));
}

function getSceneLabel(scenes: readonly ClassroomAgreementScene[], sceneId: string): string {
  return scenes.find((scene) => scene.id === sceneId)?.label ?? '알 수 없는 장면';
}

function formatFinalSceneLabels(finalScenes: readonly AgreementFinalScene[]): string {
  return finalScenes.map((scene) => scene.sceneLabel).join(', ') || CLASSROOM_AGREEMENT_SCENES[0];
}

function formatSavedSessionSceneLabels(
  session: Pick<ClassroomAgreementSavedSession, 'scenes' | 'finalItems'>,
): string {
  return formatSceneLabels(
    session.scenes.length > 0
      ? session.scenes.map((scene) => scene.label)
      : session.finalItems.map((scene) => scene.sceneLabel),
  );
}

export function createClassroomAgreementSession(
  input: ClassroomAgreementSetupInput,
  now: () => number,
  makeId: () => string,
): ClassroomAgreementSession {
  const timestamp = now();
  const sceneEntities = createClassroomAgreementScenes(input.scenes, makeId);
  return {
    schemaVersion: CLASSROOM_AGREEMENT_SCHEMA_VERSION,
    id: makeId(),
    title: input.title.trim() || '교실 약속 정하기',
    agreementType: input.agreementType,
    classContext: {
      ...input.classContext,
      label: input.classContext.label.trim() || '우리 반',
    },
    scenes: sceneEntities,
    activeSceneId: sceneEntities[0]!.id,
    phase: 'setup',
    settings: {
      maxProposalsPerStudent: input.maxProposalsPerStudent,
      priorityVoteLimit: input.priorityVoteLimit,
      allowNickname: input.allowNickname,
      defaultShowAuthor: false,
      allowProposalsDuringReview: input.allowProposalsDuringReview,
      saveMode: input.saveMode,
    },
    participants: [],
    proposals: [],
    candidates: [],
    finalItems: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function deriveClassroomAgreementTeacherStep(
  session: ClassroomAgreementSession | null,
): ClassroomAgreementTeacherStep {
  if (!session) return 'setup';
  if (session.phase === 'setup') return 'share';
  if (session.phase === 'collecting') return 'collect';
  if (session.phase === 'teacherReview') return 'review';
  if (session.phase === 'refinementVoting' || session.phase === 'priorityVoting') return 'vote';
  return 'final';
}

export function buildClassroomAgreementStudentUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('tool', 'classroom-agreement');
  return url.toString();
}

export function createCandidateFromProposal(
  proposal: ClassroomAgreementProposal,
  showAuthors: boolean,
  _now: () => number,
  makeId: () => string,
): ClassroomAgreementCandidate {
  return {
    id: makeId(),
    sceneId: proposal.sceneId,
    sourceProposalIds: [proposal.id],
    authorLabels: [proposal.displayName],
    ifText: proposal.ifText,
    thenText: proposal.thenText,
    showAuthors,
    validationIssues: validateAgreementDraft({
      ifText: proposal.ifText,
      thenText: proposal.thenText,
    }),
    refinementVotes: [],
    priorityVotes: [],
    status: 'active',
  };
}

export function mergeProposalsIntoCandidate(
  proposals: readonly ClassroomAgreementProposal[],
  _now: () => number,
  makeId: () => string,
): ClassroomAgreementCandidate {
  const [first] = proposals;
  if (!first) {
    throw new Error('mergeProposalsIntoCandidate requires at least one proposal');
  }
  const authorLabels = [...new Set(proposals.map((proposal) => proposal.displayName))];
  return {
    id: makeId(),
    sceneId: first.sceneId,
    sourceProposalIds: proposals.map((proposal) => proposal.id),
    authorLabels,
    ifText: first.ifText,
    thenText: first.thenText,
    showAuthors: false,
    validationIssues: validateAgreementDraft({
      ifText: first.ifText,
      thenText: first.thenText,
    }),
    refinementVotes: [],
    priorityVotes: [],
    status: 'active',
  };
}

export function buildFinalItemsFromCandidates(
  candidates: readonly ClassroomAgreementCandidate[],
  scenes: readonly ClassroomAgreementScene[],
): AgreementFinalScene[] {
  return scenes.map((scene) => ({
    sceneId: scene.id,
    sceneLabel: scene.label,
    items: candidates
      .map((candidate, originalIndex) => ({ candidate, originalIndex }))
      .filter(({ candidate }) => candidate.status !== 'removed' && candidate.sceneId === scene.id)
      .sort(
        (left, right) =>
          right.candidate.priorityVotes.length - left.candidate.priorityVotes.length ||
          left.originalIndex - right.originalIndex,
      )
      .map(({ candidate }, index) => ({
        id: candidate.id,
        sceneId: candidate.sceneId,
        ifText: normalizeSentencePart(candidate.ifText),
        thenText: normalizeSentencePart(candidate.thenText),
        showAuthors: candidate.showAuthors,
        authorLabels: candidate.showAuthors ? [...candidate.authorLabels] : [],
        priorityRank: index + 1,
      })),
  }));
}

export function formatClassroomAgreementCopyText(
  finalScenes: readonly AgreementFinalScene[],
  title = '완성된 교실 약속',
  classContextLabel?: string,
): string {
  const header = [title, classContextLabel ? `맥락: ${classContextLabel}` : null]
    .filter(Boolean)
    .join('\n');
  const lines = finalScenes.flatMap((scene) => {
    const allItems =
      scene.items.length > 0
        ? scene.items.map((item) => `- ${formatAgreementSentence(item)}${formatAuthorSuffix(item)}`)
        : ['- 완성된 약속이 없습니다.'];
    return [`장면: ${scene.sceneLabel}`, ...allItems];
  });

  return [header, ...lines].join('\n');
}

function resultViewLabel(view: ClassroomAgreementResultViewMode): string {
  if (view === 'cards') return '게시용 카드';
  if (view === 'group') return '모둠 약속지';
  if (view === 'lesson') return '수업 루틴지';
  return '문장 목록';
}

export function ClassroomAgreementResultView({
  title,
  classContextLabel,
  view,
  finalScenes,
}: {
  readonly title: string;
  readonly classContextLabel?: string;
  readonly view: ClassroomAgreementResultViewMode;
  readonly finalScenes: readonly AgreementFinalScene[];
}) {
  const allItems = finalScenes.flatMap((scene) => scene.items);
  if (view === 'cards') {
    return (
      <div className="mt-5 grid gap-3 print:grid-cols-2">
        {allItems.map((item) => (
          <article
            key={item.id}
            className="rounded-2xl border border-sp-border bg-sp-surface p-5 print:border-zinc-300 print:bg-white"
          >
            <p className="text-xs font-bold text-sp-accent">약속 {item.priorityRank}</p>
            <p className="mt-3 text-lg font-bold leading-8 text-sp-text print:text-black">
              {formatAgreementSentence(item)}
            </p>
            <AgreementAuthors item={item} />
          </article>
        ))}
      </div>
    );
  }

  if (view === 'group') {
    return (
      <section className="mt-5 rounded-2xl border border-sp-border bg-sp-surface p-5 print:border-zinc-300 print:bg-white">
        <p className="text-sm font-bold text-sp-accent">모둠 활동 약속지</p>
        <h4 className="mt-2 text-xl font-bold text-sp-text print:text-black">{title}</h4>
        <p className="mt-1 text-sm text-sp-muted print:text-zinc-600">
          {classContextLabel ? `맥락: ${classContextLabel} · ` : ''}장면:{' '}
          {formatFinalSceneLabels(finalScenes)}
        </p>
        <div className="mt-4 grid gap-3">
          {allItems.map((item) => (
            <article
              key={item.id}
              className="rounded-xl bg-sp-card p-4 print:border print:bg-white"
            >
              <p className="text-sm font-semibold text-sp-text print:text-black">
                {item.priorityRank}. {formatAgreementSentence(item)}
              </p>
              <AgreementAuthors item={item} />
            </article>
          ))}
        </div>
        <p className="mt-5 border-t border-dashed border-sp-border pt-4 text-sm text-sp-muted print:text-zinc-600">
          모둠 이름: ____________________ 함께 확인한 날: ____________________
        </p>
      </section>
    );
  }

  if (view === 'lesson') {
    return (
      <section className="mt-5 rounded-2xl border border-sp-border bg-sp-surface p-5 print:border-zinc-300 print:bg-white">
        <p className="text-sm font-bold text-sp-accent">수업 루틴 약속지</p>
        <h4 className="mt-2 text-xl font-bold text-sp-text print:text-black">{title}</h4>
        <p className="mt-1 text-sm text-sp-muted print:text-zinc-600">
          {classContextLabel ? `맥락: ${classContextLabel} · ` : ''}장면:{' '}
          {formatFinalSceneLabels(finalScenes)}
        </p>
        <ol className="mt-4 space-y-3">
          {allItems.map((item) => (
            <li key={item.id} className="rounded-xl bg-sp-card p-4 print:border print:bg-white">
              <p className="text-sm font-semibold text-sp-text print:text-black">
                루틴 {item.priorityRank}. {formatAgreementSentence(item)}
              </p>
              <AgreementAuthors item={item} />
            </li>
          ))}
        </ol>
      </section>
    );
  }

  return (
    <ol className="mt-5 space-y-3">
      {allItems.map((item) => (
        <li key={item.id} className="rounded-xl border border-sp-border bg-sp-surface p-4">
          <p className="text-sm font-semibold leading-6 text-sp-text">
            {item.priorityRank}. {formatAgreementSentence(item)}
          </p>
          <AgreementAuthors item={item} />
        </li>
      ))}
    </ol>
  );
}

export function ClassroomAgreementSavedResultsPanel({
  savedSessions,
  onDelete,
}: {
  readonly savedSessions: readonly ClassroomAgreementSavedSession[];
  readonly onDelete: (id: string) => void | Promise<void>;
}) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    savedSessions[0]?.id ?? null,
  );
  const selectedSession =
    savedSessions.find((item) => item.id === selectedSessionId) ?? savedSessions[0] ?? null;

  useEffect(() => {
    if (savedSessions.length === 0) {
      setSelectedSessionId(null);
      return;
    }
    if (!selectedSession || !savedSessions.some((item) => item.id === selectedSession.id)) {
      setSelectedSessionId(savedSessions[0]!.id);
    }
  }, [savedSessions, selectedSession]);

  return (
    <section className="rounded-2xl border border-sp-border bg-sp-card p-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold text-sp-accent">저장된 약속</p>
          <h3 className="mt-1 text-xl font-bold text-sp-text">
            저장한 교실 약속 결과를 다시 볼 수 있어요
          </h3>
          <p className="mt-2 text-sm leading-6 text-sp-muted">
            활동을 마친 뒤 앱에 저장한 약속은 여기에서 다시 확인하고 수업에 활용할 수 있습니다.
          </p>
        </div>
        <p className="rounded-full bg-sp-surface px-3 py-2 text-xs font-bold text-sp-muted">
          총 {savedSessions.length}개
        </p>
      </div>

      {savedSessions.length === 0 ? (
        <p className="mt-4 rounded-xl bg-sp-surface p-4 text-sm text-sp-muted">
          아직 저장된 약속이 없습니다. 활동을 마친 뒤 최종 카드에서 `앱에 저장`을 누르면 이곳에
          표시됩니다.
        </p>
      ) : (
        <div className="mt-5 grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-2">
            {savedSessions.map((saved) => {
              const isSelected = selectedSession?.id === saved.id;
              return (
                <button
                  key={saved.id}
                  type="button"
                  onClick={() => setSelectedSessionId(saved.id)}
                  className={`w-full rounded-xl border p-4 text-left transition ${
                    isSelected
                      ? 'border-sp-accent bg-sp-accent/10'
                      : 'border-sp-border bg-sp-surface hover:border-sp-accent/60'
                  }`}
                >
                  <span className="block text-sm font-bold text-sp-text">{saved.title}</span>
                  <span className="mt-2 block text-xs leading-5 text-sp-muted">
                    장면: {formatSavedSessionSceneLabels(saved)} ·{' '}
                    {formatSavedAgreementDate(saved.savedAt)}
                  </span>
                  <span className="mt-2 inline-flex rounded-full bg-sp-card px-2 py-1 text-[11px] font-bold text-sp-muted">
                    {labelForSaveMode(saved.saveMode)}
                  </span>
                </button>
              );
            })}
          </div>

          {selectedSession && (
            <article className="rounded-2xl border border-sp-border bg-sp-surface p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-bold text-sp-accent">
                    {labelForSaveMode(selectedSession.saveMode)}
                  </p>
                  <h4 className="mt-1 text-lg font-bold text-sp-text">{selectedSession.title}</h4>
                  <p className="mt-1 text-sm text-sp-muted">
                    맥락: {selectedSession.classContext.label} · 장면:{' '}
                    {formatSavedSessionSceneLabels(selectedSession)} · 저장:{' '}
                    {formatSavedAgreementDate(selectedSession.savedAt)}
                  </p>
                  {selectedSession.process && (
                    <p className="mt-2 text-xs text-sp-muted">
                      참여 {selectedSession.process.participants.length}명 · 제안{' '}
                      {selectedSession.process.proposals.length}개 · 후보{' '}
                      {selectedSession.process.candidates.length}개
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const ok = window.confirm('저장된 교실 약속 결과를 삭제할까요?');
                    if (ok) void onDelete(selectedSession.id);
                  }}
                  className="rounded-xl border border-red-500/40 px-3 py-2 text-xs font-bold text-red-500 transition hover:bg-red-500/10"
                >
                  삭제
                </button>
              </div>

              <ClassroomAgreementResultView
                title={selectedSession.title}
                classContextLabel={selectedSession.classContext.label}
                view="list"
                finalScenes={selectedSession.finalItems}
              />
            </article>
          )}
        </div>
      )}
    </section>
  );
}

function labelForSaveMode(saveMode: ClassroomAgreementSaveMode): string {
  return saveMode === 'includeProcess' ? '과정 포함' : '완성 약속만';
}

function formatSavedAgreementDate(savedAt: number): string {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(savedAt));
}

function AgreementAuthors({ item }: { readonly item: AgreementFinalItem }) {
  if (!item.showAuthors || item.authorLabels.length === 0) return null;
  return <p className="mt-2 text-xs text-sp-muted">참여: {item.authorLabels.join(', ')}</p>;
}

function formatAgreementSentence(item: Pick<AgreementFinalItem, 'ifText' | 'thenText'>): string {
  return `${normalizeSentencePart(item.ifText)}, ${normalizeSentencePart(item.thenText)}.`;
}

function formatAuthorSuffix(item: AgreementFinalItem): string {
  if (!item.showAuthors || item.authorLabels.length === 0) return '';
  return ` (참여: ${item.authorLabels.join(', ')})`;
}

function normalizeSentencePart(text: string): string {
  return text.trim().replace(/[.,!?。！？]+$/u, '');
}

function makeBrowserId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `classroom-agreement-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function labelForAgreementType(type: ClassroomAgreementType): string {
  return AGREEMENT_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? '학급 규칙';
}

function labelForTeacherStep(step: ClassroomAgreementTeacherStep): string {
  return TEACHER_FLOW_STEPS.find((item) => item.id === step)?.label ?? '사전 설정';
}

function ClassroomAgreementStepIndicator({
  currentStep,
}: {
  readonly currentStep: ClassroomAgreementTeacherStep;
}) {
  const currentIndex = TEACHER_FLOW_STEPS.findIndex((step) => step.id === currentStep);
  return (
    <ol className="mt-5 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
      {TEACHER_FLOW_STEPS.map((step, index) => {
        const isActive = step.id === currentStep;
        const isDone = index < currentIndex;
        return (
          <li
            key={step.id}
            className={`rounded-2xl border p-3 ${
              isActive
                ? 'border-sp-accent bg-sp-accent/10'
                : isDone
                  ? 'border-sp-border bg-sp-surface'
                  : 'border-sp-border bg-sp-card'
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`flex size-6 items-center justify-center rounded-full text-xs font-bold ${
                  isActive || isDone ? 'bg-sp-accent text-white' : 'bg-sp-surface text-sp-muted'
                }`}
              >
                {isDone ? '✓' : index + 1}
              </span>
              <span className="text-sm font-bold text-sp-text">{step.label}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-sp-muted">{step.description}</p>
          </li>
        );
      })}
    </ol>
  );
}

function SummaryCard({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-2xl border border-sp-border bg-sp-surface p-4">
      <p className="text-xs font-semibold text-sp-muted">{label}</p>
      <p className="mt-1 text-xl font-bold text-sp-text">{value}</p>
    </div>
  );
}

function ActiveSceneSelector({
  session,
  onChange,
}: {
  readonly session: ClassroomAgreementSession;
  readonly onChange: (sceneId: string) => void;
}) {
  return (
    <div className="mt-5 rounded-2xl border border-sp-border bg-sp-surface p-4">
      <p className="text-xs font-semibold text-sp-muted">현재 열려 있는 장면</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {session.scenes.map((scene) => {
          const isActive = scene.id === session.activeSceneId;
          return (
            <button
              key={scene.id}
              type="button"
              onClick={() => onChange(scene.id)}
              aria-pressed={isActive}
              className={`rounded-xl border px-4 py-2 text-sm font-bold transition ${
                isActive
                  ? 'border-sp-accent bg-sp-accent/10 text-sp-text'
                  : 'border-sp-border bg-sp-card text-sp-muted hover:border-sp-accent/60 hover:text-sp-text'
              }`}
            >
              {scene.order}. {scene.label}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs leading-5 text-sp-muted">
        선택한 장면이 학생 화면에 열리고, 새 제안은 해당 장면으로 모입니다.
      </p>
    </div>
  );
}

function countCandidateVotes(
  candidates: readonly ClassroomAgreementCandidate[],
  phase: ClassroomAgreementSession['phase'],
): number {
  if (phase === 'priorityVoting') {
    return candidates.reduce((sum, candidate) => sum + candidate.priorityVotes.length, 0);
  }
  return candidates.reduce((sum, candidate) => sum + candidate.refinementVotes.length, 0);
}

function ToggleCard({
  checked,
  onChange,
  title,
  description,
}: {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly title: string;
  readonly description: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`rounded-xl border p-4 text-left transition ${
        checked
          ? 'border-sp-accent bg-sp-accent/10'
          : 'border-sp-border bg-sp-surface hover:border-sp-accent/60'
      }`}
    >
      <span className="flex items-center gap-2 text-sm font-bold text-sp-text">
        <span className="material-symbols-outlined text-icon-md">
          {checked ? 'check_circle' : 'radio_button_unchecked'}
        </span>
        {title}
      </span>
      <span className="mt-2 block text-xs leading-5 text-sp-muted">{description}</span>
    </button>
  );
}

function InfoRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-sp-muted">{label}</dt>
      <dd className="text-right font-medium text-sp-text">{value}</dd>
    </div>
  );
}

function CandidateEditor({
  candidate,
  sceneLabel,
  onChange,
  onRemove,
}: {
  readonly candidate: ClassroomAgreementCandidate;
  readonly sceneLabel: string;
  readonly onChange: (candidateId: string, patch: Partial<ClassroomAgreementCandidate>) => void;
  readonly onRemove: (candidateId: string) => void;
}) {
  return (
    <article className="rounded-xl border border-sp-border bg-sp-surface p-4">
      <p className="mb-3 text-xs font-semibold text-sp-accent">장면: {sceneLabel}</p>
      <div className="grid gap-3">
        <label className="block">
          <span className="text-xs font-semibold text-sp-muted">만약 상황</span>
          <textarea
            value={candidate.ifText}
            onChange={(event) =>
              onChange(candidate.id, {
                ifText: event.target.value,
                showAuthors: false,
              })
            }
            rows={2}
            className="mt-1 w-full rounded-lg border border-sp-border bg-sp-card px-3 py-2 text-sm text-sp-text focus:border-sp-accent focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-sp-muted">그러면 행동</span>
          <textarea
            value={candidate.thenText}
            onChange={(event) =>
              onChange(candidate.id, {
                thenText: event.target.value,
                showAuthors: false,
              })
            }
            rows={2}
            className="mt-1 w-full rounded-lg border border-sp-border bg-sp-card px-3 py-2 text-sm text-sp-text focus:border-sp-accent focus:outline-none"
          />
        </label>
      </div>

      {candidate.validationIssues.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3">
          <p className="text-xs font-bold text-amber-200">규칙 기반 점검</p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-amber-100">
            {candidate.validationIssues.map((issue, index) => (
              <li key={`${issue.code}-${index}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg bg-sp-card p-2">
          <p className="font-bold text-sp-text">
            {candidate.refinementVotes.filter((vote) => vote.value === 'agree').length}
          </p>
          <p className="text-sp-muted">실행 가능</p>
        </div>
        <div className="rounded-lg bg-sp-card p-2">
          <p className="font-bold text-sp-text">
            {candidate.refinementVotes.filter((vote) => vote.value === 'needsWork').length}
          </p>
          <p className="text-sp-muted">더 다듬기</p>
        </div>
        <div className="rounded-lg bg-sp-card p-2">
          <p className="font-bold text-sp-text">{candidate.priorityVotes.length}</p>
          <p className="text-sp-muted">중요 선택</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onChange(candidate.id, { showAuthors: !candidate.showAuthors })}
          className="rounded-lg border border-sp-border px-3 py-2 text-xs font-bold text-sp-text transition hover:bg-sp-card"
        >
          작성자 {candidate.showAuthors ? '표시 중' : '숨김'}
        </button>
        <span className="text-xs text-sp-muted">
          {candidate.authorLabels.length > 0
            ? `참여: ${candidate.authorLabels.join(', ')}`
            : '참여자 없음'}
        </span>
        <button
          type="button"
          onClick={() => onRemove(candidate.id)}
          className="rounded-lg border border-red-500/30 px-3 py-2 text-xs font-bold text-red-300 transition hover:bg-red-500/10"
        >
          후보에서 빼기
        </button>
      </div>
    </article>
  );
}

function CandidateVoteSummary({
  candidate,
  sceneLabel,
}: {
  readonly candidate: ClassroomAgreementCandidate;
  readonly sceneLabel: string;
}) {
  return (
    <article className="rounded-xl border border-sp-border bg-sp-surface p-4">
      <p className="mb-2 text-xs font-semibold text-sp-accent">장면: {sceneLabel}</p>
      <p className="text-sm font-semibold leading-6 text-sp-text">
        {normalizeSentencePart(candidate.ifText)}, {normalizeSentencePart(candidate.thenText)}.
      </p>
      {candidate.showAuthors && candidate.authorLabels.length > 0 && (
        <p className="mt-2 text-xs text-sp-muted">참여: {candidate.authorLabels.join(', ')}</p>
      )}
      {candidate.validationIssues.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3">
          <p className="text-xs font-bold text-amber-200">규칙 기반 점검</p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-amber-100">
            {candidate.validationIssues.map((issue, index) => (
              <li key={`${issue.code}-${index}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg bg-sp-card p-2">
          <p className="font-bold text-sp-text">
            {candidate.refinementVotes.filter((vote) => vote.value === 'agree').length}
          </p>
          <p className="text-sp-muted">실행 가능</p>
        </div>
        <div className="rounded-lg bg-sp-card p-2">
          <p className="font-bold text-sp-text">
            {candidate.refinementVotes.filter((vote) => vote.value === 'needsWork').length}
          </p>
          <p className="text-sp-muted">더 다듬기</p>
        </div>
        <div className="rounded-lg bg-sp-card p-2">
          <p className="font-bold text-sp-text">{candidate.priorityVotes.length}</p>
          <p className="text-sp-muted">중요 선택</p>
        </div>
      </div>
    </article>
  );
}
