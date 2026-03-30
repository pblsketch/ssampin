export type ToolPresetType = 'roulette' | 'random' | 'wordcloud';

export interface ToolPreset {
  readonly id: string;
  readonly name: string;
  readonly type: ToolPresetType;
  readonly items: readonly string[];
  readonly createdAt: string;   // ISO 8601
  readonly updatedAt: string;   // ISO 8601
}

export interface ToolPresetsData {
  readonly presets: readonly ToolPreset[];
}
