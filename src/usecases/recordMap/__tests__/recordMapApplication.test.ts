import {
  assertDataOperationRecoveryClear,
  setDataOperationRecoveryBarrier,
} from '@usecases/shared/dataOperationMutex';
import { describe, expect, it } from 'vitest';
import type { InquiryThreadData } from '@domain/entities/InquiryThread';
import type { RecordEvidenceData } from '@domain/entities/RecordEvidence';
import type {
  RecordMapApplication,
  RecordMapApplicationData,
} from '@domain/entities/RecordMapApplication';
import type {
  RecordMapProposalData,
  RecordMapScaffoldPolicy,
  RecordMapStudentProposal,
} from '@domain/entities/RecordMapProposal';
import type { IRecordMapApplicationPort } from '@domain/ports/IRecordMapApplicationPort';
import type { IRecordMapProposalRepository } from '@domain/repositories/IRecordMapProposalRepository';
import { recordMapSourceFingerprint } from '@domain/rules/recordMapApplication';
import { ApplyRecordMapProposal } from '../ApplyRecordMapProposal';
import { ApplyReviewedRecordMapBatch } from '../ApplyReviewedRecordMapBatch';
import { RecoverRecordMapApplications } from '../RecoverRecordMapApplications';
import { UndoRecordMapApplication } from '../UndoRecordMapApplication';

const policy: RecordMapScaffoldPolicy = {
  kind: 'existing',
  defaultScaffold: {
    id: 'default',
    name: '기본',
    frame: 'inquiry',
    scenes: [{ role: 'process' }],
  },
};

class FakePort implements IRecordMapApplicationPort {
  evidence: RecordEvidenceData = {
    records: [
      {
        id: 'e1',
        studentRef: 's1',
        areas: ['subject'],
        content: '관찰 원문',
        sourceType: 'manual',
        note: '교사 메모',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'other',
        studentRef: 's2',
        areas: ['subject'],
        content: '다른 학생 기록',
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  };
  threads: InquiryThreadData = { records: [] };
  applications: RecordMapApplicationData = { schemaVersion: 1, applications: [] };
  evidenceWrites = 0;
  failThreadWrite = false;
  throwThreadWrite = false;
  throwEvidenceWrites = new Set<number>();
  failEvidenceWrites = new Set<number>();
  mutateThenFailEvidence = false;
  applicationWrites = 0;
  mutateThenThrowApplicationWrites = new Set<number>();

  async loadEvidence(): Promise<RecordEvidenceData> {
    return this.evidence;
  }
  async loadThreads(): Promise<InquiryThreadData> {
    return this.threads;
  }
  async loadEvidenceSnapshot() {
    return { raw: this.evidence, data: this.evidence };
  }
  async loadThreadsSnapshot() {
    return { raw: this.threads, data: this.threads };
  }
  async replaceEvidence(_expected: RecordEvidenceData | null, next: RecordEvidenceData) {
    this.evidenceWrites += 1;
    if (this.throwEvidenceWrites.has(this.evidenceWrites)) throw new Error('evidence write failed');
    if (this.failEvidenceWrites.has(this.evidenceWrites)) {
      if (this.mutateThenFailEvidence) this.evidence = next;
      return { kind: 'conflict' as const };
    }
    this.evidence = next;
    return { kind: 'written' as const };
  }
  async replaceThreads(_expected: InquiryThreadData | null, next: InquiryThreadData) {
    if (this.throwThreadWrite) throw new Error('thread write failed');
    if (this.failThreadWrite) return { kind: 'conflict' as const };
    this.threads = next;
    return { kind: 'written' as const };
  }
  async loadApplications(): Promise<RecordMapApplicationData> {
    return this.applications;
  }
  async upsertApplication(application: RecordMapApplication): Promise<void> {
    this.applicationWrites += 1;
    this.applications = {
      schemaVersion: 1,
      applications: [
        ...this.applications.applications.filter((item) => item.id !== application.id),
        application,
      ],
    };
    if (this.mutateThenThrowApplicationWrites.has(this.applicationWrites)) {
      throw new Error('journal write result unknown');
    }
  }
}

function proposal(port: FakePort): RecordMapStudentProposal {
  const context = { studentRef: 's1', area: 'subject' as const };
  return {
    schemaVersion: 1,
    runId: 'run-1',
    attemptId: 'attempt-1',
    context,
    sourceFingerprint: recordMapSourceFingerprint({
      context,
      evidences: port.evidence.records,
      threads: port.threads.records,
    }),
    topics: [
      {
        id: 'tmp:topic',
        title: '탐구 주제',
        status: 'open',
        scenes: [{ id: 'tmp:scene', role: 'process', evidenceIds: ['e1'], note: 'AI 메모' }],
        scaffold: { scaffoldId: 'default' },
      },
    ],
    unplacedEvidence: [],
    warnings: [],
    runStatus: 'generated',
    reviewStatus: 'reviewed',
    createdAt: 1,
    updatedAt: 1,
  };
}

function ids(): () => string {
  let value = 0;
  return () => `id-${++value}`;
}

function proposalRepository(
  requested: RecordMapStudentProposal,
  scaffoldPolicy: RecordMapScaffoldPolicy,
  stored: RecordMapStudentProposal = requested,
): IRecordMapProposalRepository {
  let data: RecordMapProposalData = {
    schemaVersion: 1,
    runs: [
      {
        schemaVersion: 1,
        runId: requested.runId,
        targetMode: 'current',
        targetContexts: [requested.context],
        lifecycle: 'completed',
        items: [{ context: requested.context, runStatus: 'generated', updatedAt: 1 }],
        reviewPace: { kind: 'one' },
        scaffoldPolicy,
        provider: 'codex',
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    proposals: [stored],
  };
  return {
    getRecordMapProposals: async () => data,
    updateRecordMapProposals: async (update) => {
      data = update(data);
      return data;
    },
  };
}

function applicationUseCase(
  port: FakePort,
  source: RecordMapStudentProposal,
  scaffoldPolicy: RecordMapScaffoldPolicy = policy,
  stored: RecordMapStudentProposal = source,
): ApplyRecordMapProposal {
  return new ApplyRecordMapProposal(
    port,
    ids(),
    () => 10,
    proposalRepository(source, scaffoldPolicy, stored),
  );
}

describe('근거 지도 적용 저장 조정', () => {
  it('두 번째 파일 저장 실패 시 첫 번째 파일의 해당 학생 변경만 원복한다', async () => {
    const port = new FakePort();
    const source = proposal(port);
    port.failThreadWrite = true;
    const result = await applicationUseCase(port, source).execute(source);

    expect(result.ok).toBe(false);
    expect(port.evidence.records.find((item) => item.id === 'e1')?.threadId).toBeUndefined();
    expect(port.evidence.records.find((item) => item.id === 'other')?.content).toBe(
      '다른 학생 기록',
    );
    expect(port.applications.applications[0]?.phase).toBe('rolled-back');
  });

  it('원복도 실패하면 복구 필요로 남기고 재시작에서 변경분만 복구한다', async () => {
    const port = new FakePort();
    const source = proposal(port);
    port.failThreadWrite = true;
    port.failEvidenceWrites.add(2);
    const failed = await applicationUseCase(port, source).execute(source);
    expect(failed.ok).toBe(false);
    expect(port.applications.applications[0]?.phase).toBe('recovery-required');

    port.failThreadWrite = false;
    port.failEvidenceWrites.clear();
    const recovered = await new RecoverRecordMapApplications(port, () => 20).execute();
    expect(recovered[0]?.phase).toBe('rolled-back');
    expect(port.evidence.records.find((item) => item.id === 'e1')?.threadId).toBeUndefined();
    expect(port.threads.records).toHaveLength(0);
  });

  it('원복 시작 기록이 있으면 두 파일이 적용 상태여도 커밋하지 않고 원복을 끝낸다', async () => {
    const port = new FakePort();
    const source = proposal(port);
    const applied = await applicationUseCase(port, source).execute(source);
    if (!applied.ok) throw new Error('적용 실패');
    await port.upsertApplication({ ...applied.application, phase: 'rolling-back' });

    const recovered = await new RecoverRecordMapApplications(port, () => 20).execute();

    expect(recovered[0]?.phase).toBe('rolled-back');
    expect(port.evidence.records.find((item) => item.id === 'e1')?.threadId).toBeUndefined();
    expect(port.threads.records).toHaveLength(0);
  });

  it('저장 성공 응답 뒤 읽기 불일치도 실패로 처리하고 원복한다', async () => {
    const port = new FakePort();
    const source = proposal(port);
    port.failEvidenceWrites.add(1);
    port.mutateThenFailEvidence = true;
    const result = await applicationUseCase(port, source).execute(source);

    expect(result.ok).toBe(false);
    expect(port.evidenceWrites).toBe(2);
    expect(port.evidence.records.find((item) => item.id === 'e1')?.threadId).toBeUndefined();
  });

  it('적용 뒤 다른 학생 수정은 보존하고 같은 레코드 후속 수정은 되돌리기를 거절한다', async () => {
    const port = new FakePort();
    const source = proposal(port);
    const applied = await applicationUseCase(port, source).execute(source);
    expect(applied.ok).toBe(true);
    if (!applied.ok) throw new Error('적용 실패');

    port.evidence = {
      records: port.evidence.records.map((item) =>
        item.id === 'other' ? { ...item, content: '다른 학생이 나중에 수정' } : item,
      ),
    };
    const undone = await new UndoRecordMapApplication(port, () => 20).execute(
      applied.application.id,
    );
    expect(undone.ok).toBe(true);
    expect(port.evidence.records.find((item) => item.id === 'other')?.content).toBe(
      '다른 학생이 나중에 수정',
    );

    const port2 = new FakePort();
    const source2 = proposal(port2);
    const applied2 = await applicationUseCase(port2, source2).execute(source2);
    if (!applied2.ok) throw new Error('적용 실패');
    port2.threads = {
      records: port2.threads.records.map((thread) => ({ ...thread, title: '교사가 나중에 수정' })),
    };
    const refused = await new UndoRecordMapApplication(port2, () => 20).execute(
      applied2.application.id,
    );
    expect(refused).toEqual({
      ok: false,
      message: '적용 뒤에 수정된 내용이 있어 자동으로 되돌릴 수 없습니다.',
    });
  });

  it('updatedAt만 바뀌면 같은 원본이고 내용과 메모가 바뀌면 다른 원본이다', () => {
    const port = new FakePort();
    const source = proposal(port);
    const timestampOnly = port.evidence.records.map((item) => ({ ...item, updatedAt: 999 }));
    expect(
      recordMapSourceFingerprint({
        context: source.context,
        evidences: timestampOnly,
        threads: port.threads.records,
      }),
    ).toBe(source.sourceFingerprint);
    const changed = port.evidence.records.map((item) =>
      item.id === 'e1' ? { ...item, note: '교사가 고친 메모' } : item,
    );
    expect(
      recordMapSourceFingerprint({
        context: source.context,
        evidences: changed,
        threads: port.threads.records,
      }),
    ).not.toBe(source.sourceFingerprint);
  });

  it('현재 학기 문맥의 지문은 다른 학기 주제를 제외한다', () => {
    const port = new FakePort();
    const context = { studentRef: 's1', area: 'subject' as const, term: '2026-2' };
    const current = {
      id: 'current',
      studentRef: 's1',
      title: '현재 학기',
      keywords: [],
      status: 'open' as const,
      term: '2026-2',
      createdAt: 1,
      updatedAt: 1,
    };
    const old = { ...current, id: 'old', title: '지난 학기', term: '2026-1' };
    const withOld = recordMapSourceFingerprint({
      context,
      evidences: port.evidence.records,
      threads: [current, old],
    });
    const withoutOld = recordMapSourceFingerprint({
      context,
      evidences: port.evidence.records,
      threads: [current],
    });
    expect(withOld).toBe(withoutOld);
  });

  it('고정 뼈대는 장면 구조를 바꾸되 교사 메모와 기존 주제 연결을 보존한다', async () => {
    const port = new FakePort();
    port.evidence = {
      records: port.evidence.records.map((item) =>
        item.id === 'e1' ? { ...item, threadId: 'thread-1' } : item,
      ),
    };
    port.threads = {
      records: [
        {
          id: 'parent',
          studentRef: 's1',
          title: '앞 주제',
          keywords: [],
          status: 'open',
          scenes: [],
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'thread-1',
          studentRef: 's1',
          title: '기존 주제',
          keywords: ['교사 키워드'],
          status: 'open',
          link: { fromThreadId: 'parent', note: '교사 연결' },
          scenes: [
            { id: 'old-scene', role: 'result', note: '교사 장면 메모', evidenceIds: ['e1'] },
          ],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };
    const fixed: RecordMapScaffoldPolicy = {
      kind: 'fixed',
      scaffold: {
        id: 'fixed',
        name: '고정 뼈대',
        frame: 'inquiry',
        scenes: [{ role: 'result', label: '정해진 결과' }],
      },
    };
    const context = { studentRef: 's1', area: 'subject' as const };
    const source: RecordMapStudentProposal = {
      ...proposal(port),
      context,
      sourceFingerprint: recordMapSourceFingerprint({
        context,
        evidences: port.evidence.records,
        threads: port.threads.records,
      }),
      topics: [
        {
          id: 'topic-1',
          existingThreadId: 'thread-1',
          title: '기존 주제',
          status: 'open',
          scenes: [
            { id: 'tmp:fixed-scene', role: 'result', label: '정해진 결과', evidenceIds: ['e1'] },
          ],
          scaffold: { scaffoldId: 'fixed' },
        },
      ],
    };

    const result = await applicationUseCase(port, source, fixed).execute(source);
    expect(result.ok).toBe(true);
    const saved = port.threads.records.find((thread) => thread.id === 'thread-1');
    expect(saved?.keywords).toEqual(['교사 키워드']);
    expect(saved?.link).toEqual({ fromThreadId: 'parent', note: '교사 연결' });
    expect(saved?.scenes).toHaveLength(1);
    expect(saved?.scenes?.[0]).toMatchObject({
      role: 'result',
      label: '정해진 결과',
      note: '교사 장면 메모',
      evidenceIds: ['e1'],
    });
    expect(saved?.scenes?.[0]?.id).not.toBe('old-scene');
  });

  it('검토한 3명의 성공·충돌·실패를 분리하고 이미 적용한 학생은 다시 적용하지 않는다', async () => {
    const port = new FakePort();
    const base = proposal(port);
    const proposals = [
      { ...base, context: { ...base.context, studentRef: 'success' } },
      { ...base, context: { ...base.context, studentRef: 'conflict' } },
      { ...base, context: { ...base.context, studentRef: 'failure' } },
      {
        ...base,
        context: { ...base.context, studentRef: 'already' },
        reviewStatus: 'applied' as const,
      },
    ];
    const calls: string[] = [];
    const batch = new ApplyReviewedRecordMapBatch({
      execute: async (item) => {
        calls.push(item.context.studentRef);
        if (item.context.studentRef === 'success') {
          return {
            ok: true as const,
            application: {
              schemaVersion: 1,
              id: 'application',
              runId: item.runId,
              studentRef: item.context.studentRef,
              proposalAttemptId: item.attemptId,
              sourceFingerprint: item.sourceFingerprint,
              phase: 'committed' as const,
              evidenceChanges: [],
              threadChanges: [],
              createdAt: 1,
              updatedAt: 1,
            },
          };
        }
        return item.context.studentRef === 'conflict'
          ? { ok: false as const, code: 'source-changed' as const, message: '원본 변경' }
          : { ok: false as const, code: 'save-failed' as const, message: '저장 실패' };
      },
    });

    const results = await batch.execute(proposals);
    expect(results.map((item) => [item.studentRef, item.result.ok])).toEqual([
      ['success', true],
      ['conflict', false],
      ['failure', false],
    ]);
    expect(calls).toEqual(['success', 'conflict', 'failure']);
  });

  it('복구 필요가 발생하면 뒤 학생 적용을 멈추고 앞의 원본 변경 결과는 집계에 남긴다', async () => {
    const port = new FakePort();
    const base = proposal(port);
    const proposals = ['conflict', 'recovery', 'untouched'].map((studentRef) => ({
      ...base,
      context: { ...base.context, studentRef },
    }));
    const calls: string[] = [];
    const batch = new ApplyReviewedRecordMapBatch({
      execute: async (item) => {
        calls.push(item.context.studentRef);
        return item.context.studentRef === 'conflict'
          ? { ok: false as const, code: 'source-changed' as const, message: '원본 변경' }
          : { ok: false as const, code: 'recovery-required' as const, message: '복구 필요' };
      },
    });

    const results = await batch.execute(proposals);

    expect(
      results.map((item) => [item.studentRef, item.result.ok ? 'ok' : item.result.code]),
    ).toEqual([
      ['conflict', 'source-changed'],
      ['recovery', 'recovery-required'],
    ]);
    expect(calls).toEqual(['conflict', 'recovery']);
  });

  it('화면의 오래된 검토 판본 대신 저장된 최신 attempt를 확인해 적용을 차단한다', async () => {
    const port = new FakePort();
    const requested = proposal(port);
    const stored: RecordMapStudentProposal = {
      ...requested,
      attemptId: 'attempt-new',
      reviewStatus: 'unreviewed',
      updatedAt: 2,
    };
    const apply = applicationUseCase(port, requested, policy, stored);

    await expect(apply.execute(requested)).resolves.toEqual({
      ok: false,
      code: 'stale-proposal',
      message: '저장된 최신 제안과 검토한 판본이 다릅니다. 다시 확인해 주세요.',
    });
    expect(port.evidenceWrites).toBe(0);
    expect(port.applications.applications).toHaveLength(0);

    const unreviewed = applicationUseCase(port, requested, policy, {
      ...requested,
      reviewStatus: 'unreviewed',
    });
    await expect(unreviewed.execute(requested)).resolves.toMatchObject({
      ok: false,
      code: 'not-reviewed',
    });
    expect(port.evidenceWrites).toBe(0);
  });

  it('first evidence write exception leaves a disk-matching rollback journal', async () => {
    const port = new FakePort();
    const source = proposal(port);
    port.throwEvidenceWrites.add(1);
    const result = await applicationUseCase(port, source).execute(source);

    expect(result).toMatchObject({ ok: false, code: 'save-failed' });
    expect(port.evidence.records.find((item) => item.id === 'e1')?.threadId).toBeUndefined();
    expect(port.threads.records).toHaveLength(0);
    expect(port.applications.applications[0]?.phase).toBe('rolled-back');
  });

  it('second thread write exception rolls the first file back before terminal journal', async () => {
    const port = new FakePort();
    const source = proposal(port);
    port.throwThreadWrite = true;
    const result = await applicationUseCase(port, source).execute(source);

    expect(result).toMatchObject({ ok: false, code: 'save-failed' });
    expect(port.evidence.records.find((item) => item.id === 'e1')?.threadId).toBeUndefined();
    expect(port.threads.records).toHaveLength(0);
    expect(port.applications.applications[0]?.phase).toBe('rolled-back');
  });

  it('mutate-then-throw on the first journal write preserves prepared recovery state', async () => {
    const port = new FakePort();
    const source = proposal(port);
    port.mutateThenThrowApplicationWrites.add(1);
    const result = await applicationUseCase(port, source).execute(source);

    expect(result).toMatchObject({ ok: false, code: 'recovery-required' });
    expect(port.applications.applications[0]?.phase).toBe('prepared');
    expect(port.evidence.records.find((item) => item.id === 'e1')?.threadId).toBeUndefined();
  });

  it('rejects a result-only fixed scaffold when a process scene teacher note has no destination', async () => {
    const port = new FakePort();
    port.evidence = {
      records: port.evidence.records.map((item) =>
        item.id === 'e1' ? { ...item, threadId: 'thread-1' } : item,
      ),
    };
    port.threads = {
      records: [
        {
          id: 'thread-1',
          studentRef: 's1',
          title: 'topic',
          keywords: [],
          status: 'open',
          scenes: [
            {
              id: 'process-1',
              role: 'process',
              note: 'teacher process note',
              noteSource: 'teacher',
              evidenceIds: ['e1'],
            },
          ],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };
    const fixed: RecordMapScaffoldPolicy = {
      kind: 'fixed',
      scaffold: {
        id: 'result-only',
        name: 'result',
        frame: 'inquiry',
        scenes: [{ role: 'result' }],
      },
    };
    const context = { studentRef: 's1', area: 'subject' as const };
    const source: RecordMapStudentProposal = {
      ...proposal(port),
      context,
      sourceFingerprint: recordMapSourceFingerprint({
        context,
        evidences: port.evidence.records,
        threads: port.threads.records,
      }),
      topics: [
        {
          id: 'topic-1',
          existingThreadId: 'thread-1',
          title: 'topic',
          status: 'open',
          scenes: [{ id: 'tmp:result', role: 'result', evidenceIds: ['e1'] }],
          scaffold: { scaffoldId: 'result-only' },
        },
      ],
    };

    const result = await applicationUseCase(port, source, fixed).execute(source);

    expect(result).toMatchObject({ ok: false, code: 'invalid-proposal' });
    expect(port.threads.records[0]?.scenes?.[0]?.note).toBe('teacher process note');
    expect(port.applications.applications).toHaveLength(0);
  });

  it('blocks a new apply while a nonterminal application needs recovery', async () => {
    const port = new FakePort();
    const source = proposal(port);
    port.applications = {
      schemaVersion: 1,
      applications: [
        {
          schemaVersion: 1,
          id: 'unfinished',
          runId: 'old-run',
          studentRef: 's1',
          proposalAttemptId: 'old-attempt',
          sourceFingerprint: source.sourceFingerprint,
          phase: 'prepared',
          evidenceChanges: [],
          threadChanges: [],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };

    await expect(applicationUseCase(port, source).execute(source)).resolves.toMatchObject({
      ok: false,
      code: 'recovery-required',
    });
    expect(port.evidenceWrites).toBe(0);
  });
});

describe('persistent readback failure', () => {
  it('keeps sync blocked after a partial apply until recovery verifies both files', async () => {
    const port = new FakePort();
    const source = proposal(port);
    const load = port.loadEvidence.bind(port);
    port.loadEvidence = async () => {
      if (port.evidenceWrites > 0) throw new Error('persistent read failure');
      return load();
    };
    const result = await applicationUseCase(port, source).execute(source);
    expect(result).toMatchObject({ ok: false, code: 'recovery-required' });
    expect(() => assertDataOperationRecoveryClear()).toThrow();
    port.loadEvidence = load;
    await new RecoverRecordMapApplications(port, () => 10).execute();
    expect(() => assertDataOperationRecoveryClear()).not.toThrow();
  });

  it('keeps sync blocked when recovery cannot read the journal', async () => {
    const port = new FakePort();
    port.loadApplications = async () => {
      throw new Error('journal unavailable');
    };
    await expect(new RecoverRecordMapApplications(port, () => 10).execute()).rejects.toThrow();
    expect(() => assertDataOperationRecoveryClear()).toThrow();
    setDataOperationRecoveryBarrier(false);
  });
});

describe('teacher metadata regression', () => {
  it('rejects two teacher scenes mapped to the same destination', async () => {
    const port = new FakePort();
    port.evidence = {
      records: port.evidence.records.map((item) =>
        item.id === 'e1' ? { ...item, threadId: 'thread-1' } : item,
      ),
    };
    port.threads = {
      records: [
        {
          id: 'thread-1',
          studentRef: 's1',
          title: 'topic',
          keywords: [],
          status: 'open',
          scenes: [
            { id: 'process-2', role: 'process', note: 'teacher B', evidenceIds: [] },
            {
              id: 'process-1',
              role: 'process',
              note: 'teacher process note',
              noteSource: 'teacher',
              evidenceIds: ['e1'],
            },
          ],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };
    const fixed: RecordMapScaffoldPolicy = {
      kind: 'fixed',
      scaffold: {
        id: 'result-only',
        name: 'result',
        frame: 'inquiry',
        scenes: [{ role: 'process' }],
      },
    };
    const context = { studentRef: 's1', area: 'subject' as const };
    const source: RecordMapStudentProposal = {
      ...proposal(port),
      context,
      sourceFingerprint: recordMapSourceFingerprint({
        context,
        evidences: port.evidence.records,
        threads: port.threads.records,
      }),
      topics: [
        {
          id: 'topic-1',
          existingThreadId: 'thread-1',
          title: 'topic',
          status: 'open',
          scenes: [{ id: 'tmp:result', role: 'process', evidenceIds: ['e1'] }],
          scaffold: { scaffoldId: 'result-only' },
        },
      ],
    };

    const result = await applicationUseCase(port, source, fixed).execute(source);

    expect(result).toMatchObject({ ok: false, code: 'invalid-proposal' });
    expect(port.threads.records[0]?.scenes).toHaveLength(2);
    expect(port.applications.applications).toHaveLength(0);
  });
  it('preserves teacher lead-in on a formerly AI-authored scene', async () => {
    const port = new FakePort();
    port.evidence = {
      records: port.evidence.records.map((item) =>
        item.id === 'e1' ? { ...item, threadId: 'thread-1' } : item,
      ),
    };
    port.threads = {
      records: [
        {
          id: 'thread-1',
          studentRef: 's1',
          title: 'topic',
          keywords: [],
          status: 'open',
          scenes: [
            {
              id: 'process-1',
              role: 'process',
              note: 'teacher process note',
              noteSource: 'ai',
              leadIn: 'teacher lead-in',
              evidenceIds: ['e1'],
            },
          ],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };
    const fixed: RecordMapScaffoldPolicy = {
      kind: 'fixed',
      scaffold: {
        id: 'result-only',
        name: 'result',
        frame: 'inquiry',
        scenes: [{ role: 'process' }],
      },
    };
    const context = { studentRef: 's1', area: 'subject' as const };
    const source: RecordMapStudentProposal = {
      ...proposal(port),
      context,
      sourceFingerprint: recordMapSourceFingerprint({
        context,
        evidences: port.evidence.records,
        threads: port.threads.records,
      }),
      topics: [
        {
          id: 'topic-1',
          existingThreadId: 'thread-1',
          title: 'topic',
          status: 'open',
          scenes: [{ id: 'tmp:result', role: 'process', evidenceIds: ['e1'] }],
          scaffold: { scaffoldId: 'result-only' },
        },
      ],
    };

    const result = await applicationUseCase(port, source, fixed).execute(source);

    expect(result.ok).toBe(true);
    expect(port.threads.records[0]?.scenes?.[0]?.leadIn).toBe('teacher lead-in');
    expect(port.applications.applications).toHaveLength(1);
  });
});

it('keeps sync blocked if undo writes and then loses readback', async () => {
  const port = new FakePort();
  const source = proposal(port);
  const applied = await applicationUseCase(port, source).execute(source);
  if (!applied.ok) throw new Error('apply fixture');
  const load = port.loadEvidence.bind(port);
  port.loadEvidence = async () => {
    if (port.evidenceWrites > 1) throw new Error('persistent undo read failure');
    return load();
  };
  expect(
    (await new UndoRecordMapApplication(port, () => 10).execute(applied.application.id)).ok,
  ).toBe(false);
  expect(() => assertDataOperationRecoveryClear()).toThrow();
  port.loadEvidence = load;
  await new RecoverRecordMapApplications(port, () => 20).execute();
  expect(() => assertDataOperationRecoveryClear()).not.toThrow();
});

it('refuses fixed replacement of a scene containing evidence from another area', async () => {
  const port = new FakePort();
  port.evidence = {
    records: [
      { ...port.evidence.records[0]!, threadId: 'existing' },
      {
        id: 'behavior',
        studentRef: 's1',
        areas: ['behavior'],
        content: 'other area',
        threadId: 'existing',
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  };
  port.threads = {
    records: [
      {
        id: 'existing',
        studentRef: 's1',
        title: 'mixed',
        keywords: [],
        status: 'open',
        createdAt: 1,
        updatedAt: 1,
        scenes: [{ id: 'old', role: 'process', evidenceIds: ['e1', 'behavior'] }],
      },
    ],
  };
  const base = proposal(port);
  const source = {
    ...base,
    topics: base.topics.map((topic) => ({ ...topic, existingThreadId: 'existing' })),
  };
  if (policy.kind !== 'existing') throw new Error('policy fixture');
  const fixed: RecordMapScaffoldPolicy = { kind: 'fixed', scaffold: policy.defaultScaffold };
  expect(await applicationUseCase(port, source, fixed).execute(source)).toMatchObject({
    ok: false,
    code: 'invalid-proposal',
  });
  expect(port.evidenceWrites).toBe(0);
  expect(port.threads.records[0]?.scenes?.[0]?.evidenceIds).toEqual(['e1', 'behavior']);
});
