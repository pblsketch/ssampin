import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  __resetFontCache,
  loadKoreanFontBuffers,
} from './FontRegistry';

describe('loadKoreanFontBuffers', () => {
  beforeEach(() => {
    __resetFontCache();
  });

  it('주입된 fetcher 로 Regular + Bold 2개 ArrayBuffer 를 반환한다', async () => {
    const fetcher = vi.fn(async (url: string) => {
      const n = url.includes('Bold') ? 32 : 16;
      return new ArrayBuffer(n);
    });

    const result = await loadKoreanFontBuffers(fetcher, '');

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledWith('fonts/NotoSansKR-Regular.subset.ttf');
    expect(fetcher).toHaveBeenCalledWith('fonts/NotoSansKR-Bold.subset.ttf');
    expect(result.regular.byteLength).toBe(16);
    expect(result.bold.byteLength).toBe(32);
  });

  it('base 인자를 URL 앞에 prefix 한다', async () => {
    const fetcher = vi.fn(async () => new ArrayBuffer(8));

    await loadKoreanFontBuffers(fetcher, 'https://ssampin.local/');

    expect(fetcher).toHaveBeenCalledWith(
      'https://ssampin.local/fonts/NotoSansKR-Regular.subset.ttf',
    );
    expect(fetcher).toHaveBeenCalledWith(
      'https://ssampin.local/fonts/NotoSansKR-Bold.subset.ttf',
    );
  });

  it('두 번째 호출은 캐시에서 반환 (fetcher 추가 호출 없음, 독립 복사본)', async () => {
    const fetcher = vi.fn(async () => new ArrayBuffer(8));

    const first = await loadKoreanFontBuffers(fetcher, '');
    const second = await loadKoreanFontBuffers(fetcher, '');

    expect(fetcher).toHaveBeenCalledTimes(2); // 1회 호출분(Regular+Bold)만
    // 각 호출은 독립된 복사본 반환 — 원본 detach 로부터 안전.
    expect(second).not.toBe(first);
    expect(second.regular.byteLength).toBe(first.regular.byteLength);
    expect(second.regular).not.toBe(first.regular);
  });

  it('fetcher 실패 시 에러를 전파한다', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('network down');
    });

    await expect(loadKoreanFontBuffers(fetcher, '')).rejects.toThrow(
      'network down',
    );
  });

  it('실제 public/fonts 서브셋 파일을 읽어 pdf-lib 에 임베드할 수 있다 (integration)', async () => {
    // Node fs 를 fetcher 로 사용 — 실제 public/fonts/*.ttf 를 읽어봄.
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const root = process.cwd();

    const fsFetcher = async (url: string): Promise<ArrayBuffer> => {
      // url: '/fonts/NotoSansKR-Regular.subset.ttf' (base='')
      const filePath = path.join(root, 'public', url);
      const buf = await fs.readFile(filePath);
      // Node Buffer → ArrayBuffer 복사 (Buffer.buffer 는 pool 공유 가능성 있음)
      const copy = new ArrayBuffer(buf.byteLength);
      new Uint8Array(copy).set(buf);
      return copy;
    };

    const buffers = await loadKoreanFontBuffers(fsFetcher, '');

    // 서브셋 파일은 최소 100KB 이상
    expect(buffers.regular.byteLength).toBeGreaterThan(100_000);
    expect(buffers.bold.byteLength).toBeGreaterThan(100_000);

    // pdf-lib 에 실제 임베딩 — fontkit 등록 + embedFont 성공 여부 확인
    const { PDFDocument } = await import('pdf-lib');
    const fontkit = (await import('@pdf-lib/fontkit')).default;

    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);

    const regularFont = await doc.embedFont(buffers.regular, { subset: true });
    const boldFont = await doc.embedFont(buffers.bold, { subset: true });

    // 한글 텍스트를 측정해서 너비가 0 이상인지 확인 (글리프 매핑 성공 여부)
    const regularWidth = regularFont.widthOfTextAtSize('안녕하세요 쌤핀', 12);
    const boldWidth = boldFont.widthOfTextAtSize('학생 기록부', 12);

    expect(regularWidth).toBeGreaterThan(0);
    expect(boldWidth).toBeGreaterThan(0);
  });
});
