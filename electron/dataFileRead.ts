/**
 * JSON 데이터 파일 읽기 — 손상 감지 + 백업 복구 + (허용 목록만) 격리.
 *
 * `data:read` IPC 핸들러 안에 있던 로직을 옮겼다(electron 모듈 import 없음 — 단위 테스트 가능).
 *
 * 계약:
 *  - `raw: null` 은 **파일이 없다**는 뜻이다. 원본·백업이 모두 깨졌으면 오류를 던진다 —
 *    null("파일 없음")로 위장하면 렌더러 저장 경로가 빈 파일로 오인해 기존 데이터를 편집분만으로
 *    덮어쓴다(QA2 H3).
 *  - 예외는 하나: `dataFileRules.ts` 의 허용 목록(다시 만들 수 있는 상태 파일)은 깨진 원본·백업을
 *    `<이름>.corrupt-<시각>` 으로 **옮기고**(지우지 않는다) `raw: null`·`quarantined: true` 를 돌려준다.
 *    그 밖의 파일은 절대 조용히 비우지 않는다.
 *  - 사용자 자료는 원본이 깨졌고 백업도 깨졌거나 없으면 **가장 최근의 온전한 시작 스냅샷**
 *    (`backups/startup/`)으로 되돌린다(ADR-148). 깨진 원본은 복사로 남기고, 복원 기록을
 *    `backups/restore-log` 에 남긴다. 쓸 만한 스냅샷이 없으면 예전처럼 오류를 던진다.
 *  - 백업으로 되돌리는 것은 원본이 **읽혔는데 깨져 있을 때만**이다. 읽기 자체가 막힌 경우(백신·색인이
 *    파일을 잠깐 잡은 EBUSY·EPERM 등)는 깨졌는지 알 수 없다 — 짧게 다시 읽어 보고, 끝까지 안 되면
 *    오류를 던진다. 그때는 백업을 읽지도, 원본을 덮지도, 격리하지도 않는다(한 세대 옛 백업이 지금
 *    내용인 것처럼 돌아가거나 온전한 원본을 덮지 않게).
 *
 * 파일 내용은 로그에 남기지 않는다 — 파일 이름과 오류 코드만 남긴다.
 */
import fs from 'fs';
import path from 'path';
import {
  isCorruptShortDataFile,
  isRebuildableStateFile,
  quarantineFileName,
} from './dataFileRules';
import {
  dataFilePaths,
  fileErrorCode,
  isParsableJson,
  isSafeDataFileName,
  renameWithRetry,
  replaceFileDurably,
  copyFileAside,
  sleepSync,
} from './dataFileWrite';
import {
  readRestoreLogRepairing,
  upsertRestoreEntry,
  type DataRestoreEntry,
} from './dataRestoreLog';
import { localDateStamp, parseSnapshotName, startupSnapshotDir } from './startupSnapshots';

export interface DataFileReadResult {
  /** 파일 내용. `null` 은 파일 없음(또는 방금 격리해서 비움). */
  readonly raw: string | null;
  /** 이번 호출에서 깨진 원본·백업을 격리했는가. */
  readonly quarantined: boolean;
  /** 이번 호출에서 원본·백업이 모두 깨져 시작 스냅샷으로 되돌렸으면 그 기록(ADR-148). */
  readonly restored?: DataRestoreEntry;
}

type FileProbe =
  | { readonly state: 'missing' }
  | { readonly state: 'valid'; readonly raw: string }
  /** 읽기는 됐는데 내용이 JSON 이 아니다(0x00 으로 채워짐·잘림 등). */
  | { readonly state: 'corrupt' }
  /** 읽기 자체가 안 됐다(잠금·권한). 내용이 깨졌는지는 모른다. */
  | { readonly state: 'unreadable'; readonly code: string };

/** 읽기가 막혔을 때 다시 읽기 전 기다리는 시간(ms). 길이가 곧 최대 재시도 횟수(3회, 합 140ms)다. */
const READ_RETRY_DELAYS_MS: readonly number[] = [20, 40, 80];

function probeFileOnce(filePath: string, isValid: (raw: string) => boolean): FileProbe {
  let raw: string;
  try {
    if (!fs.existsSync(filePath)) return { state: 'missing' };
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    return { state: 'unreadable', code: fileErrorCode(err) };
  }
  return isValid(raw) ? { state: 'valid', raw } : { state: 'corrupt' };
}

/** 읽기가 막혔으면(`unreadable`) 짧게 기다렸다 다시 읽는다. 그 밖의 결과는 바로 돌려준다. */
function probeFile(filePath: string, isValid: (raw: string) => boolean): FileProbe {
  for (let attempt = 0; ; attempt += 1) {
    const probe = probeFileOnce(filePath, isValid);
    const delay = READ_RETRY_DELAYS_MS[attempt];
    if (probe.state !== 'unreadable' || delay === undefined) return probe;
    sleepSync(delay);
  }
}

/** 원본이 온전한가. */
function isValidOriginal(raw: string): boolean {
  // F7a: 5바이트 미만이라도 유효한 빈 구조값(`[]`·`{}`)은 정상 — 손상 오탐이
  // .backup.json에서 옛 데이터를 부활시키던 것을 제거(학년도 전환 빈 값 리셋의 전제).
  if (isCorruptShortDataFile(raw)) return false;
  return isParsableJson(raw);
}

/**
 * 깨진 원본(과 깨진 백업)을 옆으로 치운다. 원본을 치우지 못했으면 false —
 * 그때는 호출 쪽이 예전처럼 오류를 던진다(치우지 못한 파일을 "없음"으로 돌려주지 않는다).
 */
function quarantineCorruptFiles(
  filePath: string,
  backupPath: string,
  moveBackup: boolean,
  now: Date,
): boolean {
  const moveAside = (source: string): void => {
    const target = path.join(path.dirname(source), quarantineFileName(path.basename(source), now));
    renameWithRetry(source, target);
  };

  try {
    moveAside(filePath);
  } catch (err) {
    console.error(`[data:read] 손상 파일 격리 실패 (${fileErrorCode(err)})`);
    return false;
  }
  if (moveBackup) {
    try {
      moveAside(backupPath);
    } catch (err) {
      // 원본이 없으면 백업은 읽히지 않는다 — 남아도 해롭지 않다.
      console.warn(`[data:read] 손상 백업 격리 실패 (${fileErrorCode(err)})`);
    }
  }
  return true;
}

/**
 * 학년도 전환(`ExecuteYearTransition`)이 비우는 자료 중 시작 스냅샷이 있는 것. 마감 이전에 찍힌
 * 스냅샷은 복원 원천에서 뺀다 — 새 학년도 자료가 깨졌을 때 지난 학년도 명렬·기록으로 되돌리지 않게.
 */
const YEAR_SCOPED_FILES: ReadonlySet<string> = new Set([
  'students',
  'seating',
  'student-records',
  'record-drafts',
  'record-evidence',
  'assignments',
  'teaching-classes',
  'attendance',
  'curriculum-progress',
  'observations',
]);

/** settings 의 학년도 마감 시각(`lastClosedAt`, ms). 읽지 못하거나 없으면 null(날짜만으로 고른다). */
function readYearClosedAtMs(dataDir: string): number | null {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf-8'),
    ) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const value = (parsed as { lastClosedAt?: unknown }).lastClosedAt;
    if (typeof value !== 'string') return null;
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  } catch {
    return null;
  }
}

type SnapshotPick =
  | {
      readonly state: 'found';
      readonly raw: string;
      readonly date: string;
      readonly modifiedAt: Date;
    }
  | { readonly state: 'none' }
  /** 더 최근 스냅샷을 읽지 못했다(잠금 등) — 그보다 옛 것으로 건너뛰지 않는다. */
  | { readonly state: 'unreadable'; readonly code: string };

/**
 * `backups/startup/<파일>.<YYYY-MM-DD>.json` 중 가장 최근의 온전한 것을 고른다(임시 파일 제외).
 * 깨진 스냅샷은 건너뛰고 그 이전 날짜를 본다. 읽지 못한 스냅샷을 만나면 거기서 멈춘다.
 */
function pickRestoreSnapshot(dataDir: string, filename: string, now: Date): SnapshotPick {
  const dir = startupSnapshotDir(dataDir);
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return { state: 'none' };
  }
  const closedAtMs = YEAR_SCOPED_FILES.has(filename) ? readYearClosedAtMs(dataDir) : null;
  // 오늘(로컬 날짜)보다 뒤 날짜의 스냅샷은 고르지 않는다 — PC 시계가 잠깐 앞서 있었던 흔적일 수 있다.
  const today = localDateStamp(now);
  const candidates = entries
    .map((entry) => ({ entry, parsed: parseSnapshotName(entry) }))
    .filter(
      (c): c is { entry: string; parsed: { file: string; date: string } } =>
        c.parsed !== null && c.parsed.file === filename && c.parsed.date <= today,
    )
    .sort((a, b) => (a.parsed.date < b.parsed.date ? 1 : a.parsed.date > b.parsed.date ? -1 : 0));

  for (const { entry, parsed } of candidates) {
    const snapshotPath = path.join(dir, entry);
    let modifiedAt: Date;
    try {
      modifiedAt = fs.statSync(snapshotPath).mtime;
    } catch (err) {
      const code = fileErrorCode(err);
      if (code === 'ENOENT') continue;
      return { state: 'unreadable', code };
    }
    if (closedAtMs !== null && modifiedAt.getTime() < closedAtMs) continue;
    const probe = probeFile(snapshotPath, isValidOriginal);
    if (probe.state === 'valid') {
      return { state: 'found', raw: probe.raw, date: parsed.date, modifiedAt };
    }
    if (probe.state === 'unreadable') return { state: 'unreadable', code: probe.code };
    // 깨졌거나 그 사이 없어졌다 — 그 이전 날짜를 본다.
  }
  return { state: 'none' };
}

/**
 * 원본이 깨졌고 백업도 깨졌거나 없을 때: 가장 최근의 온전한 시작 스냅샷으로 되돌린다(ADR-148).
 *
 * 순서가 곧 안전장치다 —
 *  ① 복원 기록을 읽는다. 깨졌으면 옆에 복사해 두고 격리 사본으로 보수적으로 다시 만든다. 읽히지 않거나
 *    다시 만들지 못하면 되돌리지 않는다(깨진 기록 위에 그냥 쓰면 안 풀린 동기화 보호가 사라진다).
 *  ② 깨진 원본(과 깨진 백업)을 복사로 격리한다. 실패하면 되돌리지 않는다.
 *  ③ 복원 기록을 **먼저** `written: false` 로 남긴다. 실패하면 되돌리지 않는다 — 기록 없는 복원은
 *    동기화 보호가 없어 되돌린 옛 내용이 클라우드를 덮는다. 이때 자료는 깨진 원본 그대로다(잃는 것이 없다).
 *  ④ 원본 자리에 스냅샷 내용을 내구 교체하고, 성공하면 기록을 `written: true` 로 고친다.
 *    교체가 실패하면 스냅샷 내용만 돌려준다(그 실행에서는 읽기 결과로 쓰이고 다음 저장 때 원본이 교체된다).
 * 되돌리지 않으면 null — 호출 쪽이 예전처럼 오류를 던진다. 쓸 만한 스냅샷이 없거나 읽지 못해도 null.
 */
function restoreFromStartupSnapshot(
  dataDir: string,
  filename: string,
  backupState: 'missing' | 'corrupt',
  now: () => Date,
): DataFileReadResult | null {
  // 하위 폴더 자료는 시작 스냅샷 대상이 아니다.
  if (filename.includes('/') || filename.includes('\\')) return null;
  const at = now();
  const pick = pickRestoreSnapshot(dataDir, filename, at);
  if (pick.state === 'unreadable') {
    console.error(`[data:read] 시작 스냅샷을 읽지 못해 복원하지 않음: ${filename} (${pick.code})`);
    return null;
  }
  if (pick.state === 'none') return null;

  // 깨진 기록은 격리 사본으로 다시 만든 뒤 쓴다(다시 만들기가 실패하면 되돌리지 않는다).
  const log = readRestoreLogRepairing(dataDir, at);
  if (!log.ok) {
    console.error(`[data:read] 복원 기록을 읽지 못해 복원하지 않음: ${filename} (${log.code})`);
    return null;
  }

  const { filePath, backupPath, tempPath } = dataFilePaths(dataDir, filename);

  // 써 넣기를 마치지 못한 지난 복원이 있으면(원본이 아직 깨져 있다) 같은 기록을 다시 쓴다 —
  // 같은 손상을 두 번 알리거나 격리 사본을 또 만들지 않는다.
  const pending = log.entries.find(
    (e) => e.file === filename && e.snapshotDate === pick.date && !e.written && !e.syncResolved,
  );

  let quarantinedAs = pending?.quarantinedAs;
  let quarantinedBackupAs = pending?.quarantinedBackupAs;
  if (quarantinedAs === undefined) {
    try {
      quarantinedAs = copyFileAside(filePath, at);
    } catch (err) {
      console.error(`[data:read] 손상 원본 격리 사본 실패 — 복원하지 않음 (${fileErrorCode(err)})`);
      return null;
    }
    if (backupState === 'corrupt') {
      try {
        quarantinedBackupAs = copyFileAside(backupPath, at);
      } catch (err) {
        // 깨진 백업은 제자리에 그대로 남아 있다 — 잃는 것이 없다.
        console.warn(`[data:read] 손상 백업 격리 사본 실패 (${fileErrorCode(err)})`);
      }
    }
  }

  const planned: DataRestoreEntry = pending ?? {
    id: `${filename}@${at.toISOString()}`,
    file: filename,
    snapshotDate: pick.date,
    snapshotModifiedAt: pick.modifiedAt.toISOString(),
    quarantinedAs,
    ...(quarantinedBackupAs !== undefined ? { quarantinedBackupAs } : {}),
    restoredAt: at.toISOString(),
    written: false,
    notified: false,
    syncResolved: false,
  };
  if (!pending && !upsertRestoreEntry(dataDir, planned)) {
    console.error(`[data:read] 복원 기록을 먼저 남기지 못해 복원하지 않음: ${filename}`);
    return null;
  }

  const replaced = replaceFileDurably(filePath, tempPath, pick.raw);
  if (!replaced.ok) {
    console.warn(
      `[data:read] 시작 스냅샷(${pick.date}) 내용으로 읽었지만 원본을 되돌리지 못함: ${filename} (${
        replaced.reason === 'write' ? replaced.code : 'verify'
      })`,
    );
    return { raw: pick.raw, quarantined: false, restored: planned };
  }
  console.warn(`[data:read] 원본·백업 손상 — 시작 스냅샷(${pick.date})으로 되돌림: ${filename}`);
  const written: DataRestoreEntry = { ...planned, written: true };
  if (!upsertRestoreEntry(dataDir, written)) {
    // 원본은 이미 되돌렸다. 기록은 written:false 로 남아 있어도 보호·알림은 그대로 유효하다.
    console.warn(`[data:read] 복원 기록의 써 넣기 표시를 고치지 못함: ${filename}`);
    return { raw: pick.raw, quarantined: false, restored: planned };
  }
  return { raw: pick.raw, quarantined: false, restored: written };
}

export function readDataFileWithRecovery(
  dataDir: string,
  filename: string,
  now: () => Date = () => new Date(),
): DataFileReadResult {
  // ★데이터 폴더 밖(`../`)은 읽지 않는다(ADR-143 보안 점검).
  if (!isSafeDataFileName(dataDir, filename))
    throw new Error('[data:read] 허용되지 않는 파일 이름');
  const { filePath, backupPath, tempPath } = dataFilePaths(dataDir, filename);

  // 원본 읽기 시도
  const original = probeFile(filePath, isValidOriginal);
  if (original.state === 'valid') return { raw: original.raw, quarantined: false };
  // 원본이 없으면 파일이 없는 것이다 — 백업을 되살리지 않는다(data:remove·학년도 리셋의 전제).
  if (original.state === 'missing') return { raw: null, quarantined: false };
  // 읽기 자체가 막혔다(다시 읽어도 안 됐다) — 깨졌는지 알 수 없으므로 백업으로 대체하지 않는다.
  // 백업을 읽지도, 원본을 덮지도, 격리하지도 않고 오류만 알린다. null("파일 없음")로도 넘기지 않는다.
  if (original.state === 'unreadable') {
    console.error(`[data:read] 원본을 읽지 못함: ${filename} (${original.code})`);
    throw new Error(
      `[data:read] ${filename} 파일을 읽지 못함 (${original.code}) — 잠시 뒤 다시 시도`,
    );
  }

  console.warn(`[data:read] 원본 손상 감지: ${filename}, 백업에서 복구 시도`);
  const backup = probeFile(backupPath, isParsableJson);
  if (backup.state === 'valid') {
    // 원본을 백업 내용으로 되돌린다 — 쓰기와 같은 길(임시 파일 + fsync + 교체).
    // 되돌리기가 실패해도 백업 내용은 온전하므로 그대로 돌려준다(원본은 다음 저장 때 교체된다).
    const restored = replaceFileDurably(filePath, tempPath, backup.raw);
    if (restored.ok) {
      console.log(`[data:read] 백업에서 복구 성공: ${filename}`);
    } else {
      console.warn(
        `[data:read] 백업 내용으로 읽었지만 원본을 되돌리지 못함: ${filename} (${
          restored.reason === 'write' ? restored.code : 'verify'
        })`,
      );
    }
    return { raw: backup.raw, quarantined: false };
  }
  console.error(`[data:read] 백업 복구도 실패: ${filename}`);

  // 다시 만들 수 있는 상태 파일만: 깨진 것을 옆으로 치우고 "없음"으로 시작한다.
  // (여기까지 왔으면 원본은 읽혔는데 깨진 것이다.) 백업을 읽지 못한 경우(잠금·권한)는 백업이
  // 온전할 수 있으므로 치우지 않는다.
  if (backup.state !== 'unreadable' && isRebuildableStateFile(filename)) {
    if (quarantineCorruptFiles(filePath, backupPath, backup.state === 'corrupt', now())) {
      console.warn(`[data:read] 손상된 상태 파일을 격리하고 초기화: ${filename}`);
      return { raw: null, quarantined: true };
    }
  }

  // 사용자 자료: 백업도 깨졌거나 없으면 가장 최근의 온전한 시작 스냅샷으로 되돌린다(ADR-148).
  // 백업을 읽지 못한 경우(잠금·권한)는 백업이 온전할 수 있으므로 되돌리지 않는다.
  if (backup.state !== 'unreadable' && !isRebuildableStateFile(filename)) {
    const restored = restoreFromStartupSnapshot(dataDir, filename, backup.state, now);
    if (restored !== null) return restored;
  }

  // 파일이 존재하는데 여기까지 왔다면 원본·백업 모두 복구 실패다 — null("파일 없음")로
  // 위장하지 않고 오류를 던진다. null을 받은 렌더러 저장 경로는 빈 파일로 오인해
  // 기존 데이터를 편집분만으로 덮어쓴다(QA2 H3). null은 파일 부재만 의미한다.
  let stillExists = true;
  try {
    stillExists = fs.existsSync(filePath);
  } catch {
    stillExists = true;
  }
  if (stillExists) {
    throw new Error(`[data:read] ${filename} 파일 손상 — 원본·백업 복구 실패`);
  }
  return { raw: null, quarantined: false };
}
