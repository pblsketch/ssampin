/**
 * 학년도 보관함(아카이브) — Electron main 측 파일 I/O 모듈. (S2.1)
 *
 * 저장 구조:
 *   {userData}/data/archives/{term}/
 *     manifest.json                  ← 라벨·시각·앱 버전·파일별 건수·SHA-256 체크섬
 *     {fileKey}.json                 ← data/{fileKey}.json의 바이트 사본
 *     obs-attachments/{name}         ← {userData}/obs-attachments/{name}의 바이트 사본 (data/ 밖! 함정 ③)
 *
 * 설계 원칙:
 *  - **실패를 숨기지 않는다** (함정 ⑪ — data:write는 실패 시 조용히 return). 이 모듈의
 *    모든 공개 함수는 명시적 `{ok:true,...} | {ok:false, error}`를 반환하며 throw하지 않는다.
 *  - **경로 검증** (함정 ⑫): 이름 화이트리스트 + `path.relative` 재확인(resolveFormsPath 패턴 준용).
 *  - **원자적 완성**: 생성·복원은 `.staging-*` 임시 디렉토리에 쓴 뒤 rename — 실패 시
 *    최종 위치(`archives/{term}`)에 부분 결과물을 절대 남기지 않는다.
 *  - `electron` 모듈을 import하지 않는다 — `userDataPath`를 인자로 주입받는다(main.ts가
 *    `app.getPath('userData')`를 넘긴다). 덕분에 vitest에서 실제 fs로 단위 테스트 가능.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ MIRROR 블록: 아래 "MIRROR of src/domain/rules/archiveRules.ts" 구간은
 * 도메인 정본 `src/domain/rules/archiveRules.ts`의 순수 함수를 그대로 복제한 것이다.
 * (electron rootDir 제약으로 @domain import 불가 — backupRules ↔ backupManager 선례.)
 * 정본을 고치면 여기도 반드시 함께 고친다. 동치는 `electron/archiveRules.mirror.test.ts`가 강제한다.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// ═════════════════════════════════════════════════════════════════════════════
// MIRROR of src/domain/rules/archiveRules.ts — 여기부터. 로직 수정 금지(정본 먼저).
// ═════════════════════════════════════════════════════════════════════════════

export const ARCHIVE_SCHEMA_VERSION = 1 as const;
export const ARCHIVE_DIRNAME = 'archives';
export const ARCHIVE_MANIFEST_FILENAME = 'manifest.json';
export const ARCHIVE_BINARY_ROOTS: readonly string[] = ['obs-attachments'];

const VALID_ARCHIVE_NAME_RE = /^[A-Za-z0-9_.-]+$/;
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

export function isValidArchiveName(name: string): boolean {
  if (typeof name !== 'string' || name.length === 0) return false;
  if (name.startsWith('.')) return false;
  return VALID_ARCHIVE_NAME_RE.test(name);
}

export function isValidArchiveTerm(term: string): boolean {
  return isValidArchiveName(term);
}

/**
 * F10a — 같은 학기 재보관 회차(도메인 정본 미러). 아카이브 불변을 유지한 채
 * `2026-1` → `2026-1-2` → `2026-1-3` … 새 디렉토리를 만든다.
 */
const ARCHIVE_ID_RE = /^(\d{4}-[12])(?:-(\d+))?$/;

export function buildArchiveId(term: string, round: number): string {
  return round <= 1 ? term : `${term}-${round}`;
}

export function parseArchiveId(archiveId: string): { term: string; round: number } {
  const match = ARCHIVE_ID_RE.exec(archiveId);
  if (!match) return { term: archiveId, round: 1 };
  const round = match[2] === undefined ? 1 : Number(match[2]);
  return { term: match[1] as string, round: Number.isFinite(round) && round > 0 ? round : 1 };
}

export function formatArchiveRoundKo(round: number): string {
  return round > 1 ? ` (${round}번째 보관)` : '';
}

export function compareArchiveIdsDesc(a: string, b: string): number {
  const pa = parseArchiveId(a);
  const pb = parseArchiveId(b);
  if (pa.term !== pb.term) return pa.term < pb.term ? 1 : -1;
  return pb.round - pa.round;
}

export function nextArchiveRound(term: string, existingIds: readonly string[]): number {
  let max = 0;
  for (const id of existingIds) {
    const parsed = parseArchiveId(id);
    if (parsed.term === term && parsed.round > max) max = parsed.round;
  }
  return max + 1;
}

export type ArchiveCreateKey =
  | { readonly kind: 'data'; readonly base: string; readonly relPath: string }
  | {
      readonly kind: 'binary';
      readonly root: string;
      readonly name: string;
      readonly relPath: string;
    };

export function classifyArchiveCreateKey(key: string): ArchiveCreateKey | null {
  if (typeof key !== 'string' || key.length === 0) return null;
  if (key.includes('\\')) return null;
  const segments = key.split('/');
  if (segments.length === 1) {
    const base = segments[0] ?? '';
    if (!isValidArchiveName(base)) return null;
    if (base === 'manifest' || base.endsWith('.json')) return null;
    return { kind: 'data', base, relPath: `${base}.json` };
  }
  if (segments.length === 2) {
    const root = segments[0] ?? '';
    const name = segments[1] ?? '';
    if (!ARCHIVE_BINARY_ROOTS.includes(root)) return null;
    if (!isValidArchiveName(name)) return null;
    return { kind: 'binary', root, name, relPath: `${root}/${name}` };
  }
  return null;
}

export function isValidArchiveRelPath(relPath: string): boolean {
  if (typeof relPath !== 'string' || relPath.length === 0) return false;
  if (relPath.includes('\\')) return false;
  const segments = relPath.split('/');
  if (segments.length === 1) {
    return isValidArchiveName(segments[0] ?? '');
  }
  if (segments.length === 2) {
    const root = segments[0] ?? '';
    const name = segments[1] ?? '';
    return ARCHIVE_BINARY_ROOTS.includes(root) && isValidArchiveName(name);
  }
  return false;
}

export function countArchiveRecords(parsed: unknown): number {
  if (Array.isArray(parsed)) return parsed.length;
  if (parsed !== null && typeof parsed === 'object') {
    const values = Object.values(parsed as Record<string, unknown>);
    const arrays = values.filter((v): v is unknown[] => Array.isArray(v));
    if (arrays.length > 0) return arrays.reduce((sum, a) => sum + a.length, 0);
    return 1;
  }
  return 0;
}

/** 정본 defaultArchiveLabel은 academicCalendar.formatTermKo를 쓴다 — 여기선 동일 로직 인라인. */
export function defaultArchiveLabel(term: string): string {
  const match = /^(\d{4})-([12])$/.exec(term);
  if (!match) return term;
  return `${match[1]}학년도 ${match[2]}학기`;
}

export interface ArchiveManifestEntry {
  readonly path: string;
  readonly kind: 'data' | 'binary';
  readonly bytes: number;
  readonly sha256: string;
  readonly records?: number;
}

export interface ArchiveManifest {
  readonly schemaVersion: number;
  readonly term: string;
  /** F10a — 디렉토리 이름(회차 포함). 구 매니페스트에는 없다(부재 = term과 동일). */
  readonly archiveId?: string;
  readonly label: string;
  readonly archivedAt: string;
  readonly appVersion: string;
  readonly totalBytes: number;
  readonly entries: readonly ArchiveManifestEntry[];
}

export interface BuildArchiveManifestInput {
  readonly term: string;
  readonly archiveId?: string;
  readonly label: string;
  readonly archivedAt: string;
  readonly appVersion: string;
  readonly entries: readonly ArchiveManifestEntry[];
}

export function buildArchiveManifest(input: BuildArchiveManifestInput): ArchiveManifest {
  return {
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    term: input.term,
    ...(input.archiveId !== undefined ? { archiveId: input.archiveId } : {}),
    label: input.label,
    archivedAt: input.archivedAt,
    appVersion: input.appVersion,
    totalBytes: input.entries.reduce((sum, e) => sum + e.bytes, 0),
    entries: input.entries,
  };
}

export function validateArchiveManifest(
  raw: unknown,
): { ok: true; manifest: ArchiveManifest } | { ok: false; error: string } {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: '매니페스트 형식이 올바르지 않아요. (최상위 객체 아님)' };
  }
  const obj = raw as Record<string, unknown>;
  const schemaVersion = obj['schemaVersion'];
  if (typeof schemaVersion !== 'number') {
    return { ok: false, error: '매니페스트 형식이 올바르지 않아요. (schemaVersion 누락)' };
  }
  if (schemaVersion > ARCHIVE_SCHEMA_VERSION) {
    return {
      ok: false,
      error:
        '이 보관함은 더 새로운 버전의 쌤핀에서 만들어졌어요. 쌤핀을 업데이트한 뒤 다시 시도해 주세요.',
    };
  }
  const term = obj['term'];
  const label = obj['label'];
  const archivedAt = obj['archivedAt'];
  const appVersion = obj['appVersion'];
  const totalBytes = obj['totalBytes'];
  if (typeof term !== 'string' || !isValidArchiveTerm(term)) {
    return { ok: false, error: '매니페스트 형식이 올바르지 않아요. (term 불량)' };
  }
  if (
    typeof label !== 'string' ||
    typeof archivedAt !== 'string' ||
    typeof appVersion !== 'string' ||
    typeof totalBytes !== 'number'
  ) {
    return { ok: false, error: '매니페스트 형식이 올바르지 않아요. (필드 누락)' };
  }
  const entriesUnknown = obj['entries'];
  if (!Array.isArray(entriesUnknown)) {
    return { ok: false, error: '매니페스트 형식이 올바르지 않아요. (entries 누락)' };
  }
  const entries: ArchiveManifestEntry[] = [];
  for (const entryUnknown of entriesUnknown) {
    if (entryUnknown === null || typeof entryUnknown !== 'object' || Array.isArray(entryUnknown)) {
      return { ok: false, error: '매니페스트 형식이 올바르지 않아요. (항목 불량)' };
    }
    const entry = entryUnknown as Record<string, unknown>;
    const entryPath = entry['path'];
    const kind = entry['kind'];
    const bytes = entry['bytes'];
    const sha256 = entry['sha256'];
    const records = entry['records'];
    if (typeof entryPath !== 'string' || !isValidArchiveRelPath(entryPath)) {
      return { ok: false, error: `매니페스트에 허용되지 않은 경로가 있어요: ${String(entryPath)}` };
    }
    if (entryPath === ARCHIVE_MANIFEST_FILENAME) {
      return { ok: false, error: '매니페스트가 자기 자신을 항목으로 가질 수 없어요.' };
    }
    if (kind !== 'data' && kind !== 'binary') {
      return { ok: false, error: `매니페스트 항목 종류가 올바르지 않아요: ${entryPath}` };
    }
    if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) {
      return { ok: false, error: `매니페스트 항목 크기가 올바르지 않아요: ${entryPath}` };
    }
    if (typeof sha256 !== 'string' || !SHA256_HEX_RE.test(sha256)) {
      return { ok: false, error: `매니페스트 항목 체크섬이 올바르지 않아요: ${entryPath}` };
    }
    if (records !== undefined && (typeof records !== 'number' || records < 0)) {
      return { ok: false, error: `매니페스트 항목 건수가 올바르지 않아요: ${entryPath}` };
    }
    entries.push(
      records === undefined
        ? { path: entryPath, kind, bytes, sha256 }
        : { path: entryPath, kind, bytes, sha256, records },
    );
  }
  return {
    ok: true,
    manifest: { schemaVersion, term, label, archivedAt, appVersion, totalBytes, entries },
  };
}

export interface ArchiveBackupEntry {
  readonly format: 'utf8' | 'base64';
  readonly content: string;
}

export type ArchivesBackupSection = Readonly<
  Record<string, Readonly<Record<string, ArchiveBackupEntry>>>
>;

export function validateArchivesSection(
  raw: unknown,
): { ok: true; archives: ArchivesBackupSection } | { ok: false; error: string } {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: '백업의 보관함(archives) 섹션 형식이 올바르지 않아요.' };
  }
  const result: Record<string, Record<string, ArchiveBackupEntry>> = {};
  for (const [term, filesUnknown] of Object.entries(raw as Record<string, unknown>)) {
    if (!isValidArchiveTerm(term)) {
      return { ok: false, error: `백업의 보관함에 허용되지 않은 학기 이름이 있어요: ${term}` };
    }
    if (filesUnknown === null || typeof filesUnknown !== 'object' || Array.isArray(filesUnknown)) {
      return { ok: false, error: `백업의 보관함 항목 형식이 올바르지 않아요: ${term}` };
    }
    const files: Record<string, ArchiveBackupEntry> = {};
    for (const [relPath, entryUnknown] of Object.entries(filesUnknown as Record<string, unknown>)) {
      if (!isValidArchiveRelPath(relPath)) {
        return {
          ok: false,
          error: `백업의 보관함에 허용되지 않은 파일 경로가 있어요: ${term}/${relPath}`,
        };
      }
      if (
        entryUnknown === null ||
        typeof entryUnknown !== 'object' ||
        Array.isArray(entryUnknown)
      ) {
        return {
          ok: false,
          error: `백업의 보관함 파일 형식이 올바르지 않아요: ${term}/${relPath}`,
        };
      }
      const entry = entryUnknown as Record<string, unknown>;
      const format = entry['format'];
      const content = entry['content'];
      if ((format !== 'utf8' && format !== 'base64') || typeof content !== 'string') {
        return {
          ok: false,
          error: `백업의 보관함 파일 형식이 올바르지 않아요: ${term}/${relPath}`,
        };
      }
      files[relPath] = { format, content };
    }
    result[term] = files;
  }
  return { ok: true, archives: result };
}

// ═════════════════════════════════════════════════════════════════════════════
// MIRROR 끝 — 여기부터는 electron 전용(fs·crypto) 구현.
// ═════════════════════════════════════════════════════════════════════════════

export interface ArchiveFailure {
  readonly ok: false;
  readonly error: string;
}

export interface ArchiveCreateSuccess {
  readonly ok: true;
  /** 논리 학기('2026-1'). */
  readonly term: string;
  /** F10a — 실제 디렉토리 이름(회차 포함, 예 '2026-1-2'). 열람·삭제·복원의 키. */
  readonly archiveId: string;
  /** 재보관 회차(1부터). */
  readonly round: number;
  readonly label: string;
  readonly entryCount: number;
  readonly totalBytes: number;
}

export interface ArchiveSummary {
  /** 논리 학기('2026-1') — 표시·그룹핑용. */
  readonly term: string;
  /** F10a — 디렉토리 이름(회차 포함). **열람·삭제·복원은 이 값을 키로 쓴다.** */
  readonly archiveId: string;
  /** 재보관 회차(1부터). 표시는 formatArchiveRoundKo. */
  readonly round: number;
  readonly label: string;
  readonly archivedAt: string;
  readonly appVersion: string;
  readonly entryCount: number;
  readonly totalBytes: number;
  /** manifest.json이 존재·유효한지. false면 error에 사유. */
  readonly manifestOk: boolean;
  readonly error?: string;
}

export interface ArchiveListSuccess {
  readonly ok: true;
  readonly archives: readonly ArchiveSummary[];
}

export interface ArchiveReadSuccess {
  readonly ok: true;
  readonly encoding: 'utf8' | 'base64';
  readonly content: string;
}

export interface ArchiveDeleteSuccess {
  readonly ok: true;
  readonly existed: boolean;
}

export interface ArchivesCollectSuccess {
  readonly ok: true;
  readonly archives: ArchivesBackupSection;
  readonly termCount: number;
  readonly totalBytes: number;
}

export interface ArchivesRestoreSuccess {
  readonly ok: true;
  readonly restoredTerms: readonly string[];
  /** 이미 로컬에 있는 학기 — 아카이브는 불변이므로 덮어쓰지 않고 건너뛴다. */
  readonly skippedTerms: readonly string[];
}

function fail(error: string): ArchiveFailure {
  return { ok: false, error };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function sha256Hex(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function getArchivesRoot(userDataPath: string): string {
  return path.join(userDataPath, 'data', ARCHIVE_DIRNAME);
}

/**
 * baseDir 하위임을 `path.relative`로 재확인한 절대 경로. 벗어나면 null.
 * (resolveFormsPath 패턴 — 이름 화이트리스트를 통과했더라도 이중으로 확인한다.)
 */
function resolveUnder(baseDir: string, ...segments: string[]): string | null {
  const abs = path.resolve(baseDir, ...segments);
  const rel = path.relative(baseDir, abs);
  if (rel.length === 0 || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return abs;
}

function removeDirQuiet(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* 정리 실패는 비치명 — 스테이징 이름은 '.' 시작이라 목록·복원에 절대 안 잡힌다 */
  }
}

/**
 * 아카이브 생성 — 지정한 파일 키들을 `archives/{term}/`으로 바이트 복사하고 매니페스트를 쓴다.
 * 스테이징 디렉토리에 전부 쓴 뒤 rename으로 원자적 완성. 어떤 실패에서도 라이브 파일은
 * 읽기만 하므로 무변경이고, 최종 위치에 부분 결과물이 남지 않는다.
 */
export function createArchive(
  userDataPath: string,
  appVersion: string,
  term: string,
  fileKeys: readonly string[],
  opts?: { readonly label?: string },
): ArchiveCreateSuccess | ArchiveFailure {
  let stagingDir: string | null = null;
  try {
    if (!isValidArchiveTerm(term)) {
      return fail(`허용되지 않은 학기 이름이에요: ${term}`);
    }
    const archivesRoot = getArchivesRoot(userDataPath);
    // F10a — 같은 학기를 다시 마무리하면 **새 회차 디렉토리**를 만든다(덮어쓰기 금지 유지).
    // 되돌리기 후 재마무리가 "이미 있어요"로 막히던 막다른 길(qa1-⑥)을 여는 유일한 변경점이다.
    const existingIds = fs.existsSync(archivesRoot)
      ? fs
          .readdirSync(archivesRoot, { withFileTypes: true })
          .filter((d) => d.isDirectory() && isValidArchiveTerm(d.name))
          .map((d) => d.name)
      : [];
    const round = nextArchiveRound(term, existingIds);
    const archiveId = buildArchiveId(term, round);
    if (!isValidArchiveTerm(archiveId)) {
      return fail(`허용되지 않은 보관 회차 이름이에요: ${archiveId}`);
    }
    const termDir = resolveUnder(archivesRoot, archiveId);
    if (termDir === null) {
      return fail(`보관함 경계를 벗어난 학기 이름이에요: ${archiveId}`);
    }
    if (fs.existsSync(termDir)) {
      return fail(`이미 같은 이름의 보관함이 있어요: ${archiveId}`);
    }

    // 1) 키 전수 검증 — 하나라도 불량이면 아무것도 쓰지 않는다.
    const classified: { readonly key: string; readonly c: ArchiveCreateKey }[] = [];
    const seenRelPaths = new Set<string>();
    for (const key of fileKeys) {
      const c = classifyArchiveCreateKey(key);
      if (c === null) {
        return fail(`허용되지 않은 파일 키예요: ${key}`);
      }
      if (seenRelPaths.has(c.relPath)) continue; // 중복 키는 1회만
      seenRelPaths.add(c.relPath);
      classified.push({ key, c });
    }

    // 2) 스테이징에 복사 + 쓰기 검증(체크섬 대조 — data:write의 실패 은닉을 반복하지 않는다)
    stagingDir = path.join(archivesRoot, `.staging-${Date.now()}-${process.pid}`);
    fs.mkdirSync(stagingDir, { recursive: true });

    const entries: ArchiveManifestEntry[] = [];
    for (const { key, c } of classified) {
      const sourcePath =
        c.kind === 'data'
          ? path.join(userDataPath, 'data', `${c.base}.json`)
          : path.join(userDataPath, c.root, c.name);
      if (!fs.existsSync(sourcePath)) {
        continue; // 존재하지 않는 도메인·첨부는 건너뛴다(오류 아님 — 안 쓰는 기능일 뿐)
      }
      const bytes = fs.readFileSync(sourcePath);
      let records: number | undefined;
      if (c.kind === 'data') {
        try {
          records = countArchiveRecords(JSON.parse(bytes.toString('utf-8')));
        } catch {
          return fail(`원본 데이터 파일이 손상되어 보관을 중단했어요: ${key}`);
        }
      }
      const destPath = resolveUnder(stagingDir, c.relPath);
      if (destPath === null) {
        return fail(`보관함 경계를 벗어난 파일 키예요: ${key}`);
      }
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, bytes);
      const checksum = sha256Hex(bytes);
      const written = fs.readFileSync(destPath);
      if (sha256Hex(written) !== checksum) {
        return fail(`복사 검증에 실패했어요(체크섬 불일치): ${key}`);
      }
      entries.push(
        records === undefined
          ? { path: c.relPath, kind: c.kind, bytes: written.byteLength, sha256: checksum }
          : { path: c.relPath, kind: c.kind, bytes: written.byteLength, sha256: checksum, records },
      );
    }

    // 3) 매니페스트 작성 → 원자적 완성(rename)
    const manifest = buildArchiveManifest({
      term,
      archiveId,
      label: opts?.label ?? defaultArchiveLabel(term),
      archivedAt: new Date().toISOString(),
      appVersion,
      entries,
    });
    const manifestJson = JSON.stringify(manifest, null, 2);
    const manifestPath = path.join(stagingDir, ARCHIVE_MANIFEST_FILENAME);
    fs.writeFileSync(manifestPath, manifestJson, 'utf-8');
    const manifestWritten = fs.readFileSync(manifestPath, 'utf-8');
    if (manifestWritten !== manifestJson) {
      return fail('매니페스트 쓰기 검증에 실패했어요.');
    }
    fs.renameSync(stagingDir, termDir);
    stagingDir = null; // rename 완료 — finally 정리 대상 아님

    return {
      ok: true,
      term,
      archiveId,
      round,
      label: manifest.label,
      entryCount: entries.length,
      totalBytes: manifest.totalBytes,
    };
  } catch (err) {
    return fail(`보관함 생성에 실패했어요: ${errorMessage(err)}`);
  } finally {
    if (stagingDir !== null && fs.existsSync(stagingDir)) {
      removeDirQuiet(stagingDir);
    }
  }
}

/** 보관함 목록 — 각 학기 디렉토리의 매니페스트를 읽어 요약을 반환한다. 손상은 숨기지 않고 표시. */
export function listArchives(userDataPath: string): ArchiveListSuccess | ArchiveFailure {
  try {
    const archivesRoot = getArchivesRoot(userDataPath);
    if (!fs.existsSync(archivesRoot)) {
      return { ok: true, archives: [] };
    }
    const dirents = fs.readdirSync(archivesRoot, { withFileTypes: true });
    const archives: ArchiveSummary[] = [];
    for (const dirent of dirents) {
      if (!dirent.isDirectory()) continue;
      if (!isValidArchiveTerm(dirent.name)) continue; // '.staging-*' 등은 목록에서 제외
      // F10a — 디렉토리 이름이 archiveId(회차 포함), 논리 학기는 여기서 파생한다.
      const archiveId = dirent.name;
      const parsed = parseArchiveId(archiveId);
      const manifestPath = path.join(archivesRoot, archiveId, ARCHIVE_MANIFEST_FILENAME);
      let summary: ArchiveSummary;
      try {
        const raw = fs.readFileSync(manifestPath, 'utf-8');
        const validated = validateArchiveManifest(JSON.parse(raw));
        if (validated.ok) {
          const m = validated.manifest;
          summary = {
            // 매니페스트의 term이 정본(디렉토리 파생은 폴백) — 레거시 이름도 그대로 보인다.
            term: m.term,
            archiveId,
            round: parsed.round,
            label: m.label,
            archivedAt: m.archivedAt,
            appVersion: m.appVersion,
            entryCount: m.entries.length,
            totalBytes: m.totalBytes,
            manifestOk: true,
          };
        } else {
          summary = {
            term: parsed.term,
            archiveId,
            round: parsed.round,
            label: archiveId,
            archivedAt: '',
            appVersion: '',
            entryCount: 0,
            totalBytes: 0,
            manifestOk: false,
            error: validated.error,
          };
        }
      } catch (err) {
        summary = {
          term: parsed.term,
          archiveId,
          round: parsed.round,
          label: archiveId,
          archivedAt: '',
          appVersion: '',
          entryCount: 0,
          totalBytes: 0,
          manifestOk: false,
          error: `매니페스트를 읽지 못했어요: ${errorMessage(err)}`,
        };
      }
      archives.push(summary);
    }
    // 학기 내림차순 → 회차 내림차순(최신 보관이 위)
    archives.sort((a, b) => compareArchiveIdsDesc(a.archiveId, b.archiveId));
    return { ok: true, archives };
  } catch (err) {
    return fail(`보관함 목록을 읽지 못했어요: ${errorMessage(err)}`);
  }
}

/**
 * 보관된 파일 1개 읽기 — 매니페스트 체크섬과 대조해 일치할 때만 내용을 반환한다(AC-3).
 * fileKey는 학기 디렉토리 기준 상대 경로('students.json' | 'obs-attachments/x.png' | 'manifest.json').
 */
export function readArchiveFile(
  userDataPath: string,
  term: string,
  fileKey: string,
): ArchiveReadSuccess | ArchiveFailure {
  try {
    if (!isValidArchiveTerm(term)) {
      return fail(`허용되지 않은 학기 이름이에요: ${term}`);
    }
    const archivesRoot = getArchivesRoot(userDataPath);
    const termDir = resolveUnder(archivesRoot, term);
    if (termDir === null || !fs.existsSync(termDir)) {
      return fail(`해당 학기의 보관함이 없어요: ${term}`);
    }
    if (!isValidArchiveRelPath(fileKey)) {
      return fail(`허용되지 않은 파일 경로예요: ${fileKey}`);
    }
    const filePath = resolveUnder(termDir, fileKey);
    if (filePath === null) {
      return fail(`보관함 경계를 벗어난 파일 경로예요: ${fileKey}`);
    }

    // 매니페스트 자체는 체크섬 대상이 아니다(자기 자신을 담을 수 없음) — 유효성만 검증 후 반환.
    if (fileKey === ARCHIVE_MANIFEST_FILENAME) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const validated = validateArchiveManifest(JSON.parse(raw));
      if (!validated.ok) return fail(validated.error);
      return { ok: true, encoding: 'utf8', content: raw };
    }

    const manifestRaw = fs.readFileSync(path.join(termDir, ARCHIVE_MANIFEST_FILENAME), 'utf-8');
    const validated = validateArchiveManifest(JSON.parse(manifestRaw));
    if (!validated.ok) {
      return fail(validated.error);
    }
    const entry = validated.manifest.entries.find((e) => e.path === fileKey);
    if (!entry) {
      return fail(`보관함 목록(매니페스트)에 없는 파일이에요: ${fileKey}`);
    }
    if (!fs.existsSync(filePath)) {
      return fail(`보관된 파일이 디스크에 없어요: ${fileKey}`);
    }
    const bytes = fs.readFileSync(filePath);
    if (sha256Hex(bytes) !== entry.sha256) {
      return fail(`보관된 파일이 손상됐어요(체크섬 불일치): ${fileKey}`);
    }
    if (entry.kind === 'binary') {
      return { ok: true, encoding: 'base64', content: bytes.toString('base64') };
    }
    return { ok: true, encoding: 'utf8', content: bytes.toString('utf-8') };
  } catch (err) {
    return fail(`보관된 파일을 읽지 못했어요: ${errorMessage(err)}`);
  }
}

/** 학기 보관함 삭제 — `archives/{term}` 디렉토리만 지운다. 라이브 데이터는 절대 건드리지 않는다. */
export function deleteArchive(
  userDataPath: string,
  term: string,
): ArchiveDeleteSuccess | ArchiveFailure {
  try {
    if (!isValidArchiveTerm(term)) {
      return fail(`허용되지 않은 학기 이름이에요: ${term}`);
    }
    const archivesRoot = getArchivesRoot(userDataPath);
    const termDir = resolveUnder(archivesRoot, term);
    if (termDir === null) {
      return fail(`보관함 경계를 벗어난 학기 이름이에요: ${term}`);
    }
    if (!fs.existsSync(termDir)) {
      return { ok: true, existed: false };
    }
    fs.rmSync(termDir, { recursive: true, force: true });
    if (fs.existsSync(termDir)) {
      return fail(`보관함 삭제가 완료되지 않았어요: ${term}`);
    }
    return { ok: true, existed: true };
  } catch (err) {
    return fail(`보관함 삭제에 실패했어요: ${errorMessage(err)}`);
  }
}

export interface ArchiveImportSuccess {
  readonly ok: true;
  readonly term: string;
  /** true = 이미 로컬에 같은 학기가 있어 아무것도 쓰지 않았다(아카이브 불변 — 덮어쓰기 금지). */
  readonly skipped: boolean;
  readonly entryCount: number;
}

/**
 * (S4.1) 아카이브 Drive 동기화의 다운로드 배치 — 리모트에서 받아온 학기 1개 분량의
 * 파일 묶음(`{relPath: {format, content}}`)을 `archives/{term}/`으로 원자적으로 들여온다.
 *
 * 계약(계획 §4 S4.1 — 아카이브는 불변):
 *  - **이미 같은 학기가 있으면 아무것도 쓰지 않는다**(skipped:true — 절대 덮어쓰기 금지).
 *  - manifest.json이 반드시 포함되어야 하고, term이 일치해야 하며, 매니페스트의 **모든
 *    항목이 실제로 존재 + SHA-256 일치**할 때에만 배치한다(부분·손상 다운로드 거부).
 *  - 매니페스트에 없는 낯선 파일이 섞여 있으면 거부한다(다른 기기의 동명 아카이브 혼입 방지).
 *  - archive:create와 같은 스테이징 + rename — 실패 시 최종 위치에 부분 결과물 0.
 */
export function importArchive(
  userDataPath: string,
  term: string,
  filesRaw: unknown,
): ArchiveImportSuccess | ArchiveFailure {
  let stagingDir: string | null = null;
  try {
    if (!isValidArchiveTerm(term)) {
      return fail(`허용되지 않은 학기 이름이에요: ${term}`);
    }
    const archivesRoot = getArchivesRoot(userDataPath);
    const termDir = resolveUnder(archivesRoot, term);
    if (termDir === null) {
      return fail(`보관함 경계를 벗어난 학기 이름이에요: ${term}`);
    }
    if (fs.existsSync(termDir)) {
      return { ok: true, term, skipped: true, entryCount: 0 };
    }

    // 1) 형태 검증 — term·상대 경로·포맷 전부 화이트리스트(validateArchivesSection 재사용).
    const validated = validateArchivesSection({ [term]: filesRaw });
    if (!validated.ok) {
      return fail(validated.error);
    }
    const files = validated.archives[term] ?? {};

    // 2) 바이트 복원 + 매니페스트 검증.
    const bytesByPath = new Map<string, Buffer>();
    for (const [relPath, entry] of Object.entries(files)) {
      bytesByPath.set(
        relPath,
        entry.format === 'base64'
          ? Buffer.from(entry.content, 'base64')
          : Buffer.from(entry.content, 'utf-8'),
      );
    }
    const manifestBytes = bytesByPath.get(ARCHIVE_MANIFEST_FILENAME);
    if (!manifestBytes) {
      return fail(`매니페스트가 없어 보관함을 들여올 수 없어요: ${term}`);
    }
    let manifestParsed: unknown;
    try {
      manifestParsed = JSON.parse(manifestBytes.toString('utf-8'));
    } catch {
      return fail(`매니페스트를 해석할 수 없어요: ${term}`);
    }
    const manifestValidated = validateArchiveManifest(manifestParsed);
    if (!manifestValidated.ok) {
      return fail(manifestValidated.error);
    }
    const manifest = manifestValidated.manifest;
    if (manifest.term !== term) {
      return fail(`매니페스트의 학기(${manifest.term})가 대상 학기(${term})와 달라요.`);
    }

    // 3) 완결성 — 매니페스트의 모든 항목이 존재하고 체크섬이 일치해야 한다.
    for (const entry of manifest.entries) {
      const bytes = bytesByPath.get(entry.path);
      if (!bytes) {
        return fail(`받은 파일이 불완전해요(누락): ${term}/${entry.path}`);
      }
      if (sha256Hex(bytes) !== entry.sha256) {
        return fail(`받은 파일이 손상됐어요(체크섬 불일치): ${term}/${entry.path}`);
      }
    }
    // 낯선 파일 거부 — 매니페스트 + manifest.json 외의 경로가 섞여 있으면 배치하지 않는다.
    const allowedPaths = new Set<string>([
      ARCHIVE_MANIFEST_FILENAME,
      ...manifest.entries.map((e) => e.path),
    ]);
    for (const relPath of bytesByPath.keys()) {
      if (!allowedPaths.has(relPath)) {
        return fail(`매니페스트에 없는 파일이 섞여 있어요: ${term}/${relPath}`);
      }
    }

    // 4) 스테이징 쓰기 → rename (archive:create와 동일한 원자적 완성).
    stagingDir = path.join(archivesRoot, `.staging-import-${Date.now()}-${process.pid}`);
    fs.mkdirSync(stagingDir, { recursive: true });
    for (const [relPath, bytes] of bytesByPath) {
      const destPath = resolveUnder(stagingDir, relPath);
      if (destPath === null) {
        return fail(`보관함 경계를 벗어난 파일 경로예요: ${term}/${relPath}`);
      }
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, bytes);
      const written = fs.readFileSync(destPath);
      if (sha256Hex(written) !== sha256Hex(bytes)) {
        return fail(`쓰기 검증에 실패했어요(체크섬 불일치): ${term}/${relPath}`);
      }
    }
    fs.renameSync(stagingDir, termDir);
    stagingDir = null;

    return { ok: true, term, skipped: false, entryCount: manifest.entries.length };
  } catch (err) {
    return fail(`보관함 들여오기에 실패했어요: ${errorMessage(err)}`);
  } finally {
    if (stagingDir !== null && fs.existsSync(stagingDir)) {
      removeDirQuiet(stagingDir);
    }
  }
}

/**
 * (S2.1b) 수동 백업 export용 — 디스크의 모든 아카이브를 `archives` 섹션으로 수집한다.
 * 파일은 파싱하지 않고 원문(utf8)/base64로 담아 바이트 보존 — 복원 후 체크섬이 그대로 맞는다.
 */
export function collectArchivesSection(
  userDataPath: string,
): ArchivesCollectSuccess | ArchiveFailure {
  try {
    const archivesRoot = getArchivesRoot(userDataPath);
    if (!fs.existsSync(archivesRoot)) {
      return { ok: true, archives: {}, termCount: 0, totalBytes: 0 };
    }
    const result: Record<string, Record<string, ArchiveBackupEntry>> = {};
    let totalBytes = 0;
    const dirents = fs.readdirSync(archivesRoot, { withFileTypes: true });
    for (const dirent of dirents) {
      if (!dirent.isDirectory() || !isValidArchiveTerm(dirent.name)) continue;
      const term = dirent.name;
      const termDir = path.join(archivesRoot, term);
      const files: Record<string, ArchiveBackupEntry> = {};

      // 1단계: 학기 루트의 JSON 파일(manifest.json 포함) — utf8 원문
      for (const entry of fs.readdirSync(termDir, { withFileTypes: true })) {
        if (entry.isFile()) {
          if (!entry.name.endsWith('.json') || !isValidArchiveRelPath(entry.name)) continue;
          const bytes = fs.readFileSync(path.join(termDir, entry.name));
          files[entry.name] = { format: 'utf8', content: bytes.toString('utf-8') };
          totalBytes += bytes.byteLength;
        } else if (entry.isDirectory() && ARCHIVE_BINARY_ROOTS.includes(entry.name)) {
          // 2단계: 바이너리 루트(obs-attachments 등) — base64
          const binDir = path.join(termDir, entry.name);
          for (const bin of fs.readdirSync(binDir, { withFileTypes: true })) {
            if (!bin.isFile()) continue;
            const relPath = `${entry.name}/${bin.name}`;
            if (!isValidArchiveRelPath(relPath)) continue;
            const bytes = fs.readFileSync(path.join(binDir, bin.name));
            files[relPath] = { format: 'base64', content: bytes.toString('base64') };
            totalBytes += bytes.byteLength;
          }
        }
      }
      result[term] = files;
    }
    return { ok: true, archives: result, termCount: Object.keys(result).length, totalBytes };
  } catch (err) {
    return fail(`보관함을 백업에 담지 못했어요: ${errorMessage(err)}`);
  }
}

/**
 * (S2.1b) 수동 백업 import용 — 백업의 `archives` 섹션을 디스크에 복원한다.
 * 아카이브는 불변이므로 **이미 존재하는 학기는 덮어쓰지 않고 건너뛴다.**
 * 학기 단위 스테이징 + rename — 실패 시 최종 위치에 부분 복원물을 남기지 않는다.
 */
export function restoreArchivesSection(
  userDataPath: string,
  raw: unknown,
): ArchivesRestoreSuccess | ArchiveFailure {
  const validated = validateArchivesSection(raw);
  if (!validated.ok) {
    return fail(validated.error);
  }
  const restoredTerms: string[] = [];
  const skippedTerms: string[] = [];
  try {
    const archivesRoot = getArchivesRoot(userDataPath);
    for (const [term, files] of Object.entries(validated.archives)) {
      const termDir = resolveUnder(archivesRoot, term);
      if (termDir === null) {
        return fail(`보관함 경계를 벗어난 학기 이름이에요: ${term}`);
      }
      if (fs.existsSync(termDir)) {
        skippedTerms.push(term);
        continue;
      }
      const stagingDir = path.join(archivesRoot, `.staging-restore-${Date.now()}-${process.pid}`);
      try {
        fs.mkdirSync(stagingDir, { recursive: true });
        for (const [relPath, entry] of Object.entries(files)) {
          const destPath = resolveUnder(stagingDir, relPath);
          if (destPath === null) {
            return fail(`보관함 경계를 벗어난 파일 경로예요: ${term}/${relPath}`);
          }
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          if (entry.format === 'base64') {
            fs.writeFileSync(destPath, Buffer.from(entry.content, 'base64'));
          } else {
            fs.writeFileSync(destPath, entry.content, 'utf-8');
          }
        }
        fs.renameSync(stagingDir, termDir);
        restoredTerms.push(term);
      } finally {
        if (fs.existsSync(stagingDir)) {
          removeDirQuiet(stagingDir);
        }
      }
    }
    return { ok: true, restoredTerms, skippedTerms };
  } catch (err) {
    return fail(
      `보관함 복원에 실패했어요: ${errorMessage(err)}` +
        (restoredTerms.length > 0 ? ` (이미 복원된 학기: ${restoredTerms.join(', ')})` : ''),
    );
  }
}
