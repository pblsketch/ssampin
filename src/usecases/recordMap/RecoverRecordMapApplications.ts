import type { RecordMapApplication } from '@domain/entities/RecordMapApplication';
import type { IRecordMapApplicationPort } from '@domain/ports/IRecordMapApplicationPort';
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

export class RecoverRecordMapApplications {
  constructor(
    private readonly port: IRecordMapApplicationPort,
    private readonly now: () => number,
  ) {}

  execute(): Promise<readonly RecordMapApplication[]> {
    return withDataOperationLock(() =>
      withFileLock(SYNC_FILE_KEYS.inquiryThreads, () =>
        withFileLock(SYNC_FILE_KEYS.recordEvidence, () => this.executeLocked()),
      ),
    );
  }

  private async executeLocked(): Promise<readonly RecordMapApplication[]> {
    setDataOperationRecoveryBarrier(true);
    const data = await this.port.loadApplications();
    const recovered: RecordMapApplication[] = [];
    let unresolved = false;
    for (const stored of data.applications) {
      if (stored.phase === 'committed' || stored.phase === 'rolled-back') continue;
      let state = await inspectApplicationDiskState(this.port, stored);
      const rollbackIntent =
        stored.phase === 'rolling-back' || stored.phase === 'recovery-required';

      if (rollbackIntent || state === 'mixed-or-unknown') {
        try {
          await writeThreadChanges(this.port, stored.threadChanges, 'backward');
        } catch {
          /* readback owns verdict */
        }
        try {
          await writeEvidenceChanges(this.port, stored.evidenceChanges, 'backward');
        } catch {
          /* readback owns verdict */
        }
        state = await inspectApplicationDiskState(this.port, stored);
      }

      const phase =
        state === 'after' && !rollbackIntent
          ? 'committed'
          : state === 'before'
            ? 'rolled-back'
            : 'recovery-required';
      const application = withApplicationPhase(
        stored,
        phase,
        this.now(),
        phase === 'recovery-required'
          ? '저장 파일 상태가 장부와 달라 직접 복구가 필요합니다.'
          : undefined,
      );
      try {
        await this.port.upsertApplication(application);
        const persisted = (await this.port.loadApplications()).applications.find(
          (item) => item.id === stored.id,
        );
        if (persisted?.phase !== phase) unresolved = true;
      } catch {
        unresolved = true;
      }
      if (phase === 'recovery-required') unresolved = true;
      recovered.push(application);
    }
    setDataOperationRecoveryBarrier(unresolved);
    return recovered;
  }
}
