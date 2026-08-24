/**
 * QA2 H3 회귀 잠금 — 저장소 read()의 null은 "파일/키 없음"만 의미한다.
 *
 * 읽기 오류(IPC 실패·본문 손상·접근 거부)를 null로 삼키면, 락 안에서 fresh를 읽어
 * 그 위에 쓰는 저장 경로가 "빈 파일"로 오인해 기존 데이터 전체를 편집분만으로
 * 덮어쓴다. 오류는 반드시 예외로 전파되어 쓰기가 차단돼야 한다.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { LocalStorageAdapter } from '../LocalStorageAdapter';
import { ElectronStorageAdapter } from '../ElectronStorageAdapter';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LocalStorageAdapter.read — 오류는 null로 위장하지 않는다 (QA2 H3)', () => {
  it('키가 없으면 null을 반환한다', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    await expect(new LocalStorageAdapter().read('attendance')).resolves.toBeNull();
  });

  it('예상한 이전 값이 다르면 조건부 교체를 거부한다', async () => {
    let raw = JSON.stringify({ value: 'changed' });
    const setItem = vi.fn((_key: string, value: string) => {
      raw = value;
    });
    vi.stubGlobal('localStorage', { getItem: () => raw, setItem });

    await expect(
      new LocalStorageAdapter().replaceIfUnchanged(
        'events',
        { value: 'baseline' },
        { value: 'remote' },
      ),
    ).resolves.toBe(false);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('예상한 이전 값이 같을 때만 조건부 교체한다', async () => {
    let raw = JSON.stringify({ value: 'baseline' });
    vi.stubGlobal('localStorage', {
      getItem: () => raw,
      setItem: (_key: string, value: string) => {
        raw = value;
      },
    });

    await expect(
      new LocalStorageAdapter().replaceIfUnchanged(
        'events',
        { value: 'baseline' },
        { value: 'remote' },
      ),
    ).resolves.toBe(true);
    expect(JSON.parse(raw)).toEqual({ value: 'remote' });
  });

  it('본문이 손상되면(JSON 파싱 실패) 예외를 던진다', async () => {
    vi.stubGlobal('localStorage', { getItem: () => '{손상된 json' });
    await expect(new LocalStorageAdapter().read('attendance')).rejects.toThrow();
  });

  it('저장소 접근 자체가 실패하면 예외를 던진다', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
    });
    await expect(new LocalStorageAdapter().read('attendance')).rejects.toThrow('SecurityError');
  });
});

describe('ElectronStorageAdapter.read — 오류는 null로 위장하지 않는다 (QA2 H3)', () => {
  it('파일이 없으면(null) null을 반환한다', async () => {
    vi.stubGlobal('window', { electronAPI: { readData: async () => null } });
    await expect(new ElectronStorageAdapter().read('attendance')).resolves.toBeNull();
  });

  it('IPC 읽기 오류는 예외로 전파된다', async () => {
    vi.stubGlobal('window', {
      electronAPI: {
        readData: async () => {
          throw new Error('파일 손상 — 원본·백업 복구 실패');
        },
      },
    });
    await expect(new ElectronStorageAdapter().read('attendance')).rejects.toThrow('복구 실패');
  });

  it('본문이 손상된 JSON이면 예외를 던진다', async () => {
    vi.stubGlobal('window', { electronAPI: { readData: async () => '{손상된 json' } });
    await expect(new ElectronStorageAdapter().read('attendance')).rejects.toThrow();
  });

  it('조건부 JSON 교체에 이전값과 다음값을 정확히 전달한다', async () => {
    const writeDataIfUnchanged = vi.fn(async () => true);
    vi.stubGlobal('window', { electronAPI: { writeDataIfUnchanged } });

    await expect(
      new ElectronStorageAdapter().replaceIfUnchanged(
        'events',
        { value: 'baseline' },
        { value: 'remote' },
      ),
    ).resolves.toBe(true);
    expect(writeDataIfUnchanged).toHaveBeenCalledWith(
      'events',
      JSON.stringify({ value: 'baseline' }),
      JSON.stringify({ value: 'remote' }, null, 2),
    );
  });
});
