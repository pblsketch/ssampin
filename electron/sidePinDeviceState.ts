/**
 * 옆핀 기기 전용 상태 저장 — 어느 모니터에, 얼마나 넓게 띄울지.
 *
 * 이 값은 동기화하지 않는다. 학교 컴퓨터와 집 노트북은 모니터 구성이 다르므로,
 * 동기화 설정에 넣으면 서로의 값을 계속 덮어쓴다.
 *
 * 저장은 "임시 파일에 쓰고 → 읽어서 확인하고 → 이름을 바꿔치기" 순서다. 그냥 덮어쓰면
 * 쓰는 도중에 앱이 꺼졌을 때 반쯤 쓰인 파일이 남는다. 이름 바꾸기는 한 번에 끝나므로
 * 어느 시점에 꺼져도 파일은 항상 온전한 이전 값이거나 온전한 새 값이다.
 *
 * 저장 경로는 인자로 받는다(호출자가 `app.getPath('userData')`를 넘긴다).
 * 덕분에 vitest에서 실제 파일로 단위 테스트할 수 있다 — archiveManager 선례.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ MIRROR 블록: 아래 "MIRROR of ..." 구간은 도메인 정본
 * `src/domain/entities/SidePinDeviceState.ts` + `src/domain/valueObjects/SidePinWidth.ts`의
 * 순수 함수를 그대로 복제한 것이다.
 * (electron rootDir 제약으로 @domain import 불가 — archiveRules ↔ archiveManager 선례.)
 * 정본을 고치면 여기도 반드시 함께 고친다. 동치는 `electron/sidePinDeviceState.mirror.test.ts`가 강제한다.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import path from 'path';
import fs from 'fs';

// ═════════════════════════════════════════════════════════════════════════════
// MIRROR of src/domain/valueObjects/SidePinWidth.ts + entities/SidePinDeviceState.ts
// 여기부터. 로직 수정 금지(정본 먼저).
// ═════════════════════════════════════════════════════════════════════════════

export const SIDE_PIN_WIDTH_MIN = 360;
export const SIDE_PIN_WIDTH_MAX = 460;
export const SIDE_PIN_WIDTH_DEFAULT = 400;
export const SIDE_PIN_DEVICE_STATE_SCHEMA_VERSION = 1;
/** 손잡이 세로 위치의 기본값. 예전 8단계의 3번 칸과 같은 자리다. */
export const SIDE_PIN_RAIL_POSITION_DEFAULT = 3 / 7;
/** v2.4.0 이전 개발본이 쓰던 8단계 칸 번호의 최댓값. 비율로 옮길 때만 쓴다. */
const LEGACY_RAIL_SLOT_MAX = 7;

export interface SidePinDeviceState {
  readonly schemaVersion: number;
  readonly displayId: string | null;
  readonly panelWidth: number;
  /**
   * 손잡이 세로 위치. 0은 맨 위, 1은 맨 아래다.
   *
   * 픽셀이 아니라 **쓸 수 있는 높이 대비 비율**로 둔다. 해상도나 모니터가 바뀌어도
   * 그대로 유효하고, 화면 밖으로 나갈 수 없다.
   *
   * 처음에는 8단계 칸 번호였는데, 한 칸이 124 DIP라 손을 뗄 때 창이 커서 밑에서
   * 최대 반 칸 빠져나갔다. 그러면 끌기 자리가 손 밑에 없어 **두 번째 끌기가
   * 시작되지 않는다**(2026-08-17 실기기). 튀지 않도록 놓은 자리를 그대로 쓴다.
   */
  readonly railPosition: number;
}

export const DEFAULT_SIDE_PIN_DEVICE_STATE: SidePinDeviceState = {
  schemaVersion: SIDE_PIN_DEVICE_STATE_SCHEMA_VERSION,
  displayId: null,
  panelWidth: SIDE_PIN_WIDTH_DEFAULT,
  railPosition: SIDE_PIN_RAIL_POSITION_DEFAULT,
};

export function normalizeSidePinRailPosition(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return SIDE_PIN_RAIL_POSITION_DEFAULT;
  return Math.min(1, Math.max(0, value));
}

/**
 * 저장본에서 손잡이 위치를 읽는다.
 *
 * 8단계 칸 번호로 저장된 개발본이 남아 있어 비율로 옮겨 준다. 출시 후에는 지워도 된다.
 */
function readRailPosition(raw: {
  readonly railPosition?: unknown;
  readonly railSlot?: unknown;
}): number {
  if (raw.railPosition !== undefined) return normalizeSidePinRailPosition(raw.railPosition);
  if (typeof raw.railSlot === 'number' && Number.isFinite(raw.railSlot)) {
    return normalizeSidePinRailPosition(raw.railSlot / LEGACY_RAIL_SLOT_MAX);
  }
  return SIDE_PIN_RAIL_POSITION_DEFAULT;
}

export function clampSidePinWidth(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return SIDE_PIN_WIDTH_DEFAULT;
  }
  const rounded = Math.round(value);
  if (rounded < SIDE_PIN_WIDTH_MIN) return SIDE_PIN_WIDTH_MIN;
  if (rounded > SIDE_PIN_WIDTH_MAX) return SIDE_PIN_WIDTH_MAX;
  return rounded;
}

export function normalizeSidePinDisplayId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function normalizeSidePinDeviceState(value: unknown): SidePinDeviceState {
  if (value === null || typeof value !== 'object') {
    return DEFAULT_SIDE_PIN_DEVICE_STATE;
  }
  const raw = value as Partial<Record<keyof SidePinDeviceState, unknown>>;

  return {
    schemaVersion: SIDE_PIN_DEVICE_STATE_SCHEMA_VERSION,
    displayId: normalizeSidePinDisplayId(raw.displayId),
    panelWidth: clampSidePinWidth(raw.panelWidth),
    railPosition: readRailPosition(
      raw as { readonly railPosition?: unknown; readonly railSlot?: unknown },
    ),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// MIRROR 끝 — 여기부터는 electron 전용(fs) 구현.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * 저장 결과.
 *
 * 성공/실패 둘로만 나누면 "본 파일은 잘 썼는데 예비 사본만 실패한" 경우를 실패로
 * 처리해 방금 저장한 값을 버리게 된다. 그래서 세 가지로 구분한다.
 */
export type SidePinDeviceStateSaveResult = 'saved' | 'saved-with-backup-warning' | 'failed';

export const SIDE_PIN_DEVICE_STATE_FILENAME = 'side-pin-device-state.json';
export const SIDE_PIN_DEVICE_STATE_BACKUP_FILENAME = 'side-pin-device-state.backup.json';

function primaryPath(userDataDir: string): string {
  return path.join(userDataDir, SIDE_PIN_DEVICE_STATE_FILENAME);
}

function backupPath(userDataDir: string): string {
  return path.join(userDataDir, SIDE_PIN_DEVICE_STATE_BACKUP_FILENAME);
}

/** 파일을 읽어 파싱한다. 없거나 깨졌으면 null */
function readJsonFile(filePath: string): unknown {
  try {
    const text = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * 저장된 상태를 읽는다.
 *
 * 본 파일이 없거나 깨졌으면 예비 사본을 본다. 둘 다 못 쓰면 기본값이다.
 * 어느 경우에도 예외를 던지지 않는다 — 이 파일 하나 때문에 옆핀이 아예 안 뜨면
 * 사용자는 원인을 알 방법이 없다.
 */
export function loadSidePinDeviceState(userDataDir: string): SidePinDeviceState {
  const primary = readJsonFile(primaryPath(userDataDir));
  if (primary !== null && typeof primary === 'object') {
    return normalizeSidePinDeviceState(primary);
  }

  const backup = readJsonFile(backupPath(userDataDir));
  if (backup !== null && typeof backup === 'object') {
    return normalizeSidePinDeviceState(backup);
  }

  return DEFAULT_SIDE_PIN_DEVICE_STATE;
}

/**
 * 임시 파일에 쓰고, 읽어서 온전한지 확인한 뒤, 제자리로 옮긴다.
 *
 * 확인 단계가 중요하다. 디스크가 꽉 찼을 때 write는 성공한 것처럼 보이면서 내용이
 * 잘리는 경우가 있는데, 그대로 이름을 바꾸면 멀쩡한 이전 파일을 깨진 파일로 덮게 된다.
 */
function writeFileAtomic(targetPath: string, text: string): void {
  const tempPath = `${targetPath}.tmp`;
  const handle = fs.openSync(tempPath, 'w');
  try {
    fs.writeFileSync(handle, text, 'utf-8');
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }

  const written = fs.readFileSync(tempPath, 'utf-8');
  if (written !== text) {
    fs.rmSync(tempPath, { force: true });
    throw new Error('임시 파일 내용이 쓰려던 값과 다르다');
  }

  // Windows에서 rename은 MoveFileEx(REPLACE_EXISTING)로 매핑돼 같은 볼륨 안에서는
  // 한 번에 바꿔치기된다. 중간 상태가 남지 않는다.
  fs.renameSync(tempPath, targetPath);
}

/**
 * 상태를 저장한다.
 *
 * 본 파일을 먼저 바꾸고, 성공하면 예비 사본을 갱신한다. 순서가 중요하다 —
 * 예비 사본을 먼저 덮으면 본 파일 저장이 실패했을 때 되돌아갈 곳이 사라진다.
 *
 * 쓰기는 동기 함수라 한 번에 하나씩만 진행된다. 별도의 대기열이 필요 없다.
 */
export function saveSidePinDeviceState(
  userDataDir: string,
  state: SidePinDeviceState,
): SidePinDeviceStateSaveResult {
  const normalized = normalizeSidePinDeviceState(state);
  const text = `${JSON.stringify(normalized, null, 2)}\n`;

  try {
    fs.mkdirSync(userDataDir, { recursive: true });
    writeFileAtomic(primaryPath(userDataDir), text);
  } catch {
    // 본 파일을 못 썼으면 기존 파일을 그대로 둔다. 방금 값은 버린다.
    return 'failed';
  }

  try {
    writeFileAtomic(backupPath(userDataDir), text);
  } catch {
    // 본 파일은 살아 있으므로 값은 지켜졌다. 예비 사본만 없는 상태다.
    return 'saved-with-backup-warning';
  }

  return 'saved';
}
