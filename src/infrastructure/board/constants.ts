/**
 * 협업 보드 인프라 상수 — Design §10.3
 */

export const EXCALIDRAW_VERSION = '0.17.6' as const;
export const REACT_VERSION = '18.3.1' as const;
export const YJS_VERSION = '13.6.19' as const;
export const Y_WEBSOCKET_VERSION = '2.0.4' as const;
export const Y_EXCALIDRAW_VERSION = '2.0.12' as const;
export const FRACTIONAL_INDEXING_VERSION = '3.2.0' as const;

/** 자동 저장 주기 (ms) — Design §3.1 step 9 */
export const AUTO_SAVE_INTERVAL_MS = 30_000;
/** cloudflared idle timeout 방어용 heartbeat 주기 (ms) — Plan R3 / Design FR-11 */
export const HEARTBEAT_INTERVAL_MS = 25_000;
/** 연결 수 제한 — Design §7.4 */
export const MAX_PARTICIPANTS = 50;
/** before-quit 동기 저장 최대 대기 시간 — Design §3.2-bis */
export const BEFORE_QUIT_DEADLINE_MS = 2_000;

/** 보드 파일 저장 경로 (userData 상대) */
export const BOARDS_DIR_NAME = 'boards';
export const SNAPSHOT_FILE_EXT = '.ybin';
export const META_FILE_EXT = '.json';

/** BoardId 포맷 — Design §2.2 */
export const BOARD_ID_PREFIX = 'bd-';
export const BOARD_ID_SUFFIX_LENGTH = 14;

/** WebSocket close code */
export const WS_CLOSE_AUTH_FAILED = 1008;
export const WS_CLOSE_SERVER_FULL = 1013;
