/**
 * 시작 스냅샷 — 앱을 켤 때 중요 자료를 `backups/startup/<파일>.<YYYY-MM-DD>.json` 으로 남긴다.
 *
 * `main.ts` 의 `createStartupBackups()` 에 있던 로직을 옮겼다(electron 모듈 import 없음 — 단위 테스트 가능).
 * 이 폴더는 원본·백업이 모두 깨졌을 때의 복원 원천이기도 하다(`dataFileRead.ts`, ADR-148).
 *
 *  - 날짜 스냅샷은 **그날 첫 실행 때만** 쓴다(first-write-wins). 오전에 정상 스냅샷을 찍은 뒤 자료가
 *    오염된 채 같은 날 다시 켜도 그날의 정상 스냅샷이 남는다. 날짜는 이 PC 의 로컬 날짜다.
 *  - JSON 으로 읽히는 원본만 찍는다 — 깨진 원본을 스냅샷으로 남기지 않는다.
 *  - 쓰기는 저장과 같은 길(임시 파일 + fsync + 내용 검증 + 교체)이다.
 *  - 정리: 파일마다 **최근 7개는 날짜와 상관없이 남기고**, 그보다 오래된 것만 14일 기준으로 지운다.
 *    예전에는 14일 지난 것을 개수와 상관없이 지워서, 2주 넘게 앱을 안 켜다가 원본이 깨진 채 켜면
 *    오늘 스냅샷(깨져서 안 찍힘)도 옛 스냅샷(정리됨)도 없었다.
 *
 * 파일 내용은 로그에 남기지 않는다.
 */
import fs from 'fs';
import path from 'path';
import { dataFilePaths, replaceFileDurably } from './dataFileWrite';

/** 데이터 폴더 기준 스냅샷 폴더 위치. */
export function startupSnapshotDir(dataDir: string): string {
  return path.join(dataDir, 'backups', 'startup');
}

/**
 * 창을 띄우기 전에 찍는 자료(예전부터 찍던 9종). 이 파일들은 `.backup.json` 1세대도 함께 새로 쓴다.
 * 2026-07-13 동기화 유실 신고 후속으로 학생 기록·수업 기록이 들어갔다.
 */
export const STARTUP_SNAPSHOT_FILES: readonly string[] = [
  'attendance',
  'teaching-classes',
  'curriculum-progress',
  'settings',
  'memos',
  'todos',
  'events',
  'student-records',
  'observations',
];

/**
 * ADR-148 에서 더한 자료. 손상되면 다시 만들기 어려운 사용자 자료인데 스냅샷이 없었다.
 * 시작 시간에 주는 영향은 `main.ts` 가 재서 정한 자리(창을 띄우기 전/뒤)에서 찍는다.
 */
export const ADDED_STARTUP_SNAPSHOT_FILES: readonly string[] = [
  'students',
  'assignments',
  'class-schedule',
  'teacher-schedule',
  'seating',
  'consultations',
  'timetable-overrides',
  'record-drafts',
  'record-evidence',
];

/** 파일마다 날짜와 상관없이 남기는 최근 스냅샷 수. */
export const SNAPSHOT_KEEP_PER_FILE = 7;
/** 최근 7개보다 오래된 스냅샷을 지우는 나이(일). */
export const SNAPSHOT_MAX_AGE_DAYS = 14;

const SNAPSHOT_NAME = /^(.+)\.(\d{4}-\d{2}-\d{2})\.json$/;

/** `backups/startup` 의 이름에서 자료 이름과 날짜를 꺼낸다. 임시 파일(`.tmp.json`)·다른 이름은 null. */
export function parseSnapshotName(
  entry: string,
): { readonly file: string; readonly date: string } | null {
  const match = SNAPSHOT_NAME.exec(entry);
  if (!match) return null;
  return { file: match[1] as string, date: match[2] as string };
}

/** 로컬 날짜 `YYYY-MM-DD`. */
export function localDateStamp(now: Date): string {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

export interface StartupSnapshotOptions {
  /** `.backup.json` 1세대도 새로 쓸지(예전 9종의 동작). 기본 true. */
  readonly refreshBackup?: boolean;
}

/**
 * 주어진 자료의 오늘 스냅샷을 찍는다. 개별 파일 실패는 무시한다(다른 파일은 계속 찍는다).
 * 스냅샷 폴더를 만들지 못하면 `.backup.json` 만 새로 쓴다.
 */
export function createStartupSnapshots(
  dataDir: string,
  files: readonly string[],
  now: Date = new Date(),
  options: StartupSnapshotOptions = {},
): void {
  const refreshBackup = options.refreshBackup ?? true;
  const snapshotDir = startupSnapshotDir(dataDir);
  const today = localDateStamp(now);
  let snapshotReady = false;
  try {
    fs.mkdirSync(snapshotDir, { recursive: true });
    snapshotReady = true;
  } catch {
    // 스냅샷 폴더 생성 실패 시 1세대 백업만 진행
  }

  for (const filename of files) {
    const { filePath, backupPath, backupTempPath } = dataFilePaths(dataDir, filename);
    try {
      if (!fs.existsSync(filePath)) continue;
      const raw = fs.readFileSync(filePath, 'utf-8');
      if (raw.length <= 10) continue;
      JSON.parse(raw); // 유효한 JSON인지 확인 — 깨진 원본은 백업·스냅샷으로 남기지 않는다
      // 개별 파일 실패는 무시(결과를 보지 않는다 — 실패해도 아래 스냅샷은 시도한다)
      if (refreshBackup) replaceFileDurably(backupPath, backupTempPath, raw);
      if (snapshotReady) {
        const snapshotPath = path.join(snapshotDir, `${filename}.${today}.json`);
        if (!fs.existsSync(snapshotPath)) {
          const snapshotTempPath = path.join(snapshotDir, `${filename}.${today}.tmp.json`);
          replaceFileDurably(snapshotPath, snapshotTempPath, raw);
        }
      }
    } catch {
      // 개별 파일 실패는 무시
    }
  }
}

/**
 * 오래된 스냅샷을 정리한다. 파일마다 날짜가 최근인 7개는 나이와 상관없이 남기고, 그보다 오래된 것 중
 * 수정 시각이 14일 지난 것만 지운다. 스냅샷 이름이 아닌 것(남은 임시 파일 등)은 14일 기준만 적용한다.
 * 오늘(로컬 날짜)보다 뒤 날짜의 스냅샷은 셈에서 빼고 지우지 않는다.
 */
export function pruneStartupSnapshots(dataDir: string, nowMs: number = Date.now()): void {
  const snapshotDir = startupSnapshotDir(dataDir);
  let entries: string[];
  try {
    entries = fs.readdirSync(snapshotDir);
  } catch {
    return;
  }
  const cutoff = nowMs - SNAPSHOT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const today = localDateStamp(new Date(nowMs));

  const kept = new Set<string>();
  const byFile = new Map<string, { entry: string; date: string }[]>();
  for (const entry of entries) {
    const parsed = parseSnapshotName(entry);
    if (!parsed || entry.endsWith('.tmp.json')) continue;
    // 오늘보다 뒤 날짜(PC 시계가 앞서 있던 흔적)는 "최근 7개" 셈에서 빼고 지우지도 않는다 — 복원 원천에서도
    // 빠진다(`dataFileRead.ts`). 이것이 7개 자리를 차지하면 진짜 최근 스냅샷이 지워진다.
    if (parsed.date > today) {
      kept.add(entry);
      continue;
    }
    const list = byFile.get(parsed.file) ?? [];
    list.push({ entry, date: parsed.date });
    byFile.set(parsed.file, list);
  }
  for (const list of byFile.values()) {
    list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    for (const { entry } of list.slice(0, SNAPSHOT_KEEP_PER_FILE)) kept.add(entry);
  }

  for (const entry of entries) {
    if (kept.has(entry)) continue;
    try {
      const entryPath = path.join(snapshotDir, entry);
      if (fs.statSync(entryPath).mtimeMs < cutoff) fs.unlinkSync(entryPath);
    } catch {
      // 오래된 스냅샷 정리 실패는 무시
    }
  }
}
