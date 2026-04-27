/** 이모티콘(스티커) 메타데이터 */
export interface Sticker {
  readonly id: string;            // nanoid
  readonly name: string;
  readonly tags: readonly string[];
  readonly packId: string;
  readonly createdAt: string;     // ISO 8601
  readonly usageCount: number;
  readonly lastUsedAt: string | null;
  readonly contentHash?: string;  // SHA-256 (16자) for dedup
}

/** 이모티콘 팩 (카테고리) */
export interface StickerPack {
  readonly id: string;
  readonly name: string;
  readonly order: number;
  readonly createdAt: string;
}

/** 이모티콘 사용자 설정 */
export interface StickerSettings {
  readonly autoPaste: boolean;            // default true
  readonly restorePreviousClipboard: boolean; // default false
  readonly recentMaxCount: number;        // default 8
  readonly shortcut: string | null;       // null = disabled, e.g. 'Ctrl+Shift+E'
}

/** 이모티콘 저장소 루트 (schemaVersion 포함) */
export interface StickersData {
  readonly schemaVersion: 1;
  readonly stickers: readonly Sticker[];
  readonly packs: readonly StickerPack[];
  readonly settings: StickerSettings;
}

export const DEFAULT_STICKER_SETTINGS: StickerSettings = {
  autoPaste: true,
  restorePreviousClipboard: false,
  recentMaxCount: 8,
  shortcut: 'CommandOrControl+Shift+E',
};

export const DEFAULT_PACK_ID = 'default';

export const createDefaultPack = (now: string): StickerPack => ({
  id: DEFAULT_PACK_ID,
  name: '미분류',
  order: 0,
  createdAt: now,
});

export const createEmptyStickersData = (now: string): StickersData => ({
  schemaVersion: 1,
  stickers: [],
  packs: [createDefaultPack(now)],
  settings: DEFAULT_STICKER_SETTINGS,
});
