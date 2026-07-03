import { describe, it, expect, beforeEach } from 'vitest';
import type { IMiniAppRepository } from '@domain/repositories/IMiniAppRepository';
import type { MiniApp } from '@domain/entities/MiniApp';
import { updateMiniApp } from './UpdateMiniApp';

class MockMiniAppRepository implements IMiniAppRepository {
  saveCalls: Array<{ id: string; bytes: Uint8Array }> = [];
  saveIconCalls: Array<{ id: string; bytes: Uint8Array; ext: string }> = [];
  async save(id: string, htmlBytes: Uint8Array): Promise<void> {
    this.saveCalls.push({ id, bytes: htmlBytes });
  }
  async saveIcon(id: string, bytes: Uint8Array, ext: string): Promise<string> {
    this.saveIconCalls.push({ id, bytes, ext });
    return `icon.${ext}`;
  }
  async remove(): Promise<void> {}
  async list(): Promise<readonly string[]> {
    return [];
  }
}

function app(id: string, over: Partial<MiniApp> = {}): MiniApp {
  return {
    id,
    name: `앱-${id}`,
    description: '기존 설명',
    icon: { kind: 'emoji', value: '🎲' },
    createdAt: 100,
    order: 0,
    ...over,
  };
}

describe('updateMiniApp', () => {
  let repo: MockMiniAppRepository;
  beforeEach(() => {
    repo = new MockMiniAppRepository();
  });

  it('이름·설명·아이콘 메타를 갱신하고 id·등록일·순서는 보존한다', async () => {
    const existing = [
      app('a', { createdAt: 100, order: 0 }),
      app('b', { createdAt: 200, order: 1 }),
    ];
    const next = await updateMiniApp(
      { repo },
      {
        id: 'b',
        name: ' 새 이름 ',
        description: ' 새 설명 ',
        icon: { kind: 'emoji', value: '🎯' },
      },
      existing,
    );

    const updated = next.find((a) => a.id === 'b')!;
    expect(updated.name).toBe('새 이름'); // 트림
    expect(updated.description).toBe('새 설명');
    expect(updated.icon).toEqual({ kind: 'emoji', value: '🎯' });
    expect(updated.createdAt).toBe(200); // 보존
    expect(updated.order).toBe(1); // 보존
    // 다른 앱은 그대로
    expect(next.find((a) => a.id === 'a')).toEqual(existing[0]);
    // 파일 미제공 → save/saveIcon 미호출
    expect(repo.saveCalls).toHaveLength(0);
    expect(repo.saveIconCalls).toHaveLength(0);
  });

  it('htmlBytes 제공 시에만 파일을 교체한다', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    await updateMiniApp(
      { repo },
      {
        id: 'a',
        name: '앱',
        description: '',
        icon: { kind: 'emoji', value: '🎲' },
        htmlBytes: bytes,
      },
      [app('a')],
    );
    expect(repo.saveCalls).toHaveLength(1);
    expect(repo.saveCalls[0]!.id).toBe('a');
    expect(repo.saveCalls[0]!.bytes).toBe(bytes);
  });

  it('이미지 아이콘 + iconBytes면 saveIcon 호출하고 반환 파일명으로 교체', async () => {
    const iconBytes = new Uint8Array([9]);
    const next = await updateMiniApp(
      { repo },
      {
        id: 'a',
        name: '앱',
        description: '',
        icon: { kind: 'image', fileName: 'old.png' },
        iconBytes,
        iconExt: 'webp',
      },
      [app('a')],
    );
    expect(repo.saveIconCalls).toHaveLength(1);
    expect(next.find((a) => a.id === 'a')!.icon).toEqual({ kind: 'image', fileName: 'icon.webp' });
  });

  it('이미지 아이콘 유지(iconBytes 없음)면 기존 파일명 그대로, saveIcon 미호출', async () => {
    const next = await updateMiniApp(
      { repo },
      { id: 'a', name: '앱', description: '', icon: { kind: 'image', fileName: 'keep.png' } },
      [app('a', { icon: { kind: 'image', fileName: 'keep.png' } })],
    );
    expect(repo.saveIconCalls).toHaveLength(0);
    expect(next.find((a) => a.id === 'a')!.icon).toEqual({ kind: 'image', fileName: 'keep.png' });
  });

  it('없는 id면 throw하고 저장을 시도하지 않는다', async () => {
    await expect(
      updateMiniApp(
        { repo },
        { id: 'missing', name: '앱', description: '', icon: { kind: 'emoji', value: '🎲' } },
        [app('a')],
      ),
    ).rejects.toThrow();
    expect(repo.saveCalls).toHaveLength(0);
  });

  it('이름이 비면(유효성 실패) throw', async () => {
    await expect(
      updateMiniApp(
        { repo },
        { id: 'a', name: '   ', description: '', icon: { kind: 'emoji', value: '🎲' } },
        [app('a')],
      ),
    ).rejects.toThrow();
  });
});
