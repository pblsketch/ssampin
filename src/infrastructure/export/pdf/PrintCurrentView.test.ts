import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { printCurrentView } from './PrintCurrentView';

type ElectronAPIShape = {
  printToPDF: ReturnType<typeof vi.fn>;
};

describe('printCurrentView', () => {
  const originalWindow = (globalThis as { window?: unknown }).window;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });

  function stubWindow(electronAPI?: ElectronAPIShape | null) {
    const printSpy = vi.fn();
    const w = {
      electronAPI,
      print: printSpy,
    };
    (globalThis as { window?: unknown }).window = w;
    return { printSpy };
  }

  it('Electron 환경 + 옵션 없음 → printToPDF() 인자 없이 호출', async () => {
    const printToPDF = vi.fn(async () => new ArrayBuffer(128));
    stubWindow({ printToPDF });

    const result = await printCurrentView();

    expect(printToPDF).toHaveBeenCalledTimes(1);
    expect(printToPDF).toHaveBeenCalledWith();
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(result!.byteLength).toBe(128);
  });

  it('Electron 환경 + 옵션 있음 → IPC 로 pageSize/landscape 전달', async () => {
    const printToPDF = vi.fn(async () => new ArrayBuffer(256));
    stubWindow({ printToPDF });

    await printCurrentView({
      pageSize: 'A4',
      landscape: true,
      marginsType: 1,
    });

    expect(printToPDF).toHaveBeenCalledWith({
      pageSize: 'A4',
      landscape: true,
      marginsType: 1,
    });
  });

  it('Electron 환경 + title/author 만 지정 → IPC 호출 시 옵션 없이', async () => {
    // title/author 는 Electron printToPDF 미지원이므로 걸러져야 함
    const printToPDF = vi.fn(async () => new ArrayBuffer(64));
    stubWindow({ printToPDF });

    await printCurrentView({ title: '쌤핀 문서', author: '홍길동' });

    expect(printToPDF).toHaveBeenCalledWith();
  });

  it('브라우저 환경 (electronAPI 없음) → window.print() 호출 + null 반환', async () => {
    const { printSpy } = stubWindow(null);

    const result = await printCurrentView({ landscape: true });

    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });

  it('window 자체가 없는 환경 → 에러를 던진다', async () => {
    delete (globalThis as { window?: unknown }).window;

    await expect(printCurrentView()).rejects.toThrow(/window 객체가 필요/);
  });
});
