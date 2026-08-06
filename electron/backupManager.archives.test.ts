/**
 * backupManager S2.1b 하위 호환 테스트 — 백업 최상위 `archives` 추가 키가
 * 기존 구조 검증(validateBackupShape)에 의해 거부되지 않는지 "실측을 테스트로 고정"한다.
 * (계획 S2.1b AC-3·AC-4 — 스키마 버전 유지 + 추가 키 방식의 전제.)
 *
 * exportBackup/importBackup 자체는 dialog 의존이라 여기서 실행하지 않는다 —
 * 아카이브 수집/복원의 실동작은 archiveManager.test.ts가 실제 fs로 검증한다.
 */
import { describe, expect, test, vi } from 'vitest';

// backupManager는 모듈 상단에서 electron을 import한다 — vitest node 환경용 스텁.
// 본 테스트는 순수 함수(validateBackupShape)만 호출하므로 스텁 내용은 사용되지 않는다.
vi.mock('electron', () => ({
  app: { getPath: () => '', getVersion: () => '0.0.0-test' },
  BrowserWindow: class {},
  dialog: {},
  shell: {},
}));

import { validateBackupShape } from './backupManager';

const METADATA = {
  schemaVersion: 1,
  appVersion: '2.2.13',
  exportedAt: '2026-08-06T00:00:00.000Z',
  platform: 'win32',
  entryCount: 1,
};

describe('validateBackupShape — archives 추가 키 하위 호환 (S2.1b)', () => {
  test('구버전 백업(archives 없음)이 그대로 통과한다 (AC-3)', () => {
    const result = validateBackupShape({
      metadata: METADATA,
      data: { students: { students: [] } },
    });
    expect(result.ok).toBe(true);
  });

  test('실측 고정: 최상위 archives 추가 키를 거부하지 않는다 (AC-4)', () => {
    // validateBackupShape는 metadata·data만 읽는다 — 여기에 "알 수 없는 최상위 키 거부"를
    // 추가하면 이 테스트가 빨간불이 되어 S2.1b 전제 붕괴를 즉시 알린다.
    const result = validateBackupShape({
      metadata: METADATA,
      data: { students: { students: [] } },
      archives: {
        '2026-1': { 'students.json': { format: 'utf8', content: '{"students":[]}' } },
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // data 파싱 결과에 archives가 섞여 들어가지 않는다(복원 대상 슬롯은 data만).
      expect(Object.keys(result.data)).toEqual(['students']);
    }
  });

  test('스키마 버전은 그대로 1 — 미래 버전은 여전히 하드 거부된다(동작 무변경 확인)', () => {
    const result = validateBackupShape({
      metadata: { ...METADATA, schemaVersion: 2 },
      data: { students: {} },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('unsupported-future-version');
  });
});
