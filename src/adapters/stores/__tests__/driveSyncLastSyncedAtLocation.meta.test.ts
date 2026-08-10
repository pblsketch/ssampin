/**
 * driveSyncLastSyncedAtLocation.meta.test.ts — "마지막 동기화 시각"의 거처 메타 가드 (ADR-040)
 *
 * v2.3.4까지 이 값은 **동기화 대상 파일인 settings 안**(`sync.lastSyncedAt`)에 있었다.
 * 동기화가 끝날 때마다 그 값을 갱신했으므로 동기화 대상 파일이 매번 바뀌었고, 그 결과
 *   ① settings가 매 주기 무조건 업로드(내용이 늘 달라짐)
 *   ② 기기 A·B가 서로의 시각으로 settings를 덮는 LWW 핑퐁
 *   ③ 장부 확정 *이후*의 쓰기라 다음 다운로드가 "충돌"로 오해 → 무한 반복(ADR-039)
 * 이 셋은 모두 **한 줄의 재기록**에서 나왔다. 되돌아가는 것을 이 파일이 막는다.
 *
 * 되돌리고 싶다면: 단언을 고치지 말고, 먼저 위 ①②③이 왜 재발하지 않는지 증명할 것.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SYNC_FILES } from '@usecases/sync/syncRegistry';
import { DRIVE_SYNC_DEVICE_STATE_KEY } from '@adapters/repositories/driveSyncDeviceState';

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');

function readSource(relPath: string): string {
  return readFileSync(resolve(REPO_ROOT, relPath), 'utf-8');
}

describe('마지막 동기화 시각은 기기 전용 저장소에만 산다 (ADR-040)', () => {
  it('기기 전용 키는 동기화 대상(SYNC_FILES)에 등재되어 있지 않다', () => {
    expect(SYNC_FILES).not.toContain(DRIVE_SYNC_DEVICE_STATE_KEY);
  });

  it('useDriveSyncStore가 settings.sync.lastSyncedAt에 다시 쓰지 않는다', () => {
    const source = readSource('src/adapters/stores/useDriveSyncStore.ts');

    // 동기화 완료 후 settings를 갱신하던 옛 패턴 — 어떤 형태로도 부활 금지.
    expect(source).not.toMatch(/update\(\s*\{\s*\n?\s*sync:\s*\{\s*\.\.\.sync,\s*lastSyncedAt/);
    // `sync: { ... lastSyncedAt: ... }` 형태의 settings 쓰기가 한 건도 없어야 한다.
    expect(source).not.toMatch(/sync:\s*\{[^}]*lastSyncedAt\s*:/);

    // 대신 기기 전용 저장 함수를 쓴다(정방향 강제 — 저장 자체가 사라지는 것도 막는다).
    expect(source).toContain('saveDriveSyncLastSyncedAt(');
  });

  it('동기화 완료 경로(업로드·다운로드) 양쪽 모두 기기 전용 저장소에 기록한다', () => {
    const source = readSource('src/adapters/stores/useDriveSyncStore.ts');
    const writes = source.match(/await saveDriveSyncLastSyncedAt\(/g) ?? [];
    expect(writes.length).toBeGreaterThanOrEqual(2);
  });

  it('업데이트 직후에도 표시가 끊기지 않도록 레거시 값을 승계하는 경로가 있다', () => {
    const source = readSource('src/adapters/stores/useDriveSyncStore.ts');
    expect(source).toContain('hydrateLastSyncedAt');
    expect(source).toMatch(/settings\.sync\?\.lastSyncedAt/); // 레거시 읽기(승계용)는 남아 있어야 한다
  });
});
