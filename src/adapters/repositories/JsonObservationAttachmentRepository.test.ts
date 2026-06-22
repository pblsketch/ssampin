import { describe, it, expect, beforeEach } from 'vitest';
import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { ObservationAttachment } from '@domain/entities/ObservationAttachment';
import { JsonObservationAttachmentRepository } from './JsonObservationAttachmentRepository';

/** 테스트용 in-memory IStoragePort. JSON 과 바이너리를 분리 보관한다. */
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
    createdAt: '2026-06-22T00:00:00.000Z',
    ...over,
  };
}

describe('JsonObservationAttachmentRepository', () => {
  let storage: ReturnType<typeof makeMemoryStorage>;
  let repo: JsonObservationAttachmentRepository;

  beforeEach(() => {
    storage = makeMemoryStorage();
    repo = new JsonObservationAttachmentRepository(storage);
  });

  it('create 는 메타 JSON 과 바이너리를 분리 저장한다', async () => {
    const att = makeAttachment();
    const bytes = new Uint8Array([1, 2, 3]);
    await repo.create(att, bytes);

    const list = await repo.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual(att);
    // 바이너리는 별도 스토어에
    expect(storage.bin.get(att.storageRef)).toEqual(bytes);
    // 메타 JSON 에는 바이너리(dataURL/base64)가 들어가지 않는다
    expect(JSON.stringify(storage.json.get('observation-attachments'))).not.toContain('data:');
  });

  it('같은 id 로 create 하면 교체(업서트)된다', async () => {
    await repo.create(makeAttachment(), new Uint8Array([1]));
    await repo.create(makeAttachment({ fileName: 'replaced.png' }), new Uint8Array([9]));
    const list = await repo.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.fileName).toBe('replaced.png');
  });

  it('readFile 은 저장된 바이너리를 돌려준다', async () => {
    const bytes = new Uint8Array([4, 5, 6]);
    await repo.create(makeAttachment(), bytes);
    expect(await repo.readFile('att-1')).toEqual(bytes);
    expect(await repo.readFile('nope')).toBeNull();
  });

  it('delete 는 메타와 바이너리를 함께 지운다', async () => {
    const att = makeAttachment();
    await repo.create(att, new Uint8Array([1]));
    await repo.delete('att-1');
    expect(await repo.list()).toHaveLength(0);
    expect(storage.bin.has(att.storageRef)).toBe(false);
  });

  it('deleteByObservationId 는 해당 관찰의 첨부만 제거한다', async () => {
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

    const list = await repo.list();
    expect(list.map((a) => a.id)).toEqual(['c']);
    expect(storage.bin.has('obs-attachments/a.png')).toBe(false);
    expect(storage.bin.has('obs-attachments/b.png')).toBe(false);
    expect(storage.bin.has('obs-attachments/c.png')).toBe(true);
  });

  it('빈 저장소에서 list 는 빈 배열', async () => {
    expect(await repo.list()).toEqual([]);
  });
});
