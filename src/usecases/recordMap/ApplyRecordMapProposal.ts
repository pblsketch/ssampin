import type { RecordMapApplication } from '@domain/entities/RecordMapApplication';
import type { RecordMapStudentProposal } from '@domain/entities/RecordMapProposal';
import type { IRecordMapApplicationPort } from '@domain/ports/IRecordMapApplicationPort';
import type { IRecordMapProposalRepository } from '@domain/repositories/IRecordMapProposalRepository';
import { planRecordMapApplication } from '@domain/rules/recordMapApplication';
import {
  setDataOperationRecoveryBarrier,
  withDataOperationLock,
} from '@usecases/shared/dataOperationMutex';
import { withFileLock } from '@usecases/shared/fileWriteLock';
import { SYNC_FILE_KEYS } from '@usecases/sync/syncRegistry';
import {
  inspectApplicationDiskState,
  withApplicationPhase,
  writeEvidenceChanges,
  writeThreadChanges,
} from './recordMapApplicationSupport';
import { loadRecordMapData, recordMapContextKey } from './recordMapRunSupport';

export type ApplyRecordMapProposalResult =
  | { readonly ok: true; readonly application: RecordMapApplication }
  | {
      readonly ok: false;
      readonly code:
        | 'not-reviewed'
        | 'stale-proposal'
        | 'source-changed'
        | 'invalid-proposal'
        | 'save-failed'
        | 'recovery-required';
      readonly message: string;
      readonly application?: RecordMapApplication;
    };

export class ApplyRecordMapProposal {
  constructor(
    private readonly port: IRecordMapApplicationPort,
    private readonly createId: () => string,
    private readonly now: () => number,
    private readonly proposalRepository: IRecordMapProposalRepository,
  ) {}

  execute(proposal: RecordMapStudentProposal): Promise<ApplyRecordMapProposalResult> {
    return withDataOperationLock(() =>
      withFileLock(SYNC_FILE_KEYS.inquiryThreads, () =>
        withFileLock(SYNC_FILE_KEYS.recordEvidence, async () => {
          try {
            return await this.executeLocked(proposal);
          } catch {
            setDataOperationRecoveryBarrier(true);
            return {
              ok: false,
              code: 'recovery-required',
              message: '저장 상태를 읽을 수 없어 복구 확인이 필요합니다.',
            };
          }
        }),
      ),
    );
  }

  private async executeLocked(
    requested: RecordMapStudentProposal,
  ): Promise<ApplyRecordMapProposalResult> {
    const applications = await this.port.loadApplications();
    if (
      applications.applications.some((item) => !['committed', 'rolled-back'].includes(item.phase))
    ) {
      setDataOperationRecoveryBarrier(true);
      return {
        ok: false,
        code: 'recovery-required',
        message: '끝나지 않은 근거 지도 저장을 먼저 복구해야 합니다.',
      };
    }
    const proposalData = await loadRecordMapData(this.proposalRepository);
    const contextKey = recordMapContextKey(requested.context);
    const proposal = proposalData.proposals.find(
      (item) => item.runId === requested.runId && recordMapContextKey(item.context) === contextKey,
    );
    const run = proposalData.runs.find((item) => item.runId === requested.runId);
    if (proposal === undefined || run === undefined || proposal.attemptId !== requested.attemptId) {
      return {
        ok: false,
        code: 'stale-proposal',
        message: '저장된 최신 제안과 검토한 판본이 다릅니다. 다시 확인해 주세요.',
      };
    }
    if (proposal.reviewStatus !== 'reviewed') {
      return { ok: false, code: 'not-reviewed', message: '검토를 마친 학생만 적용할 수 있습니다.' };
    }
    const [evidence, threads] = await Promise.all([
      this.port.loadEvidence(),
      this.port.loadThreads(),
    ]);
    const planned = planRecordMapApplication({
      proposal,
      scaffoldPolicy: run.scaffoldPolicy,
      evidences: evidence.records,
      threads: threads.records,
      applicationId: this.createId(),
      now: this.now(),
      createId: this.createId,
    });
    if (!planned.ok) return planned;
    const application = planned.application;

    setDataOperationRecoveryBarrier(true);
    try {
      await this.port.upsertApplication(application);
    } catch {
      let persisted = false;
      try {
        persisted = (await this.port.loadApplications()).applications.some(
          (item) => item.id === application.id,
        );
      } catch {
        setDataOperationRecoveryBarrier(true);
        return this.recoveryResult(application, '저장 준비 기록을 확인해야 합니다.');
      }
      if (persisted) {
        setDataOperationRecoveryBarrier(true);
        return this.recoveryResult(application, '저장 준비 기록을 확인해야 합니다.');
      }
      setDataOperationRecoveryBarrier(false);
      return { ok: false, code: 'save-failed', message: '저장 준비 기록을 만들지 못했습니다.' };
    }

    try {
      const result = await writeEvidenceChanges(this.port, application.evidenceChanges, 'forward');
      if (result.kind !== 'written') {
        await inspectApplicationDiskState(this.port, application);
        return await this.rollbackAfterFailure(application, '근거 저장을 확인하지 못했습니다.');
      }
    } catch {
      await inspectApplicationDiskState(this.port, application);
      return await this.rollbackAfterFailure(
        application,
        '근거 저장 중 오류가 발생했습니다. 실제 적용 결과를 확인해 주세요.',
      );
    }
    try {
      const result = await writeThreadChanges(this.port, application.threadChanges, 'forward');
      if (result.kind !== 'written') {
        await inspectApplicationDiskState(this.port, application);
        return await this.rollbackAfterFailure(application, '주제 저장을 확인하지 못했습니다.');
      }
    } catch {
      await inspectApplicationDiskState(this.port, application);
      return await this.rollbackAfterFailure(
        application,
        '주제 저장 중 오류가 발생했습니다. 실제 적용 결과를 확인해 주세요.',
      );
    }

    if ((await inspectApplicationDiskState(this.port, application)) !== 'after') {
      return this.rollbackAfterFailure(application, '두 저장 파일의 결과가 일치하지 않습니다.');
    }
    const committed = withApplicationPhase(application, 'committed', this.now());
    if (!(await this.persistTerminal(committed))) {
      setDataOperationRecoveryBarrier(true);
      return this.recoveryResult(application, '변경은 저장됐지만 완료 기록을 확인해야 합니다.');
    }
    setDataOperationRecoveryBarrier(false);
    return { ok: true, application: committed };
  }

  private async rollbackAfterFailure(
    application: RecordMapApplication,
    message: string,
  ): Promise<ApplyRecordMapProposalResult> {
    try {
      const result = await writeThreadChanges(this.port, application.threadChanges, 'backward');
      if (result.kind !== 'written') await inspectApplicationDiskState(this.port, application);
    } catch {
      await inspectApplicationDiskState(this.port, application);
    }
    try {
      const result = await writeEvidenceChanges(this.port, application.evidenceChanges, 'backward');
      if (result.kind !== 'written') await inspectApplicationDiskState(this.port, application);
    } catch {
      await inspectApplicationDiskState(this.port, application);
    }
    const disk = await inspectApplicationDiskState(this.port, application);
    const terminal = withApplicationPhase(
      application,
      disk === 'before' ? 'rolled-back' : 'recovery-required',
      this.now(),
      message,
    );
    if (!(await this.persistTerminal(terminal))) {
      setDataOperationRecoveryBarrier(true);
      return this.recoveryResult(application, message);
    }
    const recoveryRequired = terminal.phase === 'recovery-required';
    setDataOperationRecoveryBarrier(recoveryRequired);
    return {
      ok: false,
      code: recoveryRequired ? 'recovery-required' : 'save-failed',
      message,
      application: terminal,
    };
  }

  private async persistTerminal(application: RecordMapApplication): Promise<boolean> {
    try {
      await this.port.upsertApplication(application);
      const stored = (await this.port.loadApplications()).applications.find(
        (item) => item.id === application.id,
      );
      return stored?.phase === application.phase;
    } catch {
      return false;
    }
  }

  private recoveryResult(
    application: RecordMapApplication,
    message: string,
  ): ApplyRecordMapProposalResult {
    return {
      ok: false,
      code: 'recovery-required',
      message,
      application: withApplicationPhase(application, 'recovery-required', this.now(), message),
    };
  }
}
