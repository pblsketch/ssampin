import type { Settings } from '../entities/Settings';

export interface ISettingsRepository {
  getSettings(): Promise<Settings | null>;
  saveSettings(data: Settings): Promise<void>;
}
