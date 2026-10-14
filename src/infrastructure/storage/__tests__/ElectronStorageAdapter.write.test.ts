import { afterEach, describe, expect, it, vi } from 'vitest';
import { ElectronStorageAdapter } from '../ElectronStorageAdapter';

/**
 * 저장소가 쓰지 못했다고 답하면 성공처럼 넘기지 않는다.
 * 삼키면 호출 쪽이 화면만 갱신하고, 입력한 내용이 다음에 디스크를 읽을 때 사라진다.
 */
function withApi(writeData: (f: string, d: string) => Promise<unknown>) {
  vi.stubGlobal('window', { electronAPI: { writeData } });
  return new ElectronStorageAdapter();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ElectronStorageAdapter.write', () => {
  it('저장소가 true 를 돌려주면 성공이다', async () => {
    const adapter = withApi(async () => true);
    await expect(adapter.write('todos', { todos: [] })).resolves.toBeUndefined();
  });

  it('저장소가 false 를 돌려주면 오류를 던진다', async () => {
    const adapter = withApi(async () => false);
    await expect(adapter.write('todos', { todos: [] })).rejects.toThrow('저장하지 못했습니다');
  });

  it('값을 돌려주지 않는 예전 저장소(undefined)는 성공으로 본다', async () => {
    const adapter = withApi(async () => undefined);
    await expect(adapter.write('todos', { todos: [] })).resolves.toBeUndefined();
  });

  it('IPC 자체가 실패하면 그 오류가 그대로 전해진다', async () => {
    const adapter = withApi(async () => {
      throw new Error('ipc down');
    });
    await expect(adapter.write('todos', {})).rejects.toThrow('ipc down');
  });
});
