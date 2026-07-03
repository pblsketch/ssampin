import { describe, it, expect, beforeEach } from 'vitest';
import type { IMiniAppRepository } from '@domain/repositories/IMiniAppRepository';
import type { MiniApp } from '@domain/entities/MiniApp';
import { MINIAPP_HTML_MAX_BYTES, MINIAPP_MAX_COUNT } from '@domain/entities/MiniApp';
import { registerMiniApp } from './RegisterMiniApp';

class MockMiniAppRepository implements IMiniAppRepository {
  saveCalls: Array<{ id: string; bytes: Uint8Array }> = [];
  saveIconCalls: Array<{ id: string; bytes: Uint8Array; ext: string }> = [];
  removedIds: string[] = [];

  async save(id: string, htmlBytes: Uint8Array): Promise<void> {
    this.saveCalls.push({ id, bytes: htmlBytes });
  }
  async saveIcon(id: string, bytes: Uint8Array, ext: string): Promise<string> {
    this.saveIconCalls.push({ id, bytes, ext });
    return `icon.${ext}`;
  }
  async remove(id: string): Promise<void> {
    this.removedIds.push(id);
  }
  async list(): Promise<readonly string[]> {
    return [];
  }
}

function makeExisting(order: number, id = `id-${order}`): MiniApp {
  return {
    id,
    name: `앱${order}`,
    description: '',
    icon: { kind: 'emoji', value: '🧩' },
    createdAt: order,
    order,
  };
}

describe('registerMiniApp', () => {
  let repo: MockMiniAppRepository;
  let generateId: () => string;

  beforeEach(() => {
    repo = new MockMiniAppRepository();
    let n = 0;
    generateId = () => `gen-${n++}`;
  });

  it('유효한 입력이면 HTML을 저장하고 배열 끝에 추가한다', async () => {
    const htmlBytes = new Uint8Array([1, 2, 3]);
    const next = await registerMiniApp(
      { repo, generateId },
      {
        name: '내 룰렛',
        description: '반 뽑기 앱',
        icon: { kind: 'emoji', value: '🎲' },
        htmlBytes,
      },
      [],
    );

    expect(next).toHaveLength(1);
    expect(next[0]!.name).toBe('내 룰렛');
    expect(next[0]!.description).toBe('반 뽑기 앱');
    expect(next[0]!.icon).toEqual({ kind: 'emoji', value: '🎲' });
    expect(next[0]!.order).toBe(0);
    expect(typeof next[0]!.id).toBe('string');
    expect(next[0]!.id.length).toBeGreaterThan(0);

    expect(repo.saveCalls).toHaveLength(1);
    expect(repo.saveCalls[0]!.bytes).toBe(htmlBytes);
    expect(repo.saveCalls[0]!.id).toBe(next[0]!.id);
    expect(repo.saveIconCalls).toHaveLength(0);
  });

  it('이미지 아이콘 + iconBytes면 saveIcon을 호출하고 저장된 파일명으로 교체한다', async () => {
    const htmlBytes = new Uint8Array([1]);
    const iconBytes = new Uint8Array([9, 9]);
    const next = await registerMiniApp(
      { repo, generateId },
      {
        name: '그림판',
        description: '',
        icon: { kind: 'image', fileName: 'original.png' }, // 검증 통과용 임시 fileName
        htmlBytes,
        iconBytes,
        iconExt: 'png',
      },
      [],
    );

    expect(repo.saveIconCalls).toHaveLength(1);
    expect(repo.saveIconCalls[0]!.bytes).toBe(iconBytes);
    expect(repo.saveIconCalls[0]!.ext).toBe('png');
    expect(repo.saveIconCalls[0]!.id).toBe(next[0]!.id);
    // usecase가 saveIcon 반환값으로 fileName을 덮어써야 한다 (원본 파일명이 아님)
    expect(next[0]!.icon).toEqual({ kind: 'image', fileName: 'icon.png' });
  });

  it('기존 목록 뒤에 order를 이어붙인다(빈 배열은 아님)', async () => {
    const existing: MiniApp[] = [makeExisting(0, 'a'), makeExisting(3, 'b')];
    const next = await registerMiniApp(
      { repo, generateId },
      {
        name: 'C',
        description: '',
        icon: { kind: 'emoji', value: '🥎' },
        htmlBytes: new Uint8Array([1]),
      },
      existing,
    );
    expect(next).toHaveLength(3);
    expect(next[2]!.order).toBe(4);
    // 기존 항목은 그대로 보존
    expect(next[0]).toEqual(existing[0]);
    expect(next[1]).toEqual(existing[1]);
  });

  it('개수 상한(MINIAPP_MAX_COUNT)을 초과하면 throw하고 저장을 시도하지 않는다', async () => {
    const existing: MiniApp[] = Array.from({ length: MINIAPP_MAX_COUNT }, (_, i) =>
      makeExisting(i),
    );

    await expect(
      registerMiniApp(
        { repo, generateId },
        {
          name: '초과분',
          description: '',
          icon: { kind: 'emoji', value: '🧩' },
          htmlBytes: new Uint8Array([1]),
        },
        existing,
      ),
    ).rejects.toThrow();
    expect(repo.saveCalls).toHaveLength(0);
  });

  it('HTML 크기가 상한(MINIAPP_HTML_MAX_BYTES)을 초과하면 throw하고 저장을 시도하지 않는다', async () => {
    const oversized = new Uint8Array(MINIAPP_HTML_MAX_BYTES + 1);
    await expect(
      registerMiniApp(
        { repo, generateId },
        { name: '앱', description: '', icon: { kind: 'emoji', value: '🧩' }, htmlBytes: oversized },
        [],
      ),
    ).rejects.toThrow();
    expect(repo.saveCalls).toHaveLength(0);
  });

  it('이름이 비어있으면(유효성 실패) throw하고 저장을 시도하지 않는다', async () => {
    await expect(
      registerMiniApp(
        { repo, generateId },
        {
          name: '   ',
          description: '',
          icon: { kind: 'emoji', value: '🧩' },
          htmlBytes: new Uint8Array([1]),
        },
        [],
      ),
    ).rejects.toThrow();
    expect(repo.saveCalls).toHaveLength(0);
  });

  it('아이콘이 유효하지 않으면(유효성 실패) throw하고 저장을 시도하지 않는다', async () => {
    await expect(
      registerMiniApp(
        { repo, generateId },
        {
          name: '앱',
          description: '',
          icon: { kind: 'emoji', value: '' },
          htmlBytes: new Uint8Array([1]),
        },
        [],
      ),
    ).rejects.toThrow();
    expect(repo.saveCalls).toHaveLength(0);
  });
});
