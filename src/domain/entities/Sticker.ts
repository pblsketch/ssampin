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
  /**
   * 카카오톡 호환용 — 투명 PNG의 알파 영역을 흰색으로 합쳐서 클립보드에 올린다.
   * Windows 표준 클립보드(CF_BITMAP)는 알파를 못 다뤄 카톡 등에서 검은 배경으로
   * 보이는 문제가 있음. true면 paste 직전에 흰 배경 위에 합성한다.
   *
   * default false — Discord/Slack/메모/한컴 등 다수 앱에서 투명 배경을 보존하기 위해
   * 알파 보존을 기본값으로 한다. 카톡에서 검정으로 보일 경우 사용자가 토글 ON 가능.
   */
  readonly flattenAlphaOnPaste: boolean;  // default false (투명 우선)
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
  flattenAlphaOnPaste: false,
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
