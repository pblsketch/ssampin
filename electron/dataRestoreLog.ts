/**
 * 복원 기록 — 원본·백업이 모두 깨진 사용자 자료를 시작 스냅샷으로 되돌린 사실(ADR-148).
 *
 * 위치는 `backups/restore-log` 다. 이름이 `.json` 으로 끝나지 않게 했다 — 데이터 폴더의 `*.json` 을
 * 모으는 백업·동기화가 이 기록을 자료로 주워 가지 않도록.
 *
 * 이 기록이 하는 일:
 *  - 화면(메인 창)이 아직 알리지 않은 복원을 한 번 알린다(`notified`).
 *  - 구글 드라이브 동기화가 되돌린 옛 내용으로 클라우드의 더 새 사본을 덮지 않게 한다(`syncResolved`).
 *
 * ★이 기록이 깨지거나 읽히지 않으면 "없음"으로 보지 않는다. 없음으로 보면 안 풀린 보호가 조용히 사라져
 *   되돌린 옛 내용이 클라우드를 덮는다. 깨졌으면 깨진 기록을 옆에 복사해 둔 뒤 **보수적으로 다시 만든다** —
 *   자료 폴더에 남은 복원 격리 사본(`<자료>.json.corrupt-<시각>`)마다 "아직 클라우드와 맞춰지지 않음"으로
 *   적어 다시 보호한다(받기에서 충돌로 한 번 묻고, 이미 같으면 맞춰짐으로 풀린다). 다시 만들기 자체가
 *   실패할 때만 그 요청(동기화·복원)을 멈추고, 다음 요청·다음 실행에서 다시 시도한다(영구 교착 금지).
 *
 * 학생 정보·파일 내용은 담지 않는다 — 자료 이름·날짜·격리 파일 이름·시각뿐이다.
 * electron 모듈 import 없음 — 단위 테스트 가능.
 */
import fs from 'fs';
import path from 'path';
import { isRebuildableStateFile } from './dataFileRules';
import { copyFileAside, fileErrorCode, replaceFileDurably } from './dataFileWrite';

export interface DataRestoreEntry {
  /** 기록 하나의 이름. 알림 처리 표시에 쓴다. */
  readonly id: string;
  /** 자료 이름(데이터 파일 이름에서 `.json` 을 뺀 것 — 동기화 키와 같다). */
  readonly file: string;
  /** 되돌린 스냅샷의 날짜(`YYYY-MM-DD`, 로컬). */
  readonly snapshotDate: string;
  /** 되돌린 스냅샷 파일의 수정 시각(ISO) — "그 상태"의 시각으로 화면에 보인다. */
  readonly snapshotModifiedAt: string;
  /** 깨진 원본을 복사해 둔 파일 이름(데이터 폴더 안). */
  readonly quarantinedAs: string;
  /** 깨진 백업을 복사해 둔 파일 이름. 백업이 없었으면 없음. */
  readonly quarantinedBackupAs?: string;
  /** 복원한 시각(ISO). */
  readonly restoredAt: string;
  /**
   * 원본 자리에 스냅샷 내용을 써 넣었는가. 기록을 먼저 false 로 남긴 뒤 교체하고, 성공하면 true 로 고친다.
   * false 로 남아 있으면 그 실행에서 읽기 결과로만 쓰였거나 교체 직후 꺼진 것이다.
   */
  readonly written: boolean;
  /** 메인 창이 선생님께 알렸는가. */
  readonly notified: boolean;
  /** 클라우드 사본과 맞춰졌는가(충돌 해결·내용 일치·원격 사본 없음). */
  readonly syncResolved: boolean;
  /**
   * 동기화 보호를 푼 까닭이 "맞춰짐"이 아닐 때. `year-transition`: 학년도 전환 표시가 걸린 키라
   * 이 기기가 새 학년도 기준이어서 복원 보호 없이 올렸다.
   */
  readonly syncResolvedBy?: 'year-transition';
  /**
   * 깨진 기록을 격리 사본으로 다시 만든 항목. 원천 스냅샷 날짜·시각은 알 수 없어 빈 문자열이다
   * (충돌 창에는 "시각 알 수 없음"으로 보인다). 알림은 다시 띄우지 않는다(`notified: true`).
   */
  readonly rebuilt?: boolean;
}

interface RestoreLogFile {
  readonly version: 1;
  readonly entries: readonly DataRestoreEntry[];
}

/** 끝난 기록(알림·동기화 모두 처리)은 이만큼만 남긴다. 처리 중인 기록은 개수와 상관없이 남긴다. */
const MAX_FINISHED_ENTRIES = 30;

export function restoreLogPath(dataDir: string): string {
  return path.join(dataDir, 'backups', 'restore-log');
}

function isEntry(value: unknown): value is DataRestoreEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['id'] === 'string' &&
    typeof v['file'] === 'string' &&
    typeof v['snapshotDate'] === 'string' &&
    typeof v['snapshotModifiedAt'] === 'string' &&
    typeof v['quarantinedAs'] === 'string' &&
    typeof v['restoredAt'] === 'string' &&
    typeof v['written'] === 'boolean' &&
    typeof v['notified'] === 'boolean' &&
    typeof v['syncResolved'] === 'boolean'
  );
}

export type RestoreLogRead =
  | { readonly ok: true; readonly entries: DataRestoreEntry[] }
  /** corrupt: 읽혔는데 모양이 틀리다. unreadable: 읽기 자체가 막혔다(잠금 등). */
  | { readonly ok: false; readonly reason: 'corrupt' | 'unreadable'; readonly code: string };

/** 기록을 읽는다. 파일이 없으면 빈 목록이다. 깨졌거나 읽지 못하면 `ok: false` — 빈 목록으로 삼키지 않는다. */
export function readRestoreLog(dataDir: string): RestoreLogRead {
  let raw: string;
  try {
    raw = fs.readFileSync(restoreLogPath(dataDir), 'utf-8');
  } catch (err) {
    const code = fileErrorCode(err);
    if (code === 'ENOENT') return { ok: true, entries: [] };
    return { ok: false, reason: 'unreadable', code };
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'object' && parsed !== null) {
      const entries = (parsed as { entries?: unknown }).entries;
      if (Array.isArray(entries) && entries.every(isEntry)) return { ok: true, entries };
    }
  } catch {
    // 아래에서 깨짐으로 돌려준다
  }
  return { ok: false, reason: 'corrupt', code: 'ECORRUPT' };
}

/**
 * 깨진 기록을 `restore-log.corrupt-<시각>` 으로 복사해 둔다(원래 파일은 그대로 — 덮어쓰지 않는다).
 * 같은 내용의 사본이 이미 있으면 또 만들지 않는다. 사본이 있게 됐으면 true.
 */
export function preserveCorruptRestoreLog(dataDir: string, now: Date = new Date()): boolean {
  const source = restoreLogPath(dataDir);
  try {
    const bytes = fs.readFileSync(source);
    const dir = path.dirname(source);
    const already = fs
      .readdirSync(dir)
      .filter((name) => name.startsWith('restore-log.corrupt-'))
      .some((name) => fs.readFileSync(path.join(dir, name)).equals(bytes));
    if (!already) copyFileAside(source, now);
    return true;
  } catch (err) {
    console.warn(`[restore-log] 깨진 복원 기록 사본을 남기지 못함 (${fileErrorCode(err)})`);
    return false;
  }
}

/** 자료 폴더의 복원 격리 사본 이름: `<자료>.json.corrupt-<시각>`(백업 사본 `<자료>.backup.json.corrupt-…` 은 제외). */
const RESTORE_QUARANTINE_NAME = /^(.+)\.json\.corrupt-[^/\\]+$/;

/**
 * 깨진 기록 대신 쓸 보수적인 기록을 만든다 — 자료 폴더에 남은 복원 격리 사본마다 항목 하나
 * (`written: true`·`notified: true`·`syncResolved: false`·`rebuilt: true`). 사본이 오래됐어도 보호한다:
 * 잘못 보호하면 충돌 창이 한 번 뜨고 끝나지만, 잘못 풀면 옛 내용이 클라우드를 덮는다.
 * 상태 파일 2종의 격리 사본은 복원이 아니라 초기화라 넣지 않는다.
 */
export function rebuildRestoreEntries(dataDir: string): DataRestoreEntry[] {
  const latest = new Map<string, { name: string; mtimeMs: number }>();
  for (const name of fs.readdirSync(dataDir)) {
    const match = RESTORE_QUARANTINE_NAME.exec(name);
    const file = match?.[1];
    if (file === undefined || file.endsWith('.backup') || isRebuildableStateFile(file)) continue;
    const mtimeMs = fs.statSync(path.join(dataDir, name)).mtimeMs;
    const seen = latest.get(file);
    if (!seen || mtimeMs > seen.mtimeMs) latest.set(file, { name, mtimeMs });
  }
  return [...latest.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([file, { name, mtimeMs }]) => ({
      id: `${file}@rebuilt-${name}`,
      file,
      snapshotDate: '',
      snapshotModifiedAt: '',
      quarantinedAs: name,
      restoredAt: new Date(mtimeMs).toISOString(),
      written: true,
      notified: true,
      syncResolved: false,
      rebuilt: true,
    }));
}

function writeRestoreLogFile(dataDir: string, entries: readonly DataRestoreEntry[]): boolean {
  const target = restoreLogPath(dataDir);
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
  } catch {
    return false;
  }
  const body: RestoreLogFile = { version: 1, entries: prune(entries) };
  return replaceFileDurably(target, `${target}.tmp`, JSON.stringify(body, null, 2)).ok;
}

/**
 * 기록을 읽되, 깨졌으면 깨진 기록을 복사해 두고 격리 사본으로 다시 만들어 쓴 뒤 그 내용을 돌려준다.
 * 다시 만들기가 실패하면(사본을 못 남김·쓰기 실패 등) `ok: false` — 깨진 기록은 그대로 남고 다음 요청에서
 * 다시 시도한다. 읽기 자체가 막힌 것(잠금)은 다시 만들지 않는다(온전한 기록일 수 있다).
 */
export function readRestoreLogRepairing(dataDir: string, now: Date = new Date()): RestoreLogRead {
  const read = readRestoreLog(dataDir);
  if (read.ok || read.reason !== 'corrupt') return read;
  const failed: RestoreLogRead = { ok: false, reason: 'corrupt', code: 'EREBUILD' };
  if (!preserveCorruptRestoreLog(dataDir, now)) return failed;
  let entries: DataRestoreEntry[];
  try {
    entries = rebuildRestoreEntries(dataDir);
  } catch (err) {
    console.error(`[restore-log] 복원 기록을 다시 만들지 못함 (${fileErrorCode(err)})`);
    return failed;
  }
  if (!writeRestoreLogFile(dataDir, entries)) {
    console.error('[restore-log] 다시 만든 복원 기록을 쓰지 못함');
    return failed;
  }
  console.warn(`[restore-log] 깨진 복원 기록을 격리 사본 ${entries.length}건으로 다시 만듦`);
  return { ok: true, entries };
}

function prune(entries: readonly DataRestoreEntry[]): DataRestoreEntry[] {
  const finished = entries.filter((e) => e.notified && e.syncResolved);
  const dropped = new Set(finished.slice(0, Math.max(0, finished.length - MAX_FINISHED_ENTRIES)));
  return entries.filter((e) => !dropped.has(e));
}

/**
 * 기록 전체를 저장과 같은 길(임시 파일 + fsync + 검증 + 교체)로 쓴다. 성공 여부를 돌려준다.
 * ★지금 디스크의 기록이 깨졌거나 읽히지 않으면 쓰지 않는다(깨진 기록 위에 덮지 않는다).
 */
export function writeRestoreLog(dataDir: string, entries: readonly DataRestoreEntry[]): boolean {
  const current = readRestoreLog(dataDir);
  if (!current.ok) {
    if (current.reason === 'corrupt') preserveCorruptRestoreLog(dataDir);
    return false;
  }
  return writeRestoreLogFile(dataDir, entries);
}

/**
 * 기록 하나를 넣는다(같은 id 가 있으면 갈아 끼운다). 성공 여부를 돌려준다.
 * 지금 기록이 깨졌거나 읽히지 않으면 쓰지 않고 false — 호출 쪽은 복원하지 않는다.
 */
export function upsertRestoreEntry(dataDir: string, entry: DataRestoreEntry): boolean {
  const current = readRestoreLogRepairing(dataDir);
  if (!current.ok) return false;
  const exists = current.entries.some((e) => e.id === entry.id);
  const next = exists
    ? current.entries.map((e) => (e.id === entry.id ? entry : e))
    : [...current.entries, entry];
  return writeRestoreLog(dataDir, next);
}

/** 고른 기록에 표시를 붙인다. 바뀐 것이 없으면 쓰지 않는다. */
export function markRestoreEntries(
  entries: readonly DataRestoreEntry[],
  pick: (entry: DataRestoreEntry) => boolean,
  field: 'notified' | 'syncResolved',
  syncResolvedBy?: 'year-transition',
): { readonly next: DataRestoreEntry[]; readonly changed: boolean } {
  let changed = false;
  const next = entries.map((entry) => {
    if (entry[field] || !pick(entry)) return entry;
    changed = true;
    return field === 'syncResolved' && syncResolvedBy !== undefined
      ? { ...entry, syncResolved: true, syncResolvedBy }
      : { ...entry, [field]: true };
  });
  return { next, changed };
}

/** 복원 기록을 읽지 못했을 때 화면으로 넘기는 오류. 동기화는 이 오류로 멈춘다(덮어쓰지 않는다). */
export const RESTORE_LOG_UNAVAILABLE_MESSAGE =
  '자료 복원 기록을 읽지 못해 클라우드 자료를 덮지 않도록 이번 동기화를 멈췄어요. 다음 동기화나 쌤핀을 다시 켤 때 기록을 다시 만들어 이어서 동기화해요.';

export interface RestoreRegistry {
  /** 이번 실행에서 복원한 기록을 넣는다(같은 id 면 갈아 끼운다 — 써 넣기 결과 갱신). */
  readonly add: (entry: DataRestoreEntry) => void;
  /** 지금까지의 기록. 디스크 기록이 깨졌거나 읽히지 않으면 예외(`RESTORE_LOG_UNAVAILABLE_MESSAGE`). */
  readonly list: () => readonly DataRestoreEntry[];
  /** 고른 기록에 표시를 붙이고 디스크에 남긴다. 기록을 읽지 못하면 예외. */
  readonly mark: (
    pick: (entry: DataRestoreEntry) => boolean,
    field: 'notified' | 'syncResolved',
    syncResolvedBy?: 'year-transition',
  ) => void;
}

/**
 * 메인 프로세스가 쓰는 복원 기록 창구. 디스크 기록을 처음 한 번 읽어 두고, 이후에는 메모리에서 답한다.
 * 읽기에 실패하면 담아 두지 않고 다음 요청 때 다시 읽는다. 데이터 폴더가 바뀌면(저장 위치 옮기기) 다시 읽는다.
 */
export function createRestoreRegistry(getDataDir: () => string): RestoreRegistry {
  let cacheDir: string | null = null;
  let cache: DataRestoreEntry[] = [];
  const load = (): DataRestoreEntry[] => {
    const dir = getDataDir();
    if (cacheDir === dir) return cache;
    // 깨졌으면 다시 만든다. 다시 만들기가 실패하면 담아 두지 않으므로 다음 요청에서 다시 시도한다.
    const read = readRestoreLogRepairing(dir);
    if (!read.ok) {
      console.error(`[restore-log] 복원 기록을 읽지 못함 (${read.code})`);
      throw new Error(RESTORE_LOG_UNAVAILABLE_MESSAGE);
    }
    cacheDir = dir;
    cache = read.entries;
    return cache;
  };
  return {
    add: (entry) => {
      let current: DataRestoreEntry[];
      try {
        current = load();
      } catch {
        return; // list 가 계속 오류를 돌려준다
      }
      cache = current.some((e) => e.id === entry.id)
        ? current.map((e) => (e.id === entry.id ? entry : e))
        : [...current, entry];
    },
    list: () => load(),
    mark: (pick, field, syncResolvedBy) => {
      const { next, changed } = markRestoreEntries(load(), pick, field, syncResolvedBy);
      if (!changed) return;
      cache = next;
      if (cacheDir !== null) writeRestoreLog(cacheDir, next);
    },
  };
}
