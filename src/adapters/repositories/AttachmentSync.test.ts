/**
 * S2 — 관찰 첨부(ObservationAttachment) Google Drive 동기화 테스트
 *
 * 설계서: docs/02-design/features/record-system-unification-phase1.design.md §3.2, §4-다, §9.3-3
 *
 * IT-2: 첨부 메타+바이너리 동기화 roundtrip (메타↔바이너리 개수 정합 + 교차기기 삭제 cascade)
 * IT-4: syncRegistry ↔ STORE_SUBSCRIBE_MAP 정합 (observation-attachments 엔트리 포함 GREEN)
 * UT-4: listBinaryKeys / listBinary('obs-attachments') 키 열거 정확성
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { ObservationAttachment } from '@domain/entities/ObservationAttachment';
import { JsonObservationAttachmentRepository } from '@adapters/repositories/JsonObservationAttachmentRepository';
import { SYNC_REGISTRY } from '@usecases/sync/syncRegistry';

// ─────────────────────────── 공용 in-memory 스토리지 헬퍼 ───────────────────────────

function makeMemoryStorage(): IStoragePort & {
  readonly json: Map<string, unknown>;
  readonly bin: Map<string, Uint8Array>;
} {
  const json = new Map<string, unknown>();
  const bin = new Map<string, Uint8Array>();
  return {
    json,
    bin,
    read: async <T>(filename: string) => (json.has(filename) ? (json.get(filename) as T) : null),
    write: async <T>(filename: string, data: T) => {
      json.set(filename, data);
    },
    remove: async (filename: string) => {
      json.delete(filename);
    },
    readBinary: async (relPath: string) => bin.get(relPath) ?? null,
    writeBinary: async (relPath: string, bytes: Uint8Array) => {
      bin.set(relPath, bytes);
    },
    removeBinary: async (relPath: string) => {
      bin.delete(relPath);
    },
    listBinary: async (dirRelPath: string) => {
      const prefix = dirRelPath.endsWith('/') ? dirRelPath : `${dirRelPath}/`;
      return [...bin.keys()]
        .filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
        .map((k) => k.slice(prefix.length));
    },
  };
}

function makeAttachment(over: Partial<ObservationAttachment> = {}): ObservationAttachment {
  return {
    id: 'att-1',
    observationId: 'obs-1',
    fileName: 'photo.png',
    mimeType: 'image/png',
    kind: 'image',
    byteSize: 3,
    storageRef: 'obs-attachments/att-1.png',
    source: 'teacher',
    createdAt: '2026-06-23T00:00:00.000Z',
    ...over,
  };
}

// ─────────────────────────── UT-4: listBinaryKeys 키 열거 정확성 ───────────────────────────

describe('UT-4 — JsonObservationAttachmentRepository.listBinaryKeys()', () => {
  let storage: ReturnType<typeof makeMemoryStorage>;
  let repo: JsonObservationAttachmentRepository;

  beforeEach(() => {
    storage = makeMemoryStorage();
    repo = new JsonObservationAttachmentRepository(storage);
  });

  it('빈 저장소에서 listBinaryKeys는 빈 배열을 반환한다', async () => {
    expect(await repo.listBinaryKeys()).toEqual([]);
  });

  it('create 후 listBinaryKeys는 storageRef 목록을 반환한다', async () => {
    await repo.create(
      makeAttachment({ id: 'a', storageRef: 'obs-attachments/a.png' }),
      new Uint8Array([1]),
    );
    await repo.create(
      makeAttachment({ id: 'b', storageRef: 'obs-attachments/b.jpg' }),
      new Uint8Array([2]),
    );

    const keys = await repo.listBinaryKeys();
    expect(keys).toHaveLength(2);
    expect(keys).toContain('obs-attachments/a.png');
    expect(keys).toContain('obs-attachments/b.jpg');
  });

  it('delete 후 해당 storageRef가 listBinaryKeys에서 제외된다', async () => {
    await repo.create(
      makeAttachment({ id: 'a', storageRef: 'obs-attachments/a.png' }),
      new Uint8Array([1]),
    );
    await repo.create(
      makeAttachment({ id: 'b', storageRef: 'obs-attachments/b.png' }),
      new Uint8Array([2]),
    );
    await repo.delete('a');

    const keys = await repo.listBinaryKeys();
    expect(keys).toHaveLength(1);
    expect(keys).toContain('obs-attachments/b.png');
    expect(keys).not.toContain('obs-attachments/a.png');
  });

  it('listBinaryKeys는 메타 기반이므로 listBinary와 개수가 항상 일치한다', async () => {
    await repo.create(
      makeAttachment({ id: 'x', storageRef: 'obs-attachments/x.png' }),
      new Uint8Array([1]),
    );
    await repo.create(
      makeAttachment({ id: 'y', storageRef: 'obs-attachments/y.png' }),
      new Uint8Array([2]),
    );

    const metaKeys = await repo.listBinaryKeys();
    const binFiles = await storage.listBinary('obs-attachments');
    expect(metaKeys.length).toBe(binFiles.length);
  });

  it('deleteByObservationId 후 해당 관찰의 storageRef가 listBinaryKeys에서 제외된다', async () => {
    await repo.create(
      makeAttachment({ id: 'a', observationId: 'obs-1', storageRef: 'obs-attachments/a.png' }),
      new Uint8Array([1]),
    );
    await repo.create(
      makeAttachment({ id: 'b', observationId: 'obs-1', storageRef: 'obs-attachments/b.png' }),
      new Uint8Array([2]),
    );
    await repo.create(
      makeAttachment({ id: 'c', observationId: 'obs-2', storageRef: 'obs-attachments/c.png' }),
      new Uint8Array([3]),
    );

    await repo.deleteByObservationId('obs-1');

    const keys = await repo.listBinaryKeys();
    expect(keys).toHaveLength(1);
    expect(keys).toContain('obs-attachments/c.png');
    expect(keys).not.toContain('obs-attachments/a.png');
    expect(keys).not.toContain('obs-attachments/b.png');
  });
});

// ─────────────────────────── IT-2: 첨부 메타+바이너리 동기화 roundtrip ───────────────────────────

/**
 * IT-2 근거: 설계서 §3.2, §9.3-3
 *
 * 검증 항목:
 *   A. 메타↔바이너리 개수 정합 (roundtrip 후)
 *   B. A 기기에서 삭제 → B 기기 동기화 후 메타·바이너리 동시 부재 단언 (교차기기 삭제 cascade)
 *   C. 메타 JSON에 base64 절대 없음 (불가침)
 */
describe('IT-2 — 첨부 메타+바이너리 동기화 roundtrip', () => {
  let storage: ReturnType<typeof makeMemoryStorage>;
  let repo: JsonObservationAttachmentRepository;

  beforeEach(() => {
    storage = makeMemoryStorage();
    repo = new JsonObservationAttachmentRepository(storage);
  });

  it('IT-2-A: create 후 메타와 바이너리 개수가 일치한다 (roundtrip 정합)', async () => {
    await repo.create(
      makeAttachment({ id: 'a', storageRef: 'obs-attachments/a.png' }),
      new Uint8Array([0xff, 0xd8, 0xff]),
    );
    await repo.create(
      makeAttachment({ id: 'b', storageRef: 'obs-attachments/b.jpg', observationId: 'obs-2' }),
      new Uint8Array([0x89, 0x50, 0x4e]),
    );

    const metaCount = (await repo.list()).length;
    const binCount = (await storage.listBinary('obs-attachments')).length;
    const keyCount = (await repo.listBinaryKeys()).length;

    expect(metaCount).toBe(2);
    expect(binCount).toBe(2);
    expect(keyCount).toBe(2);
  });

  it('IT-2-B: A 기기에서 삭제(deleteByObservationId) → 메타·바이너리 동시 부재 (교차기기 cascade 시뮬레이션)', async () => {
    // 기기 A: 첨부 2건 생성
    await repo.create(
      makeAttachment({ id: 'a1', observationId: 'obs-del', storageRef: 'obs-attachments/a1.png' }),
      new Uint8Array([1]),
    );
    await repo.create(
      makeAttachment({ id: 'a2', observationId: 'obs-del', storageRef: 'obs-attachments/a2.png' }),
      new Uint8Array([2]),
    );
    // 다른 관찰의 첨부 (보존 확인용)
    await repo.create(
      makeAttachment({
        id: 'keep',
        observationId: 'obs-keep',
        storageRef: 'obs-attachments/keep.png',
      }),
      new Uint8Array([3]),
    );

    // 기기 A: obs-del 삭제 (관찰 삭제 cascade)
    await repo.deleteByObservationId('obs-del');

    // 동기화 완료 후 기기 B 상태 확인:
    // 메타에 obs-del 첨부 없음
    const remaining = await repo.list();
    expect(remaining.map((a) => a.observationId)).not.toContain('obs-del');
    expect(remaining.map((a) => a.id)).toEqual(['keep']);

    // 바이너리도 동시 부재
    expect(storage.bin.has('obs-attachments/a1.png')).toBe(false);
    expect(storage.bin.has('obs-attachments/a2.png')).toBe(false);

    // 보존 대상은 유지
    expect(storage.bin.has('obs-attachments/keep.png')).toBe(true);

    // listBinaryKeys에서도 제외
    const keys = await repo.listBinaryKeys();
    expect(keys).toEqual(['obs-attachments/keep.png']);
  });

  it('IT-2-C: 메타 JSON에 base64/dataURL이 포함되지 않는다 (바이너리 분리 불변)', async () => {
    await repo.create(
      makeAttachment({ id: 'img', storageRef: 'obs-attachments/img.png' }),
      new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
    );

    const rawJson = JSON.stringify(storage.json.get('observation-attachments'));
    expect(rawJson).not.toContain('data:');
    expect(rawJson).not.toContain('base64');
    // storageRef 경로는 메타에 있어야 한다
    expect(rawJson).toContain('obs-attachments/img.png');
  });
});

// ─────────────────────────── IT-4: syncRegistry ↔ STORE_SUBSCRIBE_MAP 정합 ───────────────────────────

/**
 * IT-4 근거: 설계서 §3.2
 *
 * observation-attachments(#29)와 obs-attachment-binary(#30) 엔트리가 추가된 후에도
 * SyncSubscribers.test.ts의 (b) 검사와 동일한 방식으로 정합성을 확인한다.
 */
describe('IT-4 — syncRegistry ↔ STORE_SUBSCRIBE_MAP 정합 (observation-attachments 포함)', () => {
  it('observation-attachments 엔트리가 SYNC_REGISTRY에 존재한다', () => {
    const domain = SYNC_REGISTRY.find((d) => d.fileName === 'observation-attachments');
    expect(domain, 'observation-attachments가 SYNC_REGISTRY에 없음').toBeDefined();
    expect(domain!.subscribeExcluded).toBeFalsy(); // 구독 대상이어야 함
    expect(domain!.isDynamic).toBeFalsy(); // 정적 파일
    expect(typeof domain!.reload).toBe('function');
  });

  it('obs-attachment-binary 엔트리가 SYNC_REGISTRY에 존재하며 isDynamic:true이다', () => {
    const domain = SYNC_REGISTRY.find((d) => d.fileName === 'obs-attachment-binary');
    expect(domain, 'obs-attachment-binary가 SYNC_REGISTRY에 없음').toBeDefined();
    expect(domain!.isDynamic).toBe(true);
    expect(domain!.subscribeExcluded).toBe(true); // 메타가 대표 구독 키
    expect(typeof domain!.enumerateDynamic).toBe('function');
    expect(typeof domain!.reload).toBe('function');
  });

  it('observation-attachments가 App.tsx STORE_SUBSCRIBE_MAP에 등재되어 있다', () => {
    const appPath = resolve(__dirname, '../../App.tsx');
    const appSource = readFileSync(appPath, 'utf8');

    const startMarker = 'STORE_SUBSCRIBE_MAP';
    const startIdx = appSource.indexOf(startMarker);
    expect(startIdx, 'App.tsx에서 STORE_SUBSCRIBE_MAP을 찾지 못함').toBeGreaterThan(-1);

    const endMarker = '};';
    const endIdx = appSource.indexOf(endMarker, startIdx);
    const block = appSource.slice(startIdx, endIdx);

    const fn = 'observation-attachments';
    const present =
      block.includes(`'${fn}'`) ||
      block.includes(`"${fn}"`) ||
      new RegExp(`(?:^|[\\s{,(])${fn}\\s*:`, 'm').test(block);

    expect(
      present,
      `'${fn}'이 App.tsx STORE_SUBSCRIBE_MAP에 없습니다. STORE_SUBSCRIBE_MAP에 useObservationAttachmentStore 구독을 추가하세요.`,
    ).toBe(true);
  });

  it('obs-attachment-binary는 isDynamic:true이므로 STORE_SUBSCRIBE_MAP 등재 불필요하다', () => {
    const domain = SYNC_REGISTRY.find((d) => d.fileName === 'obs-attachment-binary');
    expect(domain!.isDynamic).toBe(true);
    // isDynamic은 App.tsx의 `if (d.subscribeExcluded || d.isDynamic) continue;` 로 자동 제외됨
  });

  it('SYNC_REGISTRY에 중복 fileName이 없다 (신규 엔트리 추가 후 검증)', () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const d of SYNC_REGISTRY) {
      if (seen.has(d.fileName)) duplicates.push(d.fileName);
      seen.add(d.fileName);
    }
    expect(duplicates, `중복 fileName: ${duplicates.join(', ')}`).toEqual([]);
  });
});
