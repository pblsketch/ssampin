import type { RecordMapApplication } from '@domain/entities/RecordMapApplication';
import type { IRecordMapApplicationPort } from '@domain/ports/IRecordMapApplicationPort';
import { recordsMatchChanges } from '@domain/rules/recordMapApplication';
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

export type UndoRecordMapApplicationResult =
  | { readonly ok: true; readonly application: RecordMapApplication }
  | { readonly ok: false; readonly message: string };

export class UndoRecordMapApplication {
  constructor(
    private readonly port: IRecordMapApplicationPort,
    private readonly now: () => number,
  ) {}

  execute(applicationId: string): Promise<UndoRecordMapApplicationResult> {
    return withDataOperationLock(() =>
      withFileLock(SYNC_FILE_KEYS.inquiryThreads, () =>
        withFileLock(SYNC_FILE_KEYS.recordEvidence, async () => {
          try {
            return await this.executeLocked(applicationId);
          } catch {
            setDataOperationRecoveryBarrier(true);
            return {
              ok: false,
              message: '되돌리기 저장 상태를 읽을 수 없어 복구 확인이 필요합니다.',
            };
          }
        }),
      ),
    );
  }

  private async executeLocked(applicationId: string): Promise<UndoRecordMapApplicationResult> {
    const data = await this.port.loadApplications();
    if (data.applications.some((item) => !['committed', 'rolled-back'].includes(item.phase))) {
      setDataOperationRecoveryBarrier(true);
      return { ok: false, message: '이전 지도 저장을 먼저 복구해야 합니다.' };
    }
    const stored = data.applications.find((item) => item.id === applicationId);
    if (stored === undefined || stored.phase !== 'committed') {
      return { ok: false, message: '되돌릴 수 있는 적용 기록을 찾지 못했습니다.' };
    }
    const [evidence, threads] = await Promise.all([
      this.port.loadEvidence(),
      this.port.loadThreads(),
    ]);
    if (
      !recordsMatchChanges(evidence.records, stored.evidenceChanges, 'after') ||
      !recordsMatchChanges(threads.records, stored.threadChanges, 'after')
    ) {
      return { ok: false, message: '적용 뒤에 수정된 내용이 있어 자동으로 되돌릴 수 없습니다.' };
    }
    setDataOperationRecoveryBarrier(true);
    const rollingBack = withApplicationPhase(stored, 'rolling-back', this.now());
    try {
      await this.port.upsertApplication(rollingBack);
    } catch {
      setDataOperationRecoveryBarrier(true);
      return { ok: false, message: '되돌리기 준비 기록을 확인해야 합니다.' };
    }

    try {
      const result = await writeEvidenceChanges(this.port, stored.evidenceChanges, 'backward');
      if (result.kind !== 'written') await inspectApplicationDiskState(this.port, stored);
    } catch {
      await inspectApplicationDiskState(this.port, stored);
    }
    try {
      const result = await writeThreadChanges(this.port, stored.threadChanges, 'backward');
      if (result.kind !== 'written') await inspectApplicationDiskState(this.port, stored);
    } catch {
      await inspectApplicationDiskState(this.port, stored);
    }
    let disk = await inspectApplicationDiskState(this.port, stored);
    if (disk !== 'before') {
      try {
        const result = await writeThreadChanges(this.port, stored.threadChanges, 'forward');
        if (result.kind !== 'written') await inspectApplicationDiskState(this.port, stored);
      } catch {
        await inspectApplicationDiskState(this.port, stored);
      }
      try {
        const result = await writeEvidenceChanges(this.port, stored.evidenceChanges, 'forward');
        if (result.kind !== 'written') await inspectApplicationDiskState(this.port, stored);
      } catch {
        await inspectApplicationDiskState(this.port, stored);
      }
      disk = await inspectApplicationDiskState(this.port, stored);
    }
    const terminal = withApplicationPhase(
      stored,
      disk === 'before' ? 'rolled-back' : disk === 'after' ? 'committed' : 'recovery-required',
      this.now(),
      disk === 'before' ? undefined : '되돌리기 저장 상태를 확인해야 합니다.',
    );
    try {
      await this.port.upsertApplication(terminal);
      const persisted = (await this.port.loadApplications()).applications.find(
        (item) => item.id === stored.id,
      );
      if (persisted?.phase !== terminal.phase) throw new Error('terminal journal mismatch');
    } catch {
      setDataOperationRecoveryBarrier(true);
      return { ok: false, message: '되돌리기 장부와 저장 파일을 확인해야 합니다.' };
    }
    const ok = terminal.phase === 'rolled-back';
    setDataOperationRecoveryBarrier(terminal.phase === 'recovery-required');
    return ok
      ? { ok: true, application: terminal }
      : { ok: false, message: terminal.failureMessage ?? '되돌리지 못했습니다.' };
  }
}
