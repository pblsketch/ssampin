/**
 * 백업·복원·데이터 위치 센터 — Electron main 측 파일 I/O 모듈.
 *
 * 데이터 흐름:
 *   - export: userData/data/*.json 수집 → 메타데이터 부착 → 사용자가 고른 위치에 단일 .ssampin-backup.json 저장
 *   - import: 사용자 고른 .ssampin-backup.json 파싱 → 구조 검증 → safety backup 자동 생성 → 각 항목을 atomic write
 *
 * 윤리 원칙:
 *   - 외부 서버에 절대 전송하지 않는다. 본 모듈은 fs / dialog / shell만 사용.
 *   - 보안 저장소(secureWrite) 데이터는 본 모듈을 거치지 않는다.
 *   - 바이너리(stickers/*.png 등)는 MVP 범위 외 — 명시적으로 제외.
 *
 * 도메인 동기화: 본 파일의 구조 검증/필터 로직은
 * `src/domain/rules/backupRules.ts`의 selectBackupCandidates / validateBackupFile과 동일한
 * 규칙을 따라야 한다. (electron rootDir=electron 한계로 직접 import 불가, 의도적 미러링.)
 *
 * 아카이브(S2.1b): 백업 파일 최상위에 선택적 `archives` 섹션을 담는다 —
 * `{ metadata, data, archives?: { [term]: { [relPath]: {format, content} } } }`.
 * 스키마 버전은 1 유지(추가 키 방식) — validateBackupShape / 도메인 validateBackupFile은
 * metadata·data만 읽고 최상위 추가 키를 거부하지 않으므로(실측: 두 함수 모두 obj['metadata'],
 * obj['data']만 접근) 구버전 앱도 신버전 백업을 그대로 복원한다(archives는 조용히 무시).
 * 수집·복원·검증은 `archiveManager.ts`(collect/restore/validateArchivesSection)가 담당한다.
 */

import { app, BrowserWindow, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { collectArchivesSection, restoreArchivesSection } from './archiveManager';

const BACKUP_SCHEMA_VERSION = 1;
const BACKUP_FILE_EXT = '.ssampin-backup.json';
const SAFETY_BACKUP_DIRNAME = 'backups';
/** 환경 의존 파일은 백업/복원 양방향에서 모두 제외 */
const EXCLUDED_FILENAMES: ReadonlySet<string> = new Set(['widget-bounds', 'icon-bounds']);
/** 화이트리스트 패턴 — 경로 인젝션 방어 */
const VALID_FILENAME_RE = /^[A-Za-z0-9_.-]+$/;

export interface BackupDataLocation {
  /** 앱 사용자 데이터 루트 (`app.getPath('userData')`) */
  readonly userDataPath: string;
  /** JSON 데이터 디렉토리 (`{userData}/data`) */
  readonly dataDirPath: string;
  /** dataDirPath가 디스크에 실제로 존재하는지 */
  readonly exists: boolean;
}

export interface BackupMetadataPayload {
  readonly schemaVersion: number;
  readonly appVersion: string;
  readonly exportedAt: string;
  readonly platform: string;
  readonly entryCount: number;
}

export interface BackupExportResult {
  readonly canceled: boolean;
  readonly filePath?: string;
  readonly entryCount?: number;
  /** (S2.1b) 백업에 함께 담긴 아카이브 학기 수. 아카이브가 없으면 0. */
  readonly archiveTermCount?: number;
  /** (S2.1b) 담긴 아카이브 원본 바이트 합 — 사용자에게 예상 크기 안내용. */
  readonly archiveTotalBytes?: number;
  /** (S2.1b) 아카이브 수집 실패 사유 — 실패 시 아카이브 없이 백업하고 사유를 표면화한다. */
  readonly archiveError?: string;
}

export interface BackupImportError {
  readonly code:
    | 'file-read-failed'
    | 'invalid-json'
    | 'invalid-structure'
    | 'unsupported-future-version'
    | 'empty-data'
    | 'write-failed';
  readonly message: string;
}

export interface BackupImportResult {
  readonly canceled: boolean;
  readonly restoredCount?: number;
  readonly restoredFilenames?: readonly string[];
  readonly safetyBackupPath?: string;
  readonly metadata?: BackupMetadataPayload;
  readonly error?: BackupImportError;
  /** (S2.1b) 백업에서 새로 복원된 아카이브 학기 목록. */
  readonly restoredArchiveTerms?: readonly string[];
  /** (S2.1b) 이미 로컬에 있어 건너뛴 아카이브 학기 목록(아카이브는 덮어쓰지 않는다). */
  readonly skippedArchiveTerms?: readonly string[];
}

/** dataDir이 없으면 생성하지 않고 path만 반환 (백업 시점 외엔 부수효과 회피) */
function getDataDir(): string {
  return path.join(app.getPath('userData'), 'data');
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** 데이터 디렉토리에서 백업 대상 base 이름을 정렬해 반환 (도메인 selectBackupCandidates 미러). */
function listBackupCandidateBaseNames(dataDir: string): string[] {
  if (!fs.existsSync(dataDir)) return [];
  const entries = fs.readdirSync(dataDir, { withFileTypes: true });
  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    if (!name.endsWith('.json')) continue;
    const base = name.slice(0, -'.json'.length);
    if (base.length === 0) continue;
    if (base.endsWith('.backup') || base.endsWith('.tmp')) continue;
    if (EXCLUDED_FILENAMES.has(base)) continue;
    if (!VALID_FILENAME_RE.test(base)) continue;
    if (seen.has(base)) continue;
    seen.add(base);
    result.push(base);
  }
  result.sort();
  return result;
}

function buildDefaultBackupFilename(now: Date): string {
  const compact = now
    .toISOString()
    .replace(/\.\d+Z$/, '')
    .replace(/Z$/, '')
    .replace(/[:-]/g, '')
    .replace('T', '-');
  return `ssampin-backup-${compact}${BACKUP_FILE_EXT}`;
}

/** =================  데이터 위치 표시  ================= */

export function getDataLocationInfo(): BackupDataLocation {
  const userDataPath = app.getPath('userData');
  const dataDirPath = getDataDir();
  return {
    userDataPath,
    dataDirPath,
    exists: fs.existsSync(dataDirPath),
  };
}

/** OS 기본 파일 탐색기로 dataDir을 연다. dir이 없으면 자동 생성 후 연다. */
export async function openDataLocation(): Promise<{ ok: boolean; reason?: string }> {
  const dataDirPath = getDataDir();
  ensureDir(dataDirPath);
  const errMsg = await shell.openPath(dataDirPath);
  if (errMsg) return { ok: false, reason: errMsg };
  return { ok: true };
}

/** =================  Export  ================= */

export async function exportBackup(
  parent: BrowserWindow | null,
  appVersion: string,
): Promise<BackupExportResult> {
  const dataDir = getDataDir();
  const candidates = listBackupCandidateBaseNames(dataDir);

  // 사용자 친화: 빈 상태 (실제로는 새 사용자) — 그래도 파일을 만들 수 있도록 진행
  const data: Record<string, unknown> = {};
  for (const base of candidates) {
    const filePath = path.join(dataDir, `${base}.json`);
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      // JSON 유효성 검증 — 손상된 파일은 백업에서 제외하여 복원 시 재오염 방지
      data[base] = JSON.parse(raw);
    } catch {
      // 손상된 파일은 백업에서 skip — 백업 파일이 추후 invalid-json으로 거부되는 것 차단
      continue;
    }
  }

  const metadata: BackupMetadataPayload = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion,
    exportedAt: new Date().toISOString(),
    platform: process.platform,
    entryCount: Object.keys(data).length,
  };

  // (S2.1b) 아카이브 수집 — 로컬 전용(ADR-036)인 아카이브의 유일한 기기 간 이동 수단이
  // 수동 백업이므로(함정 ⑯), 있으면 반드시 담는다. 수집 실패는 숨기지 않고 결과에 표면화.
  const collected = collectArchivesSection(app.getPath('userData'));
  const archiveTermCount = collected.ok ? collected.termCount : 0;
  const archiveTotalBytes = collected.ok ? collected.totalBytes : 0;
  const archiveError = collected.ok ? undefined : collected.error;

  const backupFile =
    collected.ok && collected.termCount > 0
      ? { metadata, data, archives: collected.archives }
      : { metadata, data };
  const serialized = JSON.stringify(backupFile, null, 2);

  // 저장 다이얼로그
  const defaultName = buildDefaultBackupFilename(new Date());
  const dialogOptions: Electron.SaveDialogOptions = {
    title: '쌤핀 백업 파일 저장',
    defaultPath: defaultName,
    filters: [
      { name: '쌤핀 백업 파일', extensions: ['ssampin-backup.json'] },
      { name: 'JSON 파일', extensions: ['json'] },
    ],
  };
  const result = parent
    ? await dialog.showSaveDialog(parent, dialogOptions)
    : await dialog.showSaveDialog(dialogOptions);

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  // 본 백업이 dataDir 내부의 backups/ 하위로 들어가지 않도록 사용자가 직접 고른 경로만 사용.
  // (사용자가 의도적으로 dataDir 안에 저장하면 그건 사용자 선택 — 다음 export에서 자동 감지될 뿐 작동에는 영향 없음)
  fs.writeFileSync(result.filePath, serialized, 'utf-8');

  return {
    canceled: false,
    filePath: result.filePath,
    entryCount: metadata.entryCount,
    archiveTermCount,
    archiveTotalBytes,
    ...(archiveError !== undefined ? { archiveError } : {}),
  };
}

/** =================  Import (with safety backup)  ================= */

/**
 * 도메인 검증과 동일 규칙. 호출 측은 ok=false면 error를 그대로 사용자에게 표시.
 * ⚠️ metadata·data만 검사하며 최상위 추가 키(`archives` 등)는 거부하지 않는다 —
 * S2.1b가 이 성질에 기대므로 여기에 "알 수 없는 최상위 키 거부"를 추가하지 말 것.
 * (export는 단위 테스트용 — backupManager.archives.test.ts가 하위 호환을 고정한다.)
 */
export function validateBackupShape(
  raw: unknown,
):
  | { ok: true; data: Record<string, unknown>; metadata: BackupMetadataPayload }
  | { ok: false; error: BackupImportError } {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      ok: false,
      error: {
        code: 'invalid-structure',
        message: '백업 파일 형식이 올바르지 않아요. (최상위 객체 아님)',
      },
    };
  }
  const obj = raw as Record<string, unknown>;
  const metaUnknown = obj['metadata'];
  if (metaUnknown === null || typeof metaUnknown !== 'object' || Array.isArray(metaUnknown)) {
    return {
      ok: false,
      error: {
        code: 'invalid-structure',
        message: '백업 파일 형식이 올바르지 않아요. (metadata 누락)',
      },
    };
  }
  const meta = metaUnknown as Record<string, unknown>;
  const schemaVersion = meta['schemaVersion'];
  const appVersion = meta['appVersion'];
  const exportedAt = meta['exportedAt'];
  const platform = meta['platform'];
  const entryCount = meta['entryCount'];
  if (
    typeof schemaVersion !== 'number' ||
    typeof appVersion !== 'string' ||
    typeof exportedAt !== 'string' ||
    typeof platform !== 'string' ||
    typeof entryCount !== 'number'
  ) {
    return {
      ok: false,
      error: {
        code: 'invalid-structure',
        message: '백업 파일 형식이 올바르지 않아요. (metadata 필드 누락)',
      },
    };
  }
  if (schemaVersion > BACKUP_SCHEMA_VERSION) {
    return {
      ok: false,
      error: {
        code: 'unsupported-future-version',
        message:
          '이 백업 파일은 더 새로운 버전의 쌤핀에서 만들어졌어요. 쌤핀을 업데이트한 뒤 다시 시도해 주세요.',
      },
    };
  }
  const dataUnknown = obj['data'];
  if (dataUnknown === null || typeof dataUnknown !== 'object' || Array.isArray(dataUnknown)) {
    return {
      ok: false,
      error: {
        code: 'invalid-structure',
        message: '백업 파일 형식이 올바르지 않아요. (data 누락)',
      },
    };
  }
  const dataObj = dataUnknown as Record<string, unknown>;
  if (Object.keys(dataObj).length === 0) {
    return {
      ok: false,
      error: {
        code: 'empty-data',
        message: '백업 파일에 복원할 데이터가 없어요.',
      },
    };
  }
  for (const key of Object.keys(dataObj)) {
    if (!VALID_FILENAME_RE.test(key) || EXCLUDED_FILENAMES.has(key)) {
      // 환경 파일이 백업에 들어와 있어도 무시(거부 X) — 안전을 위해 그냥 skip 대상으로 둔다.
      // 그러나 path traversal 패턴은 거부.
      if (!VALID_FILENAME_RE.test(key)) {
        return {
          ok: false,
          error: {
            code: 'invalid-structure',
            message: `백업 파일에 허용되지 않은 항목 이름이 있어요: ${key}`,
          },
        };
      }
    }
  }
  return {
    ok: true,
    data: dataObj,
    metadata: {
      schemaVersion,
      appVersion,
      exportedAt,
      platform,
      entryCount,
    },
  };
}

/**
 * 현재 dataDir의 모든 후보 파일을 모아 safety backup을 작성하고 절대 경로 반환.
 * (S2.1에서 export 승격 — 함정 ⑰. `backup:createSafety` IPC와 S2.4 전환 실행 1단계가 사용.)
 * 실패 시 throw — IPC 핸들러가 잡아 `{ok:false, error}`로 변환한다.
 */
export function createSafetyBackup(appVersion: string): string {
  const dataDir = getDataDir();
  ensureDir(dataDir);
  const safetyDir = path.join(dataDir, SAFETY_BACKUP_DIRNAME);
  ensureDir(safetyDir);

  const candidates = listBackupCandidateBaseNames(dataDir);
  const data: Record<string, unknown> = {};
  for (const base of candidates) {
    const filePath = path.join(dataDir, `${base}.json`);
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      data[base] = JSON.parse(raw);
    } catch {
      continue; // 손상 파일 skip
    }
  }

  const metadata: BackupMetadataPayload = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion,
    exportedAt: new Date().toISOString(),
    platform: process.platform,
    entryCount: Object.keys(data).length,
  };
  const backupFile = { metadata, data, kind: 'safety' as const };
  const serialized = JSON.stringify(backupFile, null, 2);

  const stamp = new Date()
    .toISOString()
    .replace(/\.\d+Z$/, '')
    .replace(/Z$/, '')
    .replace(/[:-]/g, '')
    .replace('T', '-');
  const safetyPath = path.join(safetyDir, `safety-${stamp}${BACKUP_FILE_EXT}`);
  fs.writeFileSync(safetyPath, serialized, 'utf-8');
  return safetyPath;
}

/** 단일 base 이름의 데이터를 atomic write로 저장. main.ts data:write와 동일 패턴. */
function atomicWriteData(dataDir: string, base: string, json: string): void {
  const filePath = path.join(dataDir, `${base}.json`);
  const tempPath = path.join(dataDir, `${base}.tmp.json`);
  fs.writeFileSync(tempPath, json, 'utf-8');
  // 검증
  const verify = fs.readFileSync(tempPath, 'utf-8');
  if (verify.length !== json.length) {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      /* ignore */
    }
    throw new Error(`복원 검증 실패: ${base}`);
  }
  fs.renameSync(tempPath, filePath);
}

/**
 * 사용자에게 백업 파일을 받아 복원한다.
 * - 성공 시 broadcastDataChanged(filename)을 각 base 이름에 대해 호출하여 렌더러가 store를 reload하게 한다.
 */
export async function importBackup(
  parent: BrowserWindow | null,
  appVersion: string,
  broadcastDataChanged: (filename: string) => void,
): Promise<BackupImportResult> {
  // 1. 파일 선택
  const dialogOptions: Electron.OpenDialogOptions = {
    title: '쌤핀 백업 파일 가져오기',
    properties: ['openFile'],
    filters: [{ name: '쌤핀 백업 파일', extensions: ['ssampin-backup.json', 'json'] }],
  };
  const open = parent
    ? await dialog.showOpenDialog(parent, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);
  if (open.canceled || open.filePaths.length === 0) {
    return { canceled: true };
  }
  const sourcePath = open.filePaths[0]!;

  // 2. 파일 읽기
  let raw: string;
  try {
    raw = fs.readFileSync(sourcePath, 'utf-8');
  } catch (err) {
    return {
      canceled: false,
      error: {
        code: 'file-read-failed',
        message: `파일을 읽을 수 없어요. (${err instanceof Error ? err.message : String(err)})`,
      },
    };
  }

  // 3. JSON 파싱
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      canceled: false,
      error: {
        code: 'invalid-json',
        message: `백업 파일을 읽지 못했어요. JSON 형식이 아니에요. (${
          err instanceof Error ? err.message : String(err)
        })`,
      },
    };
  }

  // 4. 구조 검증
  const validated = validateBackupShape(parsed);
  if (!validated.ok) {
    return { canceled: false, error: validated.error };
  }

  // 5. safety backup
  let safetyBackupPath: string;
  try {
    safetyBackupPath = createSafetyBackup(appVersion);
  } catch (err) {
    return {
      canceled: false,
      error: {
        code: 'write-failed',
        message: `복원 전 안전 백업 생성에 실패했어요. (${
          err instanceof Error ? err.message : String(err)
        })`,
      },
    };
  }

  // 6. (S2.1b) 아카이브 복원 — 라이브 데이터를 건드리기 전에 먼저 수행한다.
  //    실패 시 라이브 파일이 1바이트도 변하기 전에 중단(fail-closed). 이미 있는 학기는
  //    덮어쓰지 않고 건너뛰므로 로컬 아카이브가 파괴될 일이 없다. 구버전 백업(archives 없음)은
  //    이 단계를 통째로 건너뛴다(하위 호환).
  const archivesRaw = (parsed as Record<string, unknown>)['archives'];
  let restoredArchiveTerms: readonly string[] = [];
  let skippedArchiveTerms: readonly string[] = [];
  if (archivesRaw !== undefined) {
    const archiveResult = restoreArchivesSection(app.getPath('userData'), archivesRaw);
    if (!archiveResult.ok) {
      return {
        canceled: false,
        safetyBackupPath,
        error: {
          code: 'write-failed',
          message: `보관함(아카이브) 복원에 실패했어요: ${archiveResult.error}`,
        },
      };
    }
    restoredArchiveTerms = archiveResult.restoredTerms;
    skippedArchiveTerms = archiveResult.skippedTerms;
  }

  // 7. 적용 — 환경 의존 파일은 skip (사용자 화면이 망가지지 않게)
  const dataDir = getDataDir();
  ensureDir(dataDir);
  const restored: string[] = [];
  for (const [key, value] of Object.entries(validated.data)) {
    if (EXCLUDED_FILENAMES.has(key)) continue;
    if (!VALID_FILENAME_RE.test(key)) continue;
    try {
      const json = JSON.stringify(value, null, 2);
      atomicWriteData(dataDir, key, json);
      restored.push(key);
    } catch (err) {
      return {
        canceled: false,
        safetyBackupPath,
        error: {
          code: 'write-failed',
          message: `복원 중 일부 파일 쓰기에 실패했어요: ${key} (${
            err instanceof Error ? err.message : String(err)
          })`,
        },
      };
    }
  }

  // 8. 렌더러에 변경 통지 (각 base마다)
  //    아카이브는 라이브 스토어가 읽는 파일이 아니므로 data:changed 통지 대상이 아니다.
  for (const base of restored) {
    try {
      broadcastDataChanged(base);
    } catch {
      /* broadcast 실패는 비치명 */
    }
  }

  return {
    canceled: false,
    restoredCount: restored.length,
    restoredFilenames: restored,
    safetyBackupPath,
    metadata: validated.metadata,
    restoredArchiveTerms,
    skippedArchiveTerms,
  };
}
