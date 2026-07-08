import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IReminderFireRepository } from '@domain/repositories/IReminderFireRepository';
import type { ReminderFireData } from '@domain/entities/RecordReminder';

/** 관찰 기록 알림 발화 장부 — 로컬 JSON('reminder-fires') 영속. */
export class JsonReminderFireRepository implements IReminderFireRepository {
  constructor(private readonly storage: IStoragePort) {}

  load(): Promise<ReminderFireData | null> {
    return this.storage.read<ReminderFireData>('reminder-fires');
  }

  save(data: ReminderFireData): Promise<void> {
    return this.storage.write('reminder-fires', data);
  }
}
