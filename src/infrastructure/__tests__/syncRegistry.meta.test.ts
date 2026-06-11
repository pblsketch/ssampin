/**
 * 메타 테스트 — syncRegistry.ts에 v1 백업 경로 포함 금지.
 *
 * 배경 (Design §6 #1):
 *   v2.1.0 마이그레이션에서 GDrive 동기화 레지스트리에 `.ssampin/backup/v1/` 경로가
 *   실수로 포함되면, 백업 디렉터리 전체가 Drive에 업로드되어 사용자 Drive 용량을
 *   과도하게 소비하고 sync 충돌을 일으킬 수 있다.
 *
 *   이 테스트는 syncRegistry.ts 소스 텍스트를 정적으로 읽어 해당 패턴의 부재를 강제한다.
 *
 * 검증 방식:
 *   소스 파일을 문자열로 읽어 `.ssampin/backup/v1/` 또는 `backup/v1` 패턴이
 *   없는지 확인한다. 패턴 발견 시 즉시 실패하여 회귀를 차단한다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');

const SYNC_REGISTRY_PATH = resolve(ROOT, 'src/usecases/sync/syncRegistry.ts');

function readSyncRegistry(): string {
  return readFileSync(SYNC_REGISTRY_PATH, 'utf-8');
}

describe('syncRegistry.ts v1 백업 경로 제외 보장', () => {
  it('syncRegistry must NOT include .ssampin/backup/v1/', () => {
    const src = readSyncRegistry();

    // .ssampin/backup/v1/ 리터럴 패턴
    const hasLiteralPath = src.includes('.ssampin/backup/v1/');
    expect(
      hasLiteralPath,
      'syncRegistry.ts에 ".ssampin/backup/v1/" 경로가 포함되어 있습니다. ' +
        'v1 백업 디렉터리가 GDrive 동기화 대상에 포함되면 Drive 용량 낭비 및 sync 충돌이 발생합니다. ' +
        '백업 경로를 동기화 레지스트리에서 제거하세요.',
    ).toBe(false);

    // backup/v1 일반 패턴 (경로 구분자 변형 포함)
    const hasBackupV1Pattern = /backup[/\\]v1/.test(src);
    expect(
      hasBackupV1Pattern,
      'syncRegistry.ts에 "backup/v1" 경로 패턴이 포함되어 있습니다. ' +
        'v1 백업 디렉터리는 동기화 레지스트리에 포함되어서는 안 됩니다.',
    ).toBe(false);
  });
});
