// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { RecordMapProposalData } from '@domain/entities/RecordMapProposal';
import type { RecordEvidence } from '@domain/entities/RecordEvidence';
import type { InquiryThread } from '@domain/entities/InquiryThread';
import type { RecordArea } from '@domain/entities/RecordDraft';
import type { RecordMapApplication } from '@domain/entities/RecordMapApplication';
import { recordMapSourceFingerprint } from '@domain/rules/recordMapApplication';
import { academicTermForDate } from '@domain/rules/academicCalendar';
import {
  RecordMapBatchPanel,
  recordMapFailureLabel,
  recordMapScaffoldDisplayName,
} from '../RecordMapBatchPanel';
import { useRecordMapRunStore } from '@adapters/stores/useRecordMapRunStore';
import { askOnce } from '../ownAiRun';
import { recordMapApplicationPort, recordMapProposalRepository } from '@adapters/di/container';

const H = vi.hoisted(() => ({
  data: null as RecordMapProposalData | null,
  evidences: [
    {
      id: 'e-1',
      studentRef: 's-1',
      classId: 'class-1',
      areas: ['subject'],
      content: '첫 근거',
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 'e-2',
      studentRef: 's-2',
      classId: 'class-1',
      areas: ['subject'],
      content: '둘째 근거',
      createdAt: 2,
      updatedAt: 2,
    },
  ] as RecordEvidence[],
  threads: [] as InquiryThread[],
  applications: [] as RecordMapApplication[],
}));

vi.mock('@adapters/di/container', () => ({
  recordMapProposalRepository: {
    getRecordMapProposals: vi.fn(async () => H.data),
    updateRecordMapProposals: vi.fn(
      async (update: (current: RecordMapProposalData) => RecordMapProposalData) => {
        const current = H.data ?? { schemaVersion: 1 as const, runs: [], proposals: [] };
        H.data = update(current);
        return H.data;
      },
    ),
  },
  recordMapApplicationPort: {
    loadEvidence: vi.fn(async () => ({ records: H.evidences })),
    loadThreads: vi.fn(async () => ({ records: H.threads })),
    loadEvidenceSnapshot: vi.fn(async () => ({
      raw: { records: H.evidences },
      data: { records: H.evidences },
    })),
    loadThreadsSnapshot: vi.fn(async () => ({
      raw: { records: H.threads },
      data: { records: H.threads },
    })),
    replaceEvidence: vi.fn(async () => ({ kind: 'written' as const })),
    replaceThreads: vi.fn(async () => ({ kind: 'written' as const })),
    loadApplications: vi.fn(async () => ({ schemaVersion: 1, applications: H.applications })),
    upsertApplication: vi.fn(async () => undefined),
  },
}));

vi.mock('@adapters/stores/useRecordEvidenceStore', () => ({
  useRecordEvidenceStore: Object.assign(
    vi.fn((selector: (state: { records: typeof H.evidences }) => unknown) =>
      selector({ records: H.evidences }),
    ),
    { getState: () => ({ records: H.evidences, forceReload: vi.fn(async () => undefined) }) },
  ),
}));

vi.mock('@adapters/stores/useInquiryThreadStore', () => ({
  useInquiryThreadStore: Object.assign(
    vi.fn((selector: (state: { records: typeof H.threads }) => unknown) =>
      selector({ records: H.threads }),
    ),
    { getState: () => ({ records: H.threads, forceReload: vi.fn(async () => undefined) }) },
  ),
}));

vi.mock('../ownAiRun', () => ({
  runApi: () => ({ run: vi.fn(), onEvent: vi.fn() }),
  askOnce: vi.fn(async () => '{"topics":[]}'),
}));

const scaffold = {
  id: 'builtin:default',
  name: '기본 뼈대',
  frame: 'inquiry' as const,
  scenes: [{ role: 'evaluation' as const, moduleId: 'teacherJudgement' as const }],
  builtIn: true,
};

function panel() {
  return render(
    <RecordMapBatchPanel
      students={[
        { studentRef: 's-1', number: 7, name: '김하나' },
        { studentRef: 's-2', number: 12, name: '박두리' },
        { studentRef: 's-3', number: 19, name: '이세나' },
      ]}
      currentStudentRef="s-1"
      classId="class-1"
      className="1학년 2반"
      classSubject="국어"
      areas={['subject']}
      initialArea="subject"
      provider="codex"
      roster={[]}
      scaffoldConfigurationForArea={() => ({
        candidates: [scaffold],
        defaultScaffold: scaffold,
      })}
      onClose={() => useRecordMapRunStore.getState().close()}
    />,
  );
}

function seedProposalData(options?: {
  readonly reviewStatus?: 'unreviewed' | 'reviewed' | 'applied';
  readonly runStatus?: 'generated' | 'generating';
  readonly sourceFingerprint?: string;
}): void {
  const context = { studentRef: 's-1', classId: 'class-1', area: 'subject' as const };
  const runStatus = options?.runStatus ?? 'generated';
  H.data = {
    schemaVersion: 1,
    runs: [
      {
        schemaVersion: 1,
        runId: 'run-visible',
        targetMode: 'current',
        targetContexts: [context],
        lifecycle: runStatus === 'generating' ? 'running' : 'completed',
        items: [{ context, runStatus, updatedAt: 1 }],
        reviewPace: { kind: 'one' },
        scaffoldPolicy: { kind: 'existing', defaultScaffold: scaffold },
        provider: 'codex',
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    proposals:
      runStatus === 'generating'
        ? []
        : [
            {
              schemaVersion: 1,
              runId: 'run-visible',
              attemptId: 'attempt-visible',
              context,
              sourceFingerprint: options?.sourceFingerprint ?? 'fingerprint',
              topics: [
                {
                  id: 'tmp:topic-1',
                  title: '읽기 전략',
                  status: 'open',
                  scenes: [
                    {
                      id: 'tmp:scene-1',
                      role: 'evaluation',
                      moduleId: 'teacherJudgement',
                      evidenceIds: ['e-1'],
                    },
                  ],
                  scaffold: { scaffoldId: scaffold.id },
                },
              ],
              unplacedEvidence: [],
              warnings: [],
              runStatus: 'generated',
              reviewStatus: options?.reviewStatus ?? 'unreviewed',
              createdAt: 1,
              updatedAt: 1,
            },
          ],
  };
  useRecordMapRunStore.setState({ activeRunId: 'run-visible', focusedStudentRef: 's-1' });
}

function storedRun(
  runId: string,
  classId: string,
  area: RecordArea,
  updatedAt: number,
): RecordMapProposalData['runs'][number] {
  const context = { studentRef: 's-1', classId, area };
  return {
    schemaVersion: 1,
    runId,
    targetMode: 'current',
    targetContexts: [context],
    lifecycle: 'stopped',
    items: [{ context, runStatus: 'cancelled', updatedAt }],
    reviewPace: { kind: 'one' },
    scaffoldPolicy: { kind: 'existing', defaultScaffold: scaffold },
    provider: 'codex',
    createdAt: updatedAt,
    updatedAt,
  };
}

describe('RecordMapBatchPanel', () => {
  afterEach(cleanup);
  beforeEach(() => {
    H.data = null;
    H.applications = [];
    vi.mocked(recordMapApplicationPort.loadApplications)
      .mockReset()
      .mockImplementation(async () => ({ schemaVersion: 1, applications: H.applications }));
    vi.mocked(recordMapApplicationPort.loadEvidence)
      .mockReset()
      .mockImplementation(async () => ({ records: H.evidences as readonly RecordEvidence[] }));
    vi.mocked(recordMapApplicationPort.loadThreads)
      .mockReset()
      .mockImplementation(async () => ({ records: H.threads }));
    vi.mocked(recordMapApplicationPort.loadEvidenceSnapshot)
      .mockReset()
      .mockImplementation(async () => ({
        raw: { records: H.evidences },
        data: { records: H.evidences },
      }));
    vi.mocked(recordMapApplicationPort.loadThreadsSnapshot)
      .mockReset()
      .mockImplementation(async () => ({
        raw: { records: H.threads },
        data: { records: H.threads },
      }));
    vi.mocked(recordMapApplicationPort.upsertApplication)
      .mockReset()
      .mockImplementation(async (application) => {
        H.applications = [
          ...H.applications.filter((item) => item.id !== application.id),
          application,
        ];
      });
    vi.mocked(recordMapApplicationPort.replaceEvidence)
      .mockReset()
      .mockImplementation(async (_expected, next) => {
        H.evidences = [...next.records];
        return { kind: 'written' };
      });
    vi.mocked(recordMapApplicationPort.replaceThreads)
      .mockReset()
      .mockImplementation(async (_expected, next) => {
        H.threads = [...next.records];
        return { kind: 'written' };
      });
    vi.mocked(recordMapProposalRepository.updateRecordMapProposals)
      .mockReset()
      .mockImplementation(async (update) => {
        const current = H.data ?? { schemaVersion: 1 as const, runs: [], proposals: [] };
        H.data = update(current);
        return H.data;
      });
    vi.mocked(askOnce).mockReset().mockResolvedValue('{"topics":[]}');
    useRecordMapRunStore.setState({
      open: true,
      contextKey: 'teaching:class-1:subject',
      targetMode: 'current',
      selectedStudentRefs: ['s-1'],
      reviewPaceKind: 'one',
      batchSize: '3',
      scaffoldMode: 'existing',
      scaffoldId: null,
      area: 'subject',
      activeRunId: null,
      focusedStudentRef: 's-1',
    });
  });

  it('직접 선택에서 검색 결과 전체와 반 전체를 구분하고 실제 출석번호를 보인다', () => {
    panel();
    fireEvent.click(screen.getAllByRole('radio', { name: '직접 선택' })[0]!);
    fireEvent.change(screen.getByRole('textbox', { name: '학생 검색' }), {
      target: { value: '12' },
    });

    expect(screen.getByText('박두리')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('검색 결과 전체 선택 (1명)')).toBeTruthy();
    expect(screen.getByText(/검색어를 바꿔도 선택은 유지됩니다/)).toBeTruthy();
  });

  it('N에 양의 정수가 아니면 즉시 오류를 보이고 시작을 막는다', () => {
    panel();
    fireEvent.click(screen.getByRole('radio', { name: /N명씩/ }));
    fireEvent.change(screen.getByRole('textbox', { name: '한 번에 확인할 학생 수' }), {
      target: { value: '0' },
    });

    expect(screen.getByRole('alert').textContent).toContain('1 이상의 정수');
    expect(screen.getByRole('button', { name: '1명 제안 만들기' }).hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('반 전체 실행은 근거 없는 학생도 포함해 건너뜀으로 남기고 subjectId를 만들지 않는다', async () => {
    panel();
    fireEvent.click(screen.getByRole('radio', { name: '반 전체' }));
    expect(screen.getByText('3명 선택 · 제안 가능 2명 · 근거 없음 1명')).toBeTruthy();
    expect(screen.getByRole('button', { name: '2명 제안 만들기' })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: '전체 계속 만들기' }));
    fireEvent.click(screen.getByRole('button', { name: '2명 제안 만들기' }));

    await waitFor(() => expect(H.data?.runs[0]?.lifecycle).toBe('completed'));
    expect(H.data?.runs[0]?.targetContexts).toEqual([
      {
        studentRef: 's-1',
        classId: 'class-1',
        area: 'subject',
        term: academicTermForDate(new Date().toISOString().slice(0, 10)),
      },
      {
        studentRef: 's-2',
        classId: 'class-1',
        area: 'subject',
        term: academicTermForDate(new Date().toISOString().slice(0, 10)),
      },
      {
        studentRef: 's-3',
        classId: 'class-1',
        area: 'subject',
        term: academicTermForDate(new Date().toISOString().slice(0, 10)),
      },
    ]);
    expect(H.data?.runs[0]?.items[2]?.runStatus).toBe('skipped');
    expect(H.data?.runs[0]?.reviewPace).toEqual({ kind: 'continuous' });
    expect(H.data?.runs[0]?.scaffoldPolicy.kind).toBe('existing');
  });

  it('패널을 닫았다 다시 열어도 진행 중인 AI 요청을 중단한다', async () => {
    let activeSignal: AbortSignal | undefined;
    vi.mocked(askOnce).mockImplementation(
      async (_api, _provider, _text, _systemPrompt, signal) =>
        await new Promise<string>((_resolve, reject) => {
          activeSignal = signal;
          signal?.addEventListener('abort', () => reject('cancelled'));
        }),
    );
    const first = panel();
    fireEvent.click(screen.getByRole('button', { name: '1명 제안 만들기' }));
    await waitFor(() => expect(H.data?.runs[0]?.items[0]?.runStatus).toBe('generating'));

    first.unmount();
    panel();
    await waitFor(() => expect(screen.getByRole('button', { name: '중단' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '중단' }));

    await waitFor(() => expect(activeSignal?.aborted).toBe(true));
    await waitFor(() => expect(H.data?.runs[0]?.lifecycle).toBe('stopped'));
  });

  it('실행 정책에 맞는 뼈대 이름을 카드에 표시한다', async () => {
    expect(recordMapScaffoldDisplayName({ kind: 'fixed', scaffold }, null)).toBe(scaffold.name);
    expect(recordMapScaffoldDisplayName({ kind: 'ai', candidates: [scaffold] }, scaffold.id)).toBe(
      scaffold.name,
    );
    expect(recordMapScaffoldDisplayName({ kind: 'ai', candidates: [scaffold] }, null)).toBe(
      '뼈대 선택 필요',
    );
    seedProposalData();
    panel();

    await waitFor(() => expect(screen.getByText(/뼈대: 기본 뼈대/)).toBeTruthy());
  });

  it('선택한 학생 행을 접근성 상태와 토큰 스타일로 표시하고 실패 원문은 노출하지 않는다', async () => {
    seedProposalData();
    H.data = {
      ...H.data!,
      runs: H.data!.runs.map((run) => ({
        ...run,
        items: [
          {
            ...run.items[0]!,
            runStatus: 'failed',
            failureMessage: 'C:\\secret\\raw.json parse failure',
          },
        ],
      })),
      proposals: [],
    };
    panel();

    const row = await screen.findByRole('button', { name: /김하나.*응답 형식/ });
    expect(row.getAttribute('aria-current')).toBe('true');
    expect(row.getAttribute('aria-pressed')).toBe('true');
    expect(row.className).toContain('border-sp-accent');
    expect(screen.queryByText(/secret/)).toBeNull();
    expect(recordMapFailureLabel('unknown-evidence at C:\\private\\map.json')).toBe(
      'AI 응답의 근거 참조가 맞지 않습니다.',
    );
  });

  it('실패 다시 시도는 지정 학생만 생성하고 다음 대기 학생을 자동 실행하지 않는다', async () => {
    const first = { studentRef: 's-1', classId: 'class-1', area: 'subject' as const };
    const second = { studentRef: 's-2', classId: 'class-1', area: 'subject' as const };
    H.data = {
      schemaVersion: 1,
      runs: [
        {
          schemaVersion: 1,
          runId: 'retry-run',
          targetMode: 'class',
          targetContexts: [first, second],
          lifecycle: 'paused',
          items: [
            { context: first, runStatus: 'failed', failureMessage: 'empty response', updatedAt: 1 },
            { context: second, runStatus: 'queued', updatedAt: 1 },
          ],
          reviewPace: { kind: 'continuous' },
          scaffoldPolicy: { kind: 'existing', defaultScaffold: scaffold },
          provider: 'codex',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      proposals: [],
    };
    useRecordMapRunStore.setState({ activeRunId: 'retry-run', focusedStudentRef: 's-1' });
    panel();

    fireEvent.click(await screen.findByRole('button', { name: '김하나 다시 시도' }));
    await waitFor(() => expect(askOnce).toHaveBeenCalledTimes(1));
    expect(H.data?.runs[0]?.items[1]?.runStatus).toBe('queued');
  });

  it('영역을 바꾸면 그 영역 후보를 사용하고 이전 영역의 고정 뼈대 선택을 지운다', async () => {
    const lifeScaffold = {
      id: 'life-default',
      name: '생활 기본',
      frame: 'life' as const,
      scenes: [{ role: 'evaluation' as const, moduleId: 'teacherJudgement' as const }],
    };
    useRecordMapRunStore.setState({ area: null, scaffoldMode: 'fixed', scaffoldId: scaffold.id });
    render(
      <RecordMapBatchPanel
        students={[{ studentRef: 's-1', number: 7, name: '김하나' }]}
        currentStudentRef="s-1"
        classId="class-1"
        areas={['subject', 'behavior']}
        initialArea={null}
        provider="codex"
        roster={[]}
        scaffoldConfigurationForArea={(area) =>
          area === 'behavior'
            ? { candidates: [lifeScaffold], defaultScaffold: lifeScaffold }
            : { candidates: [scaffold], defaultScaffold: scaffold }
        }
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '행동특성 및 종합의견' }));
    await waitFor(() => expect(useRecordMapRunStore.getState().scaffoldId).toBeNull());
    expect(screen.getByRole('option', { name: '생활 기본' })).toBeTruthy();
  });

  it('기존 구성의 null 뼈대는 검토를 허용하고 AI 미선택 null은 단일·일괄 검토를 막는다', async () => {
    const context = { studentRef: 's-1', classId: 'class-1', area: 'subject' as const };
    const fingerprint = recordMapSourceFingerprint({
      context,
      evidences: H.evidences as readonly RecordEvidence[],
      threads: [],
    });
    seedProposalData({ sourceFingerprint: fingerprint });
    H.data = {
      ...H.data!,
      proposals: H.data!.proposals.map((item) => ({
        ...item,
        topics: item.topics.map((topic) => ({
          ...topic,
          existingThreadId: 'existing-topic',
          scaffold: { scaffoldId: null },
        })),
      })),
    };
    const existingView = panel();
    const existingReview = await screen.findByRole('checkbox', { name: '검토 완료' });
    expect(existingReview.hasAttribute('disabled')).toBe(false);
    existingView.unmount();

    H.data = {
      ...H.data!,
      runs: H.data!.runs.map((item) => ({
        ...item,
        scaffoldPolicy: { kind: 'ai' as const, candidates: [scaffold] },
      })),
      proposals: H.data!.proposals.map((item) => ({ ...item, reviewStatus: 'reviewed' as const })),
    };
    panel();
    expect(
      (await screen.findByRole('checkbox', { name: '검토 완료' })).hasAttribute('disabled'),
    ).toBe(true);
    expect(screen.getByRole('button', { name: '검토한 1명 적용' }).hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('적용된 제안에는 적용으로 생긴 원본 변경 경고를 함께 표시하지 않는다', async () => {
    seedProposalData({ reviewStatus: 'applied', sourceFingerprint: '적용 전 지문' });
    panel();

    await waitFor(() => expect(screen.getByText(/읽기 전략/)).toBeTruthy());
    expect(screen.queryByText(/원본이 바뀌었습니다/)).toBeNull();
  });

  it('되돌린 뒤 검토 전 상태에서는 복원된 원본 지문을 정상으로 본다', async () => {
    const context = { studentRef: 's-1', classId: 'class-1', area: 'subject' as const };
    const fingerprint = recordMapSourceFingerprint({
      context,
      evidences: H.evidences as readonly RecordEvidence[],
      threads: [],
    });
    seedProposalData({ reviewStatus: 'unreviewed', sourceFingerprint: fingerprint });
    panel();

    await waitFor(() => expect(screen.getByText(/읽기 전략/)).toBeTruthy());
    expect(screen.queryByText(/원본이 바뀌었습니다/)).toBeNull();
  });

  it('대기 0명이어도 현재 생성 중인 학생 수를 따로 알린다', async () => {
    seedProposalData({ runStatus: 'generating' });
    panel();

    await waitFor(() => expect(screen.getByText(/생성 중 1명/)).toBeTruthy());
    expect(screen.getByText(/남음 0명/)).toBeTruthy();
  });

  it('초기 복원은 다른 반과 허용되지 않은 영역을 제외하고 가장 최근 작업을 고른다', async () => {
    H.data = {
      schemaVersion: 1,
      runs: [
        storedRun('same-old', 'class-1', 'subject', 10),
        storedRun('other-class', 'class-2', 'subject', 40),
        storedRun('other-area', 'class-1', 'behavior', 50),
        storedRun('same-new', 'class-1', 'subject', 20),
      ],
      proposals: [],
    };
    useRecordMapRunStore.setState({ activeRunId: null, area: null, focusedStudentRef: null });
    panel();

    await waitFor(() => expect(useRecordMapRunStore.getState().activeRunId).toBe('same-new'));
    expect(useRecordMapRunStore.getState()).toMatchObject({
      area: 'subject',
      focusedStudentRef: 's-1',
    });
  });

  it('재시작 뒤 중단 작업을 복원해 보여 주되 AI를 자동 호출하지 않는다', async () => {
    H.data = {
      schemaVersion: 1,
      runs: [storedRun('recovered-run', 'class-1', 'subject', 30)],
      proposals: [],
    };
    useRecordMapRunStore.setState({ activeRunId: null, area: null, focusedStudentRef: null });
    panel();

    await waitFor(() => expect(useRecordMapRunStore.getState().activeRunId).toBe('recovered-run'));
    expect(screen.getByText(/중단됨/)).toBeTruthy();
    expect(askOnce).not.toHaveBeenCalled();
  });

  it('N명 묶음을 중단해 cancelled만 남아도 남은 수를 보이고 이어 한다', async () => {
    const contexts = Array.from({ length: 10 }, (_, index) => ({
      studentRef: index === 0 ? 's-1' : `stopped-${index}`,
      classId: 'class-1',
      area: 'subject' as const,
    }));
    H.data = {
      schemaVersion: 1,
      runs: [
        {
          schemaVersion: 1,
          runId: 'stopped-ten',
          targetMode: 'class',
          targetContexts: contexts,
          lifecycle: 'stopped',
          items: contexts.map((context) => ({
            context,
            runStatus: 'cancelled' as const,
            updatedAt: 1,
          })),
          reviewPace: { kind: 'batch', size: 3 },
          scaffoldPolicy: { kind: 'existing', defaultScaffold: scaffold },
          provider: 'codex',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      proposals: [],
    };
    useRecordMapRunStore.setState({
      activeRunId: 'stopped-ten',
      area: 'subject',
      focusedStudentRef: 's-1',
    });
    panel();

    expect(await screen.findByText(/남음 10명/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '이어 하기 (10명 남음)' }));

    await waitFor(() => expect(H.data?.runs[0]?.lifecycle).toBe('completed'));
    expect(H.data?.runs[0]?.items.filter((item) => item.runStatus === 'cancelled')).toHaveLength(0);
    expect(H.data?.runs[0]?.items.filter((item) => item.runStatus === 'queued')).toHaveLength(0);
  });

  it('같은 앱 세션에서 닫았다 다시 열어도 커밋된 적용 기록과 되돌리기를 복원한다', async () => {
    seedProposalData({ reviewStatus: 'applied' });
    H.applications = [
      {
        schemaVersion: 1,
        id: 'application-1',
        runId: 'run-visible',
        studentRef: 's-1',
        proposalAttemptId: 'attempt-visible',
        sourceFingerprint: 'fingerprint',
        phase: 'committed',
        evidenceChanges: [],
        threadChanges: [],
        createdAt: 1,
        updatedAt: 2,
      },
    ];
    const first = panel();
    expect(await screen.findByRole('button', { name: '적용 후 되돌리기' })).toBeTruthy();

    first.unmount();
    panel();

    expect(await screen.findByRole('button', { name: '적용 후 되돌리기' })).toBeTruthy();
    expect(recordMapApplicationPort.loadApplications).toHaveBeenCalledTimes(2);
  });

  it('중단 저장이 거절되면 예외를 흘리지 않고 현재 작업과 한국어 오류를 남긴다', async () => {
    seedProposalData({ runStatus: 'generating' });
    vi.mocked(recordMapProposalRepository.updateRecordMapProposals).mockRejectedValueOnce(
      new Error('disk failed'),
    );
    panel();
    const stopButton = await screen.findByRole('button', { name: '중단' });
    fireEvent.click(stopButton);

    expect(await screen.findByText(/지도 제안 중단을 저장하지 못했습니다/)).toBeTruthy();
    expect(useRecordMapRunStore.getState().activeRunId).toBe('run-visible');
  });

  it('검토 상태 저장이 거절되면 제안을 유지하고 확인 가능한 오류를 보인다', async () => {
    const context = { studentRef: 's-1', classId: 'class-1', area: 'subject' as const };
    seedProposalData({
      sourceFingerprint: recordMapSourceFingerprint({
        context,
        evidences: H.evidences as readonly RecordEvidence[],
        threads: [],
      }),
    });
    vi.mocked(recordMapProposalRepository.updateRecordMapProposals).mockRejectedValueOnce(
      new Error('write denied'),
    );
    panel();
    fireEvent.click(await screen.findByRole('checkbox', { name: '검토 완료' }));

    expect(await screen.findByText(/검토 상태를 저장하지 못했습니다/)).toBeTruthy();
    expect(screen.getByText('읽기 전략')).toBeTruthy();
  });

  it('적용 도중 저장 예외가 나면 성공을 말하지 않고 실제 적용 결과 재확인을 요청한다', async () => {
    const context = { studentRef: 's-1', classId: 'class-1', area: 'subject' as const };
    seedProposalData({
      reviewStatus: 'reviewed',
      sourceFingerprint: recordMapSourceFingerprint({
        context,
        evidences: H.evidences as readonly RecordEvidence[],
        threads: [],
      }),
    });
    vi.mocked(recordMapApplicationPort.replaceThreads).mockRejectedValueOnce(
      new Error('thread write crashed'),
    );
    panel();
    fireEvent.click(await screen.findByRole('button', { name: '이 학생 지도에 적용' }));

    expect(await screen.findByText(/실제 적용 결과를 확인해 주세요/)).toBeTruthy();
    expect(screen.queryByText('이 학생의 지도를 적용했습니다.')).toBeNull();
    expect(recordMapApplicationPort.replaceEvidence).toHaveBeenCalled();
  });
});
