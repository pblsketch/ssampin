import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AtomicJsonFileStore } from './AtomicJsonFileStore';

/**
 * migrateStudentPiiV1.crash.test — Critic C#7 acceptance:
 * 'kill between write and rename leaves no corrupt state on next boot'
 *
 * (테스트는 AtomicJsonFileStore의 crash-recovery 동작을 검증하며, 이 동작이
 *  migrateStudentPiiV1의 토대를 형성한다.)
 */

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ssampin-pii-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('AtomicJsonFileStore — crash recovery (migrateStudentPiiV1 토대)', () => {
  it('first write creates target file', async () => {
    const filePath = path.join(tmpDir, 'pii.json');
    const store = new AtomicJsonFileStore<{ v: number }>(filePath);

    await store.write({ v: 1 });
    expect(await store.exists()).toBe(true);
    expect(await store.read()).toEqual({ v: 1 });
  });

  it('second write moves previous to .bak (atomic replace)', async () => {
    const filePath = path.join(tmpDir, 'pii.json');
    const store = new AtomicJsonFileStore<{ v: number }>(filePath);
    await store.write({ v: 1 });
    await store.write({ v: 2 });

    expect(await store.read()).toEqual({ v: 2 });
    // .bak에는 이전 v=1 보존
    const bakRaw = await fs.readFile(`${filePath}.bak`, 'utf8');
    expect(JSON.parse(bakRaw)).toEqual({ v: 1 });
  });

  it('simulated kill BETWEEN tmp-write AND rename leaves .tmp + previous target intact', async () => {
    const filePath = path.join(tmpDir, 'pii.json');
    const store = new AtomicJsonFileStore<{ v: number }>(filePath);
    await store.write({ v: 1 });

    // crash 시뮬레이션: tmp에 쓰기만 하고 rename 안 함
    const fh = await fs.open(store.tmpPath, 'w');
    try {
      await fh.writeFile(JSON.stringify({ v: 2 }), 'utf8');
      await fh.sync();
    } finally {
      await fh.close();
    }
    // (이제 프로세스 kill — rename 미수행)

    // 다음 부팅: target은 v=1 여전히 살아있어야 함
    expect(await store.read()).toEqual({ v: 1 });
    // .tmp는 존재
    expect(await store.hasTmp()).toBe(true);
    // 손상 감지: target은 살아있지만 .tmp가 있으므로 healthy로 분류 (target 우선)
    const c = await store.detectCorruption();
    expect(c.corrupt).toBe(false); // target이 healthy하면 .tmp 잔재는 cleanup 대상이지 corrupt 아님
    expect(c.hasTmp).toBe(true);
  });

  it('target missing + .bak only → detectCorruption returns corrupt', async () => {
    const filePath = path.join(tmpDir, 'pii.json');
    const store = new AtomicJsonFileStore<{ v: number }>(filePath);
    // .bak만 수동으로 둠 (예: rename 직후 target 즉시 삭제된 시나리오)
    await fs.writeFile(`${filePath}.bak`, JSON.stringify({ v: 1 }), 'utf8');

    const c = await store.detectCorruption();
    expect(c.corrupt).toBe(true);
    expect(c.reason).toBe('target-missing-with-trace');
    expect(c.hasBak).toBe(true);
  });

  it('restoreFromBak() promotes .bak back to target', async () => {
    const filePath = path.join(tmpDir, 'pii.json');
    const store = new AtomicJsonFileStore<{ v: number }>(filePath);
    await fs.writeFile(`${filePath}.bak`, JSON.stringify({ v: 'restored' }), 'utf8');

    const ok = await store.restoreFromBak();
    expect(ok).toBe(true);
    expect(await store.read()).toEqual({ v: 'restored' });
  });

  it('corrupt target (invalid JSON) detected as parse-failed', async () => {
    const filePath = path.join(tmpDir, 'pii.json');
    const store = new AtomicJsonFileStore<{ v: number }>(filePath);
    await fs.writeFile(filePath, 'NOT_VALID_JSON{', 'utf8');

    const c = await store.detectCorruption();
    expect(c.corrupt).toBe(true);
    expect(c.reason).toBe('parse-failed');
  });

  it('wipeAll removes target + .bak + .tmp', async () => {
    const filePath = path.join(tmpDir, 'pii.json');
    const store = new AtomicJsonFileStore<{ v: number }>(filePath);
    await store.write({ v: 1 });
    await store.write({ v: 2 }); // .bak 생성
    await fs.writeFile(store.tmpPath, 'tmp', 'utf8');

    await store.wipeAll();
    expect(await store.exists()).toBe(false);
    expect(await store.hasBak()).toBe(false);
    expect(await store.hasTmp()).toBe(false);
  });
});
