/**
 * 할 일 알람 스냅샷 — `userData/notify-state.json` 읽기/쓰기.
 *
 * **무엇을 저장하나.** `todo` 칸 예약 목록과 발화 이력, 두 가지뿐이다.
 * `record`(학생 관찰 기록) 칸은 저장하지 않는다 — 오늘과 똑같이 렌더러가 매번 다시 보낸다.
 * 출시된 동작을 바꾸지 않기 위해서다.
 *
 * **왜 저장하나.** 앱을 바탕화면 위젯·옆핀·아이콘 모습으로 켜고 "메모리 절약"이 켜져 있으면
 * 메인 화면 렌더러가 아예 파괴된다. 그러면 할 일 알람을 계산해 보내 줄 사람이 없어져
 * **콜드 부팅 직후 알람이 0건**이 된다. main 이 마지막 목록을 들고 있으면 혼자서도 울린다.
 *
 * ⚠️ 이 파일을 `syncRegistry` 에 등재하지 말 것. 기기마다 다른 상태이고, 동기화 대상에 넣으면
 *    다른 기기의 오래된 사본이 이미 울린 알림을 되살린다(ADR-039/040 과 같은 실패).
 *
 * ⚠️ 동시 쓰기 위험 없음 — `main.ts` 의 `app.requestSingleInstanceLock()` 덕에 앱은 한
 *    프로세스뿐이고, 옆핀·위젯은 렌더러라 이 파일을 건드리지 않는다.
 *
 * 파일 없음·깨진 JSON·형태 불일치·권한 실패는 **전부 빈 상태로 조용히 폴백**한다.
 * 알림이 안 오는 건 나쁘지만 앱이 죽는 건 더 나쁘다.
 */

import fs from 'fs';
import path from 'path';
import {
  isFiredEntry,
  isValidItem,
  pruneFiredLedger,
  type FiredEntry,
  type ReminderScheduleItem,
} from './reminderCore';

export interface ReminderPersistedState {
  /** `todo` 칸 예약 스냅샷 */
  readonly todo: readonly ReminderScheduleItem[];
  /** 발화 이력 — 재시작 후 같은 알림이 또 울리는 것을 막는다 */
  readonly fired: readonly FiredEntry[];
  /** 저장 시각 (Unix ms) */
  readonly savedAt: number;
}

export const EMPTY_PERSISTED_STATE: ReminderPersistedState = { todo: [], fired: [], savedAt: 0 };

const FILE_NAME = 'notify-state.json';
const TEMP_NAME = 'notify-state.tmp.json';

let baseDir: string | null = null;

/** main.ts 가 `app.whenReady()` 후 1회 호출한다. 미초기화면 읽기·쓰기가 조용히 no-op 이다. */
export function initReminderState(userDataPath: string): void {
  baseDir = userDataPath;
}

function filePath(): string | null {
  return baseDir === null ? null : path.join(baseDir, FILE_NAME);
}

/**
 * 저장된 상태를 읽는다. **읽은 항목은 `isValidItem` 을 다시 통과해야 한다.**
 *
 * 왜 다시 검사하나: JSON 자체는 멀쩡한데 **형태만 다른** 경우가 실제로 생긴다 —
 * 사용자가 옛 버전으로 되돌렸거나, 앞으로 필드가 바뀌었을 때다. 그때 형태 검사를 건너뛰면
 * 이상한 값이 그대로 타이머까지 흘러간다.
 */
export function readReminderState(now: number): ReminderPersistedState {
  const p = filePath();
  if (p === null) return EMPTY_PERSISTED_STATE;
  let raw: string;
  try {
    if (!fs.existsSync(p)) return EMPTY_PERSISTED_STATE;
    raw = fs.readFileSync(p, 'utf-8');
  } catch {
    return EMPTY_PERSISTED_STATE; // 권한 실패 등
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_PERSISTED_STATE; // 깨진 JSON
  }
  if (typeof parsed !== 'object' || parsed === null) return EMPTY_PERSISTED_STATE;

  const obj = parsed as Record<string, unknown>;
  const todoRaw = obj['todo'];
  const firedRaw = obj['fired'];
  const savedAt = typeof obj['savedAt'] === 'number' ? obj['savedAt'] : 0;

  return {
    todo: Array.isArray(todoRaw) ? todoRaw.filter(isValidItem) : [],
    fired: pruneFiredLedger(Array.isArray(firedRaw) ? firedRaw.filter(isFiredEntry) : [], now),
    savedAt,
  };
}

/**
 * 원자적으로 쓴다 — 임시 파일에 쓰고, **읽어서 길이를 비교한 뒤**, 이름을 바꾼다.
 *
 * 중간에 전원이 나가도 원본이 반쪽짜리가 되지 않는다. `backupManager.ts` 의 복원 저장과
 * 같은 패턴이다.
 *
 * @returns 저장 성공 여부. 실패해도 던지지 않는다 — 알림 저장 실패가 앱을 멈춰선 안 된다.
 */
export function writeReminderState(state: ReminderPersistedState): boolean {
  if (baseDir === null) return false;
  const p = path.join(baseDir, FILE_NAME);
  const tmp = path.join(baseDir, TEMP_NAME);
  let json: string;
  try {
    json = JSON.stringify(state);
  } catch {
    return false;
  }
  try {
    fs.writeFileSync(tmp, json, 'utf-8');
    const verify = fs.readFileSync(tmp, 'utf-8');
    if (verify.length !== json.length) {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* 임시 파일 정리 실패는 무시 */
      }
      return false;
    }
    fs.renameSync(tmp, p);
    return true;
  } catch {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* 무시 */
    }
    return false;
  }
}

/** 테스트에서 초기화 상태를 되돌린다. */
export function __resetReminderStateForTest(): void {
  baseDir = null;
}
