/**
 * 학년도 보관함(아카이브) 도메인 규칙 — 파일명 검증·매니페스트 스키마의 단일 정본.
 * (school-year-archive 계획 §4 S2.1 — ADR-030 파일 스냅샷 방식)
 *
 * ⚠️ 의도적 미러(계획 함정 ⑤): `electron/archiveManager.ts` 상단 "MIRROR" 블록은
 * 이 파일의 순수 함수들을 그대로 복제한다. electron은 rootDir 제약으로 `@domain`을
 * import할 수 없다(`backupRules.ts` ↔ `backupManager.ts` 선례). 여기를 고치면
 * electron 쪽도 반드시 함께 고친다 — 두 구현의 동치는
 * `electron/archiveRules.mirror.test.ts`가 기계로 검증한다(계획 S2.1 AC-5).
 *
 * 외부 의존성 0 (domain 규칙). 체크섬(SHA-256) "계산"은 Node crypto가 필요하므로
 * electron(archiveManager) 책임이고, 이 파일은 체크섬 "형식"(hex 64자)만 검증한다.
 */

import { formatTermKo } from './academicCalendar';

/** 아카이브 매니페스트 포맷 버전. 호환되지 않는 구조 변경 시 +1. */
export const ARCHIVE_SCHEMA_VERSION = 1 as const;

/** 아카이브 루트 디렉토리 이름 — `{userData}/data/archives/{term}/`. */
export const ARCHIVE_DIRNAME = 'archives';

/** 각 학기 디렉토리 안의 매니페스트 파일 이름. */
export const ARCHIVE_MANIFEST_FILENAME = 'manifest.json';

/**
 * 아카이브에 포함 가능한 바이너리 루트 화이트리스트.
 * 관찰 첨부는 `{userData}/obs-attachments/`에 있다 — `data/` 아래가 아니다(계획 함정 ③,
 * `observationAttachmentRules.ts` storageRefFor 참조). 새 바이너리 도메인은 여기에 추가한다.
 */
export const ARCHIVE_BINARY_ROOTS: readonly string[] = ['obs-attachments'];

/** 이름 화이트리스트 — `backupRules.ts:22` VALID_FILENAME_RE와 동일한 패턴(경로 인젝션 방어). */
const VALID_ARCHIVE_NAME_RE = /^[A-Za-z0-9_.-]+$/;

/** SHA-256 hex 형식. */
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

/**
 * 경로 세그먼트 1개가 안전한 이름인지.
 * `.`/`..`/숨김·스테이징(`.` 시작) 전부 거부 — traversal과 내부 임시 디렉토리 오염 방지.
 */
export function isValidArchiveName(name: string): boolean {
  if (typeof name !== 'string' || name.length === 0) return false;
  if (name.startsWith('.')) return false; // '.', '..', '.staging-*', 숨김 파일 전부 거부
  return VALID_ARCHIVE_NAME_RE.test(name);
}

/** 학기 디렉토리 이름(예: '2026-1') 검증 — 세그먼트 규칙과 동일. */
export function isValidArchiveTerm(term: string): boolean {
  return isValidArchiveName(term);
}

/** archive:create 입력 키 분류 결과. relPath는 학기 디렉토리 기준 저장 상대 경로. */
export type ArchiveCreateKey =
  | { readonly kind: 'data'; readonly base: string; readonly relPath: string }
  | {
      readonly kind: 'binary';
      readonly root: string;
      readonly name: string;
      readonly relPath: string;
    };

/**
 * archive:create의 파일 키 1개를 분류한다.
 *  - `'students'`            → data:   원본 `data/students.json` → 사본 `students.json`
 *  - `'obs-attachments/x.png'` → binary: 원본 `{userData}/obs-attachments/x.png` → 사본 동일 상대 경로
 * 허용되지 않는 형태(traversal·비화이트리스트 루트·`manifest` 충돌·`.json` 이중 확장)는 null.
 */
export function classifyArchiveCreateKey(key: string): ArchiveCreateKey | null {
  if (typeof key !== 'string' || key.length === 0) return null;
  if (key.includes('\\')) return null;
  const segments = key.split('/');
  if (segments.length === 1) {
    const base = segments[0] ?? '';
    if (!isValidArchiveName(base)) return null;
    // 'manifest'는 manifest.json과 충돌, '*.json'은 이중 확장('x.json.json')을 낳는다.
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

/**
 * 학기 디렉토리 안의 저장 상대 경로(매니페스트 entry.path, archive:read fileKey,
 * 백업 archives 섹션 fileKey) 검증. 최대 2세그먼트, 2세그먼트면 루트는 바이너리 화이트리스트.
 */
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

/**
 * 데이터 파일 1개의 "건수"를 결정적으로 센다(매니페스트 표시용).
 *  - 배열 → 길이
 *  - 객체 → 최상위 배열 값들의 길이 합(봉투 `{records: [...]}` 형태), 배열이 없으면 1(문서 1건)
 *  - 그 외(원시값/null) → 0
 */
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

/** 기본 라벨 — '2026-1' → '2026학년도 1학기'. 형식이 아니면 원문 그대로. */
export function defaultArchiveLabel(term: string): string {
  return formatTermKo(term);
}

/** 매니페스트의 파일 1건 항목. */
export interface ArchiveManifestEntry {
  /** 학기 디렉토리 기준 상대 경로(예: 'students.json', 'obs-attachments/a.png'). */
  readonly path: string;
  readonly kind: 'data' | 'binary';
  readonly bytes: number;
  /** 파일 바이트의 SHA-256 hex(64자). */
  readonly sha256: string;
  /** data 파일의 레코드 건수(countArchiveRecords). binary는 없음. */
  readonly records?: number;
}

/** 아카이브 매니페스트 — 라벨·시각·앱 버전·파일별 건수·체크섬(계획 S2.1). */
export interface ArchiveManifest {
  readonly schemaVersion: number;
  readonly term: string;
  readonly label: string;
  /** ISO 8601 보관 시각. */
  readonly archivedAt: string;
  readonly appVersion: string;
  readonly totalBytes: number;
  readonly entries: readonly ArchiveManifestEntry[];
}

export interface BuildArchiveManifestInput {
  readonly term: string;
  readonly label: string;
  readonly archivedAt: string;
  readonly appVersion: string;
  readonly entries: readonly ArchiveManifestEntry[];
}

/** 매니페스트 생성 — totalBytes는 entries에서 파생한다. */
export function buildArchiveManifest(input: BuildArchiveManifestInput): ArchiveManifest {
  return {
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    term: input.term,
    label: input.label,
    archivedAt: input.archivedAt,
    appVersion: input.appVersion,
    totalBytes: input.entries.reduce((sum, e) => sum + e.bytes, 0),
    entries: input.entries,
  };
}

/** 미가공 파싱 결과(unknown)를 ArchiveManifest로 검증한다. 실패 시 한국어 사유. */
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

/**
 * 수동 백업의 `archives` 섹션(S2.1b) — 파일 1개를 바이트 보존 형태로 담는다.
 * data(JSON)·manifest는 utf8 원문 문자열, 바이너리는 base64. 파싱된 객체가 아니라
 * "원문 문자열"을 담아야 복원 후에도 매니페스트 체크섬이 그대로 일치한다.
 */
export interface ArchiveBackupEntry {
  readonly format: 'utf8' | 'base64';
  readonly content: string;
}

/** 백업 최상위 `archives` 섹션: `{ [term]: { [relPath]: ArchiveBackupEntry } }`. */
export type ArchivesBackupSection = Readonly<
  Record<string, Readonly<Record<string, ArchiveBackupEntry>>>
>;

/** 미가공 `archives` 섹션 검증 — term·상대 경로·항목 형태 전부 화이트리스트 검사. */
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

/* ─── (S4.1) 아카이브 Drive 동기화 키 ─────────────────────────────────────────
 * Drive 매니페스트에서 아카이브 파일을 식별하는 네임스페이스 키:
 *   `archives/{term}/{relPath}`  (예: 'archives/2026-1/students.json',
 *                                     'archives/2026-1/obs-attachments/x.png')
 * ⚠️ 아래 두 함수는 electron 미러 대상이 아니다 — 렌더러(어댑터)·유즈케이스만 사용한다.
 * ───────────────────────────────────────────────────────────────────────────── */

/** Drive 동기화 매니페스트의 아카이브 키 접두어. */
export const ARCHIVE_SYNC_KEY_PREFIX = 'archives/';

/** 아카이브 동기화 키 생성 — term·relPath가 화이트리스트를 통과할 때만. 아니면 null. */
export function buildArchiveSyncKey(term: string, relPath: string): string | null {
  if (!isValidArchiveTerm(term)) return null;
  if (!isValidArchiveRelPath(relPath)) return null;
  return `${ARCHIVE_SYNC_KEY_PREFIX}${term}/${relPath}`;
}

/** 아카이브 동기화 키 해석 — 접두어·term·relPath 전부 검증. 형식이 아니면 null. */
export function parseArchiveSyncKey(
  key: string,
): { readonly term: string; readonly relPath: string } | null {
  if (typeof key !== 'string' || !key.startsWith(ARCHIVE_SYNC_KEY_PREFIX)) return null;
  const rest = key.slice(ARCHIVE_SYNC_KEY_PREFIX.length);
  const slash = rest.indexOf('/');
  if (slash <= 0) return null;
  const term = rest.slice(0, slash);
  const relPath = rest.slice(slash + 1);
  if (!isValidArchiveTerm(term)) return null;
  if (!isValidArchiveRelPath(relPath)) return null;
  return { term, relPath };
}
