/**
 * Sticker Electron API 타입 (단일 소스 — 컴포넌트 import용).
 *
 * `window.electronAPI.sticker`의 타입은 `src/global.d.ts`의 `ElectronAPI` 인터페이스에
 * 직접 선언되어 있다 (declaration merging 의존성 제거 — TS 모듈/ambient 충돌 회피).
 * 본 파일은 컴포넌트가 `import type { StickerElectronAPI }`로 시그니처를 참조할 때
 * 사용할 수 있도록 동일한 타입 정의를 named export 한다.
 *
 * ⚠️ global.d.ts와 본 파일의 타입은 일치해야 한다 (수동 동기화).
 */

export interface StickerSelectImageResult {
  readonly canceled: boolean;
  readonly filePaths: readonly string[];
}

export interface StickerImportImageResult {
  readonly contentHash: string;
}

/** paste 실패 사유 — discriminated string. 추가 사유는 string 폴백으로 호환. */
export type StickerPasteReason =
  | 'accessibility-denied'
  | 'osascript-failed'
  | 'unsupported-platform'
  | (string & {});

export interface StickerPasteResult {
  readonly ok: boolean;
  readonly autoPasted: boolean;
  readonly reason?: StickerPasteReason;
}

export interface StickerAccessibilityResult {
  readonly granted: boolean;
  readonly requested: boolean;
  readonly reason?: string;
}

export interface StickerPlatformResult {
  readonly platform: 'win32' | 'darwin' | 'linux';
}

/** Phase 2B 시트 분할 셀 미리보기 */
export interface StickerSheetCellPreview {
  readonly index: number;
  readonly row: number;
  readonly col: number;
  readonly contentHash: string;
  readonly isEmpty: boolean;
  readonly dataUrl: string;
}

export interface StickerSplitSheetResult {
  readonly sessionId: string;
  readonly gridSize: 2 | 3 | 4;
  readonly sheetWidth: number;
  readonly sheetHeight: number;
  readonly cells: ReadonlyArray<StickerSheetCellPreview>;
}

export interface StickerCommitSheetCellsResult {
  readonly committed: ReadonlyArray<{
    readonly index: number;
    readonly stickerId: string;
    readonly contentHash: string;
  }>;
}

export interface StickerElectronAPI {
  /** OS 파일 선택 다이얼로그 (이미지 필터 적용) */
  selectImage: () => Promise<StickerSelectImageResult>;
  /** 임시 경로의 이미지를 정규화하여 stickers/{id}.png로 영속화 */
  importImage: (
    stickerId: string,
    sourcePath: string,
  ) => Promise<StickerImportImageResult>;
  /** 저장된 이모티콘 PNG를 data:URL로 반환 (썸네일 렌더용) */
  getImageDataUrl: (stickerId: string) => Promise<string | null>;
  /** 이모티콘 PNG 파일 삭제 */
  deleteImage: (stickerId: string) => Promise<void>;
  /** 클립보드 복사 + 자동 붙여넣기 */
  paste: (
    stickerId: string,
    restorePreviousClipboard: boolean,
  ) => Promise<StickerPasteResult>;
  /** 피커 윈도우 hide */
  closePicker: () => Promise<void>;
  /** 글로벌 단축키 등록 실패 fallback — 메인 윈도우 keydown에서 호출 */
  triggerToggle?: () => Promise<void>;
  /** 단축키 충돌 알림 */
  onShortcutConflict: (cb: (combo: string) => void) => () => void;
  /**
   * 이모티콘 데이터 변경 알림 (관리 화면 → 피커 윈도우 broadcast 트리거).
   * renderer가 metadata를 저장한 직후 호출하면 main이 stickerPickerWindow에
   * `sticker:data-changed` 이벤트를 송신한다.
   */
  notifyDataChanged?: () => Promise<void>;
  /**
   * 피커 윈도우에서 데이터 변경 알림을 구독한다. 리스너가 호출되면
   * 피커는 store 캐시를 무효화하고 다시 load() 해야 한다.
   */
  onDataChanged?: (cb: () => void) => () => void;
  /**
   * 피커 빈 상태에서 "쌤도구 열기"를 눌렀을 때, 메인 창을 포커싱하고
   * `tool-sticker` 페이지로 이동시킨다.
   */
  openManager?: () => Promise<void>;
  /**
   * macOS 전용 — 접근성 권한 요청 (PRD §4.1.1 Phase 2).
   * paste reason='accessibility-denied' 토스트의 "권한 허용하기" 버튼에서 호출.
   * 시스템 권한 다이얼로그 표시 + 거부 시 보안 패널 자동 오픈.
   */
  requestAccessibilityPermission?: () => Promise<StickerAccessibilityResult>;
  /**
   * 현재 OS 플랫폼 — 렌더러가 macOS 전용 UI(접근성 안내 등)를 조건부 렌더링.
   */
  getPlatform?: () => Promise<StickerPlatformResult>;
  // ─── Phase 2B 시트 분할 (PRD §3.4.3) ───
  /** 시트 dimension 검증 — renderer가 grid size 선택 전 호출 */
  validateSheet?: (sourcePath: string) => Promise<{ width: number; height: number }>;
  /** 시트를 N×N으로 분할 → 미리보기 dataUrl + sessionId */
  splitSheet?: (
    sourcePath: string,
    gridSize: 2 | 3 | 4,
  ) => Promise<StickerSplitSheetResult>;
  /** 사용자가 선택한 셀들을 stickers/{id}.png로 저장 */
  commitSheetCells?: (
    sessionId: string,
    cells: ReadonlyArray<{ index: number; stickerId: string }>,
  ) => Promise<StickerCommitSheetCellsResult>;
  /** 분할 세션 취소 (모달 닫기 시) */
  cancelSheetSession?: (sessionId: string) => Promise<{ ok: boolean }>;
}

export {};
