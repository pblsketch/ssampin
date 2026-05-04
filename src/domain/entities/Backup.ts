/**
 * 백업 파일 엔티티 — 사용자가 직접 보관/이메일/USB로 옮길 수 있는 단일 JSON 묶음.
 *
 * 외부 의존성 0. domain 레이어 규칙(외부 import 금지)을 지킨다.
 *
 * 파일은 `.ssampin-backup.json` 확장자로 저장되며 구조는 다음과 같다:
 *
 *   {
 *     "metadata": { ... BackupMetadata },
 *     "data": { [filename: string]: unknown }
 *   }
 *
 * 한 데이터 슬롯(filename)은 `userData/data/{filename}.json`의 파싱된 내용 하나에 대응한다.
 * 바이너리(이모티콘 PNG, 서식 PDF 등)와 보안 저장소(토큰/비밀번호)는 MVP에서 제외한다.
 */

/** 현재 백업 포맷 버전. 호환되지 않는 구조 변경 시 +1 한다. */
export const CURRENT_BACKUP_SCHEMA_VERSION = 1 as const;

export type BackupPlatform = 'win32' | 'darwin' | 'linux' | 'browser' | 'unknown';

export interface BackupMetadata {
  /** 본 파일 포맷 버전 (CURRENT_BACKUP_SCHEMA_VERSION 참조) */
  readonly schemaVersion: number;
  /** 백업을 만든 쌤핀 앱 버전 (package.json version) */
  readonly appVersion: string;
  /** 백업 생성 시각 ISO-8601 */
  readonly exportedAt: string;
  /** 생성 OS 플랫폼 */
  readonly platform: BackupPlatform;
  /** 본 백업에 포함된 데이터 슬롯(filename) 개수 */
  readonly entryCount: number;
}

export interface BackupFile {
  readonly metadata: BackupMetadata;
  /** filename → 해당 JSON 파일의 파싱된 객체. */
  readonly data: Readonly<Record<string, unknown>>;
}

/** 사용자가 백업 파일을 가져올 때 발생할 수 있는 에러 분류 (UI에 그대로 표시 가능). */
export type BackupParseErrorCode =
  | 'invalid-json'
  | 'invalid-structure'
  | 'unsupported-future-version'
  | 'empty-data';

export interface BackupParseError {
  readonly code: BackupParseErrorCode;
  /** 한국어 메시지 — UI 토스트/모달에 그대로 사용 */
  readonly message: string;
}
