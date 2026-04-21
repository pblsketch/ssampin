import fontkit from '@pdf-lib/fontkit';
import type { PDFDocument, PDFFont } from 'pdf-lib';

/**
 * Noto Sans KR 서브셋 로더 & pdf-lib 임베딩 헬퍼.
 *
 * - 번들 내 `public/fonts/` 의 TTF 서브셋 2종(Regular/Bold)을 fetch.
 * - 모듈 레벨 캐시로 세션당 1회만 네트워크(실제로는 app.asar) 접근.
 * - 오프라인 완전 동작 원칙 준수: CDN/런타임 다운로드 없음.
 */

// 캐시는 Uint8Array 로 저장 — ArrayBuffer 는 TransferList/pdfjs 등에서
// detach 될 수 있어 버퍼 자체를 잃기 쉬움. Uint8Array 는 뷰이며 새 복사본을
// 안전하게 만들 수 있도록 slice() 유틸을 제공.
export type FontBuffers = { regular: ArrayBuffer; bold: ArrayBuffer };
type CachedBuffers = { regular: Uint8Array; bold: Uint8Array };

type FontFetcher = (url: string) => Promise<ArrayBuffer>;

// 선행 슬래시 없음 — Electron file:// 환경에서는 document.baseURI 기준 상대경로로
// 해석되어야 dist/fonts/... 를 가리킴 (절대경로면 드라이브 루트로 잘못 해석됨).
const REGULAR_PATH = 'fonts/NotoSansKR-Regular.subset.ttf';
const BOLD_PATH = 'fonts/NotoSansKR-Bold.subset.ttf';

let cached: CachedBuffers | null = null;

/**
 * 테스트용 초기화 훅. 프로덕션 코드에서는 호출하지 말 것.
 * @internal
 */
export function __resetFontCache(): void {
  cached = null;
}

function defaultFetcher(url: string): Promise<ArrayBuffer> {
  if (typeof fetch === 'undefined') {
    return Promise.reject(
      new Error(
        'loadKoreanFontBuffers: fetch API 가 필요합니다 (renderer/Node 18+).',
      ),
    );
  }
  return fetch(url).then((res) => {
    if (!res.ok) {
      throw new Error(
        `Noto Sans KR 폰트 로드 실패 (${url}, status=${res.status}).`,
      );
    }
    return res.arrayBuffer();
  });
}

function resolveBase(): string {
  // document.baseURI 사용: dev(`http://localhost:5173/`) + Electron prod(`file:///.../dist/`)
  // 양쪽에서 Vite `base: './'` 와 호환되는 베이스를 반환.
  if (typeof document !== 'undefined' && document.baseURI) {
    return document.baseURI;
  }
  if (typeof window !== 'undefined' && window.location) {
    return window.location.href;
  }
  return '';
}

/**
 * 번들에 포함된 Noto Sans KR 서브셋을 한 번만 fetch 하여 캐시.
 *
 * @param fetcher 테스트 목적의 주입. 기본값은 global fetch.
 * @param base 테스트 목적의 주입. 기본값은 `window.location.origin` 또는 빈 문자열.
 */
export async function loadKoreanFontBuffers(
  fetcher: FontFetcher = defaultFetcher,
  base: string = resolveBase(),
): Promise<FontBuffers> {
  if (cached) {
    return { regular: copyOf(cached.regular), bold: copyOf(cached.bold) };
  }

  const join = (p: string): string => {
    if (!base) return p;
    if (base.endsWith('/')) return base + p;
    try {
      return new URL(p, base).href;
    } catch {
      return base + '/' + p;
    }
  };
  const [regular, bold] = await Promise.all([
    fetcher(join(REGULAR_PATH)),
    fetcher(join(BOLD_PATH)),
  ]);

  // 캐시에는 독립된 복사본만 저장 — 원본이 detach 되어도 영향 없음.
  cached = { regular: new Uint8Array(regular.slice(0)), bold: new Uint8Array(bold.slice(0)) };
  return { regular: copyOf(cached.regular), bold: copyOf(cached.bold) };
}

function copyOf(u8: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(u8.byteLength);
  new Uint8Array(copy).set(u8);
  return copy;
}

/**
 * pdf-lib 문서에 한글 폰트 등록 (subset embed).
 */
export async function embedKoreanFonts(
  doc: PDFDocument,
): Promise<{ regular: PDFFont; bold: PDFFont }> {
  doc.registerFontkit(fontkit);
  // loadKoreanFontBuffers 는 매 호출마다 독립된 ArrayBuffer 복사본을 반환.
  const buffers = await loadKoreanFontBuffers();
  const regular = await doc.embedFont(buffers.regular, { subset: true });
  const bold = await doc.embedFont(buffers.bold, { subset: true });
  return { regular, bold };
}
