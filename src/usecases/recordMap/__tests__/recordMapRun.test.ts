import { settleRecordMapRun } from '../recordMapRunSupport';
import { RegenerateRecordMapTopic } from '../RegenerateRecordMapTopic';
import { describe, expect, it } from 'vitest';

import type { RecordEvidence } from '@domain/entities/RecordEvidence';
import type {
  RecordMapProposalData,
  RecordMapRun,
  RecordMapScaffoldPolicy,
  RecordMapStudentContext,
} from '@domain/entities/RecordMapProposal';
import type { IRecordMapProposalRepository } from '@domain/repositories/IRecordMapProposalRepository';
import { CreateRecordMapRun } from '../CreateRecordMapRun';
import { GenerateRecordMapStudent } from '../GenerateRecordMapStudent';
import { RecoverRecordMapRuns } from '../RecoverRecordMapRuns';
import type {
  RecordMapAiPort,
  RecordMapAiRequest,
  RecordMapStudentSourcePort,
} from '../RecordMapAiPort';
import { ResumeRecordMapRun } from '../ResumeRecordMapRun';
import { RunRecordMapBatch } from '../RunRecordMapBatch';
import { StopRecordMapRun } from '../StopRecordMapRun';

const NOW = 1_700_000_000_000;
const POLICY: RecordMapScaffoldPolicy = {
  kind: 'fixed',
  scaffold: {
    id: 'fixed-1',
    name: '질문형',
    frame: 'inquiry',
    scenes: [{ role: 'motive', moduleId: 'issueQuestion', label: '질문 장면' }],
  },
};

class MemoryRepository implements IRecordMapProposalRepository {
  data: RecordMapProposalData | null = null;
  updateCalls = 0;
  beforeUpdate?: (call: number, repository: MemoryRepository) => void;

  async getRecordMapProposals(): Promise<RecordMapProposalData | null> {
    return this.data;
  }

  async updateRecordMapProposals(
    update: (current: RecordMapProposalData) => RecordMapProposalData,
  ): Promise<RecordMapProposalData> {
    this.updateCalls += 1;
    this.beforeUpdate?.(this.updateCalls, this);
    const current = this.data ?? { schemaVersion: 1, runs: [], proposals: [] };
    this.data = update(current);
    return this.data;
  }
}

const context = (index: number): RecordMapStudentContext => ({
  studentRef: `student-${index}`,
  classId: 'class-korean',
  subjectId: 'korean',
  area: 'subject',
  term: '2026-1',
});

const evidence = (student: RecordMapStudentContext): RecordEvidence => ({
  id: `evidence-${student.studentRef}`,
  studentRef: student.studentRef,
  classId: student.classId,
  areas: [student.area],
  content: `${student.studentRef}가 자료를 비교함`,
  createdAt: NOW,
  updatedAt: NOW,
});

const sourcePort: RecordMapStudentSourcePort = {
  async load(student) {
    return {
      studentName: student.studentRef,
      roster: [],
      evidences: [evidence(student)],
      threads: [],
      sourceFingerprint: `fp-${student.studentRef}`,
    };
  },
};

function validAnswer(): string {
  return JSON.stringify({
    schemaVersion: 1,
    topics: [
      {
        id: 'tmp:1',
        title: '자료 비교',
        status: 'open',
        scaffold: { scaffoldId: 'fixed-1' },
        scenes: [
          {
            id: 'tmp-scene:1',
            role: 'motive',
            moduleId: 'issueQuestion',
            label: '질문 장면',
            evidenceNumbers: [1],
          },
        ],
      },
    ],
    unplacedEvidence: [],
    warnings: [],
  });
}

function createHarness(options: { readonly failAt?: number; readonly ai?: RecordMapAiPort } = {}) {
  const repository = new MemoryRepository();
  let attempt = 0;
  let clock = NOW;
  const requests: RecordMapAiRequest[] = [];
  const ai: RecordMapAiPort = options.ai ?? {
    async ask(request) {
      requests.push(request);
      if (requests.length === options.failAt) throw new Error('학생 한 명 실패');
      return validAnswer();
    },
  };
  const now = () => ++clock;
  const generate = new GenerateRecordMapStudent(
    repository,
    ai,
    sourcePort,
    () => `attempt-${++attempt}`,
    now,
  );
  return {
    repository,
    requests,
    ai,
    create: new CreateRecordMapRun(repository, now),
    generate,
    batch: new RunRecordMapBatch(repository, generate, now),
    stop: new StopRecordMapRun(repository, ai, now),
    resume: new ResumeRecordMapRun(repository, now),
    recover: new RecoverRecordMapRuns(repository, now),
  };
}

async function createRun(
  harness: ReturnType<typeof createHarness>,
  targets: readonly RecordMapStudentContext[],
  size: number,
) {
  return harness.create.execute({
    runId: 'run-1',
    targetMode: 'selected',
    targetContexts: targets,
    reviewPace: { kind: 'batch', size },
    scaffoldPolicy: POLICY,
    provider: 'codex',
  });
}

describe('여러 학생 지도 제안 실행', () => {
  it('7명을 3명씩 3/3/1로 멈추고 한 요청에 한 학생만 보낸다', async () => {
    const harness = createHarness();
    await createRun(
      harness,
      Array.from({ length: 7 }, (_, index) => context(index + 1)),
      3,
    );

    expect(await harness.batch.execute('run-1')).toMatchObject({
      attempted: 3,
      lifecycle: 'paused',
    });
    expect(harness.requests).toHaveLength(3);
    expect(await harness.batch.execute('run-1')).toMatchObject({
      attempted: 3,
      lifecycle: 'paused',
    });
    expect(harness.requests).toHaveLength(6);
    expect(await harness.batch.execute('run-1')).toMatchObject({
      attempted: 1,
      lifecycle: 'completed',
    });
    expect(harness.requests).toHaveLength(7);
    expect(harness.requests.every((request) => request.text.match(/^1\. /gm)?.length === 1)).toBe(
      true,
    );
    expect(harness.repository.data?.proposals).toHaveLength(7);
  });

  it('one은 한 명 뒤, continuous는 남은 전부 뒤에 멈춘다', async () => {
    const one = createHarness();
    await one.create.execute({
      runId: 'one',
      targetMode: 'class',
      targetContexts: [context(1), context(2)],
      reviewPace: { kind: 'one' },
      scaffoldPolicy: POLICY,
      provider: 'codex',
    });
    expect(await one.batch.execute('one')).toMatchObject({ attempted: 1, lifecycle: 'paused' });

    const continuous = createHarness();
    await continuous.create.execute({
      runId: 'all',
      targetMode: 'class',
      targetContexts: [context(1), context(2)],
      reviewPace: { kind: 'continuous' },
      scaffoldPolicy: POLICY,
      provider: 'codex',
    });
    expect(await continuous.batch.execute('all')).toMatchObject({
      attempted: 2,
      lifecycle: 'completed',
    });
  });

  it('특정 학생 AI 실패가 같은 묶음의 다른 학생 생성을 막지 않는다', async () => {
    const harness = createHarness({ failAt: 2 });
    await createRun(harness, [context(1), context(2), context(3)], 3);
    const result = await harness.batch.execute('run-1');

    expect(result.results).toEqual(['generated', 'failed', 'generated']);
    expect(harness.repository.data?.proposals.map((item) => item.context.studentRef)).toEqual([
      'student-1',
      'student-3',
    ]);
    expect(harness.repository.data?.runs[0]?.items[1]?.runStatus).toBe('failed');
  });

  it('실패한 학생만 새 attempt로 다시 시도할 수 있다', async () => {
    const harness = createHarness({ failAt: 1 });
    await createRun(harness, [context(1), context(2)], 2);
    expect(await harness.generate.execute('run-1', context(1))).toBe('failed');
    expect(await harness.generate.execute('run-1', context(1))).toBe('generated');
    expect(harness.requests.map((request) => request.attemptId)).toEqual([
      'attempt-1',
      'attempt-2',
    ]);
    expect(harness.requests.map((request) => request.provider)).toEqual(['codex', 'codex']);
    expect(harness.repository.data?.proposals[0]?.requestEvidence).toEqual({
      includedEvidenceIds: ['evidence-student-1'],
      excludedCounts: { teacher: 0, empty: 0, prohibited: 0, tooLong: 0 },
      suppressedMemoCount: 0,
    });
    expect(harness.repository.data?.runs[0]?.items[1]?.runStatus).toBe('queued');
  });

  it('batch final update preserves a concurrently stopped run', async () => {
    const harness = createHarness();
    await createRun(harness, [context(1)], 1);
    harness.repository.beforeUpdate = (call, repository) => {
      if (call !== 4 || repository.data === null) return;
      repository.data = {
        ...repository.data,
        runs: repository.data.runs.map((run) =>
          run.runId === 'run-1' ? { ...run, lifecycle: 'stopped' as const } : run,
        ),
      };
    };

    const result = await harness.batch.execute('run-1');

    expect(result.lifecycle).toBe('stopped');
    expect(harness.repository.data?.runs[0]?.lifecycle).toBe('stopped');
    expect(harness.repository.data?.runs[0]?.items[0]?.runStatus).toBe('generated');
  });

  it('같은 학생·같은 작업의 동시 중복 시작을 거절한다', async () => {
    let release: ((answer: string) => void) | undefined;
    let entered: (() => void) | undefined;
    const enteredPromise = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const ai: RecordMapAiPort = {
      ask: async () => {
        entered?.();
        return await new Promise<string>((resolve) => {
          release = resolve;
        });
      },
    };
    const harness = createHarness({ ai });
    await createRun(harness, [context(1)], 1);
    const first = harness.generate.execute('run-1', context(1));
    await enteredPromise;

    expect(await harness.generate.execute('run-1', context(1))).toBe('ignored');
    release?.(validAnswer());
    expect(await first).toBe('generated');
  });

  it('보낼 근거가 없으면 AI를 호출하지 않고 그 학생만 건너뛴다', async () => {
    const harness = createHarness();
    const emptySources: RecordMapStudentSourcePort = {
      async load(student) {
        return {
          studentName: '빈 학생',
          roster: [],
          evidences: [],
          threads: [],
          sourceFingerprint: student.studentRef,
        };
      },
    };
    const generate = new GenerateRecordMapStudent(
      harness.repository,
      harness.ai,
      emptySources,
      () => 'empty-attempt',
      () => NOW,
    );
    await createRun(harness, [context(1)], 1);
    expect(await generate.execute('run-1', context(1))).toBe('skipped');
    expect(harness.requests).toHaveLength(0);
  });
});

describe('중단·재개·재시작 복원', () => {
  it('중단을 먼저 저장하고 늦게 도착한 응답을 무시한다', async () => {
    let release: ((answer: string) => void) | undefined;
    let entered: (() => void) | undefined;
    const enteredPromise = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const cancelled: string[] = [];
    const ai: RecordMapAiPort = {
      ask: async () => {
        entered?.();
        return await new Promise<string>((resolve) => {
          release = resolve;
        });
      },
      cancel: (_runId, attemptId) => {
        cancelled.push(attemptId);
      },
    };
    const harness = createHarness({ ai });
    await createRun(harness, [context(1)], 1);
    const pending = harness.generate.execute('run-1', context(1));
    await enteredPromise;

    await harness.stop.execute('run-1');
    release?.(validAnswer());

    expect(await pending).toBe('ignored');
    expect(cancelled).toEqual(['attempt-1']);
    expect(harness.repository.data?.runs[0]?.lifecycle).toBe('stopped');
    expect(harness.repository.data?.runs[0]?.items[0]?.runStatus).toBe('cancelled');
    expect(harness.repository.data?.proposals).toHaveLength(0);
  });

  it('원자료를 읽는 동안 중단되면 AI 호출까지 가지 않는다', async () => {
    let releaseSource: (() => void) | undefined;
    let enteredSource: (() => void) | undefined;
    const entered = new Promise<void>((resolve) => {
      enteredSource = resolve;
    });
    const sourceGate = new Promise<void>((resolve) => {
      releaseSource = resolve;
    });
    const harness = createHarness();
    const slowSources: RecordMapStudentSourcePort = {
      async load(student) {
        enteredSource?.();
        await sourceGate;
        return sourcePort.load(student);
      },
    };
    const generate = new GenerateRecordMapStudent(
      harness.repository,
      harness.ai,
      slowSources,
      () => 'slow-attempt',
      () => NOW,
    );
    await createRun(harness, [context(1)], 1);
    const pending = generate.execute('run-1', context(1));
    await entered;
    await harness.stop.execute('run-1');
    releaseSource?.();

    expect(await pending).toBe('ignored');
    expect(harness.requests).toHaveLength(0);
  });

  it('재개는 취소된 학생을 대기로만 바꾸며 자동 AI 호출하지 않는다', async () => {
    const harness = createHarness();
    await createRun(harness, [context(1), context(2)], 2);
    await harness.stop.execute('run-1');

    const resumed = await harness.resume.execute('run-1');
    expect(resumed.lifecycle).toBe('ready');
    expect(resumed.items.map((item) => item.runStatus)).toEqual(['queued', 'queued']);
    expect(harness.requests).toHaveLength(0);
  });

  it('앱 재시작 복원은 running/generating만 stopped/cancelled로 저장하고 AI를 부르지 않는다', async () => {
    const harness = createHarness();
    const run = await createRun(harness, [context(1), context(2)], 2);
    const running: RecordMapRun = {
      ...run,
      lifecycle: 'running',
      items: [
        { ...run.items[0]!, runStatus: 'generating', attemptId: 'old-attempt' },
        run.items[1]!,
      ],
    };
    harness.repository.data = { schemaVersion: 1, runs: [running], proposals: [] };

    const recovered = await harness.recover.execute();
    expect(recovered.runs[0]?.lifecycle).toBe('stopped');
    expect(recovered.runs[0]?.items.map((item) => item.runStatus)).toEqual(['cancelled', 'queued']);
    expect(harness.requests).toHaveLength(0);
  });
});

it('rejects another batch or isolated generator while the original run owns execution', async () => {
  let release: (answer: string) => void = () => undefined;
  let started: () => void = () => undefined;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const harness = createHarness({
    ai: {
      ask: async () => {
        started();
        return new Promise<string>((resolve) => {
          release = resolve;
        });
      },
    },
  });
  await createRun(harness, [context(1), context(2)], 1);
  const running = harness.batch.execute('run-1');
  await entered;
  const secondGenerator = new GenerateRecordMapStudent(
    harness.repository,
    harness.ai,
    sourcePort,
    () => 'second',
    () => NOW,
  );
  const second = new RunRecordMapBatch(harness.repository, secondGenerator, () => NOW);
  expect(await second.execute('run-1')).toMatchObject({ attempted: 0, lifecycle: 'running' });
  expect(await secondGenerator.execute('run-1', context(2))).toBe('ignored');
  await harness.recover.execute();
  expect(harness.repository.data?.runs[0]?.lifecycle).toBe('running');
  release(validAnswer());
  expect(await running).toMatchObject({ attempted: 1, lifecycle: 'paused' });
  expect(harness.repository.data?.runs[0]?.items[1]?.runStatus).toBe('queued');
});

it.each(['busy', 'not-signed-in', 'usage-limit'])(
  'pauses provider-wide %s failure without consuming waiting students',
  async (kind) => {
    let calls = 0;
    const harness = createHarness({
      ai: {
        ask: async () => {
          calls++;
          throw kind;
        },
      },
    });
    await createRun(harness, [context(1), context(2), context(3)], 3);
    expect(await harness.batch.execute('run-1')).toMatchObject({
      attempted: 1,
      lifecycle: 'paused',
    });
    expect(calls).toBe(1);
    expect(harness.repository.data?.runs[0]?.items.map((item) => item.runStatus)).toEqual([
      'failed',
      'queued',
      'queued',
    ]);
  },
);

it('regenerates one topic and preserves all other proposal topics', async () => {
  const harness = createHarness();
  await createRun(harness, [context(1)], 1);
  await harness.batch.execute('run-1');
  const generated = harness.repository.data?.proposals[0];
  if (!generated || !harness.repository.data || POLICY.kind !== 'fixed') throw new Error('fixture');
  const originalTopic = generated.topics[0];
  if (!originalTopic) throw new Error('fixture topic');
  const target = {
    ...originalTopic,
    scaffold: { scaffoldId: null, reason: 'needs teacher choice' },
  };
  const untouched = {
    ...target,
    id: 'untouched',
    scenes: [{ id: 'empty', role: 'motive' as const, evidenceIds: [] }],
    scaffold: { scaffoldId: null, reason: 'needs teacher choice' },
  };
  const proposal = { ...generated, topics: [target, untouched] };
  harness.repository.data = {
    ...harness.repository.data,
    proposals: [proposal],
    runs: harness.repository.data.runs.map((run) => ({
      ...run,
      scaffoldPolicy: { kind: 'ai', candidates: [POLICY.scaffold] },
    })),
  };
  const usecase = new RegenerateRecordMapTopic(
    harness.repository,
    harness.ai,
    sourcePort,
    () => 'topic-attempt',
    () => NOW + 10,
  );
  expect(await usecase.execute(proposal, target.id, POLICY.scaffold)).toBe(true);
  const saved = harness.repository.data.proposals[0];
  expect(saved?.topics[1]).toEqual(untouched);
  expect(saved?.topics[0]?.scaffold.scaffoldId).toBe(POLICY.scaffold.id);
  expect(saved?.reviewStatus).toBe('unreviewed');
});

it('isolated completion cannot overwrite a saved stop', async () => {
  const harness = createHarness();
  await createRun(harness, [context(1)], 1);
  await harness.stop.execute('run-1');
  await settleRecordMapRun(harness.repository, 'run-1', NOW + 1);
  expect(harness.repository.data?.runs[0]?.lifecycle).toBe('stopped');
  await harness.resume.execute('run-1');
  expect(await harness.batch.execute('run-1')).toMatchObject({ attempted: 1 });
});

it('stop captures attempts started inside the atomic update', async () => {
  const cancelled: string[] = [];
  const harness = createHarness({
    ai: {
      ask: async () => validAnswer(),
      cancel: async (_runId, attemptId) => {
        cancelled.push(attemptId);
      },
    },
  });
  await createRun(harness, [context(1)], 1);
  harness.repository.beforeUpdate = (_call, repository) => {
    repository.beforeUpdate = undefined;
    if (repository.data)
      repository.data = {
        ...repository.data,
        runs: repository.data.runs.map((run) => ({
          ...run,
          lifecycle: 'running',
          items: run.items.map((item) => ({
            ...item,
            runStatus: 'generating',
            attemptId: 'raced',
          })),
        })),
      };
  };
  await harness.stop.execute('run-1');
  expect(cancelled).toEqual(['raced']);
});
