/**
 * 백업 파일 검증/생성 순수 함수 — 외부 의존 0, fully testable.
 *
 * 윤리적 안전장치:
 *  - 절대 외부 서버에 무엇이든 전송하지 않는다 (이 파일은 그저 데이터를 검증/구조화).
 *  - 보안 저장소(secureWrite/secureRead)는 본 모듈을 절대 거치지 않는다 — 호출 측 책임.
 */

import type {
  BackupFile,
  BackupMetadata,
  BackupParseError,
  BackupPlatform,
} from '@domain/entities/Backup';
import { CURRENT_BACKUP_SCHEMA_VERSION } from '@domain/entities/Backup';

/** 백업에서 무조건 제외할 파일명(확장자 제외). 환경/임시/내부 파일. */
const EXCLUDED_FILENAMES: ReadonlySet<string> = new Set([
  'widget-bounds',
  'icon-bounds',
]);

/** 파일명 패턴 화이트리스트 — 허용 문자: 영숫자, 하이픈, 언더스코어, 점.
 *  경로 인젝션 방어 + atomic write 잔재(.tmp.json, .backup.json) 차단. */
const VALID_FILENAME_RE = /^[A-Za-z0-9_.-]+$/;

/**
 * `userData/data/`에서 가져온 파일명 목록을 백업 대상으로 정제한다.
 *  - .json 확장자 제거
 *  - .backup / .tmp 부산물 제외
 *  - widget-bounds / icon-bounds 환경 파일 제외
 *  - 비정상 패턴(공백/슬래시/..) 제외
 *
 * 입력은 정제 전 파일 이름(예: `settings.json`, `events.backup.json`).
 */
export function selectBackupCandidates(
  rawFilenames: readonly string[],
): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of rawFilenames) {
    if (!raw.endsWith('.json')) continue;
    const base = raw.slice(0, -'.json'.length);
    if (base.length === 0) continue;

    // .backup / .tmp 부산물 차단
    if (base.endsWith('.backup') || base.endsWith('.tmp')) continue;
    // 환경 파일 제외
    if (EXCLUDED_FILENAMES.has(base)) continue;
    // 패턴 검증 — path traversal 등 사전 차단
    if (!VALID_FILENAME_RE.test(base)) continue;

    if (seen.has(base)) continue;
    seen.add(base);
    result.push(base);
  }

  // 결정적 출력(정렬) — 백업 파일을 diff로 비교하기 쉽게 한다.
  return [...result].sort();
}

export interface BuildBackupMetadataInput {
  readonly appVersion: string;
  readonly platform: BackupPlatform;
  readonly exportedAt: string;
  readonly entryCount: number;
}

/** BackupMetadata 생성 — 호출 측은 ISO 시각만 주입하면 된다. */
export function buildBackupMetadata(
  input: BuildBackupMetadataInput,
): BackupMetadata {
  return {
    schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    appVersion: input.appVersion,
    exportedAt: input.exportedAt,
    platform: input.platform,
    entryCount: input.entryCount,
  };
}

/**
 * 미가공 파싱 결과(unknown)를 BackupFile로 검증한다.
 * 실패 시 한국어 메시지를 가진 BackupParseError 반환.
 */
export function validateBackupFile(
  raw: unknown,
): { ok: true; backup: BackupFile } | { ok: false; error: BackupParseError } {
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

  // metadata 검사
  const metaUnknown = obj['metadata'];
  if (
    metaUnknown === null ||
    typeof metaUnknown !== 'object' ||
    Array.isArray(metaUnknown)
  ) {
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

  if (schemaVersion > CURRENT_BACKUP_SCHEMA_VERSION) {
    return {
      ok: false,
      error: {
        code: 'unsupported-future-version',
        message:
          '이 백업 파일은 더 새로운 버전의 쌤핀에서 만들어졌어요. 쌤핀을 업데이트한 뒤 다시 시도해 주세요.',
      },
    };
  }

  // data 검사 — { [filename]: object } 형태인지
  const dataUnknown = obj['data'];
  if (
    dataUnknown === null ||
    typeof dataUnknown !== 'object' ||
    Array.isArray(dataUnknown)
  ) {
    return {
      ok: false,
      error: {
        code: 'invalid-structure',
        message: '백업 파일 형식이 올바르지 않아요. (data 누락)',
      },
    };
  }
  const dataObj = dataUnknown as Record<string, unknown>;
  const keys = Object.keys(dataObj);
  if (keys.length === 0) {
    return {
      ok: false,
      error: {
        code: 'empty-data',
        message: '백업 파일에 복원할 데이터가 없어요.',
      },
    };
  }
  for (const key of keys) {
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

  return {
    ok: true,
    backup: {
      metadata: {
        schemaVersion,
        appVersion,
        exportedAt,
        platform: normalizePlatform(platform),
        entryCount,
      },
      data: dataObj,
    },
  };
}

function normalizePlatform(p: string): BackupPlatform {
  if (p === 'win32' || p === 'darwin' || p === 'linux' || p === 'browser') {
    return p;
  }
  return 'unknown';
}

/**
 * 단일 백업 파일에서 실제로 복원해도 안전한 슬롯만 추린다.
 * 현재 환경에서 동작 중인 widget-bounds / icon-bounds 같은 파일이 백업에 섞여 들어왔어도
 * 무시하여 사용자의 화면 위치가 망가지지 않게 한다.
 */
export function selectRestoreCandidates(
  backupFilenames: readonly string[],
): readonly string[] {
  return selectBackupCandidates(backupFilenames.map((n) => `${n}.json`));
}

/** 사용자가 보기 좋은 기본 파일명을 만든다. ISO 시각의 콜론을 제거한 형태. */
export function buildDefaultBackupFilename(nowIso: string): string {
  // "2026-05-04T12:34:56.789Z" → "ssampin-backup-20260504-123456.ssampin-backup.json"
  // 밀리초/타임존 부호 모두 떼낸다.
  const compact = nowIso
    .replace(/\.\d+Z$/, '')
    .replace(/Z$/, '')
    .replace(/[:\-]/g, '')
    .replace('T', '-');
  return `ssampin-backup-${compact}.ssampin-backup.json`;
}
