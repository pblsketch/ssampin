import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { ISettingsRepository } from '@domain/repositories/ISettingsRepository';
import type { Settings } from '@domain/entities/Settings';

export class JsonSettingsRepository implements ISettingsRepository {
  constructor(private readonly storage: IStoragePort) {}

  getSettings(): Promise<Settings | null> {
    return this.storage.read<Settings>('settings');
  }

  saveSettings(data: Settings): Promise<void> {
    return this.storage.write('settings', data);
  }
}
