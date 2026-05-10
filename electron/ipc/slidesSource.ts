/**
 * slidesSource IPC — Google Slides URL을 받아 슬라이드 이미지를 캐시에 저장.
 *
 * 메인 프로세스에서 동작:
 * - API 키는 빌드 시 `process.env.GOOGLE_SLIDES_API_KEY`로 메인 번들에만 주입
 *   (renderer에는 전달되지 않음 — Plan §11.6 보안 처리)
 * - GoogleSlidesApiClient + LocalImageCacheRepository를 lazy 초기화
 *
 * IPC 채널:
 *   - `slides-source:fetch-from-google` ({ url })
 *     → { revisionId, slides: { pageId, pageNumber, imagePath }[] }
 *
 * Renderer는 imagePath(file://) 만 받아 `<img src>`에 사용 — API 키는 절대 노출 X.
 */

import { app, ipcMain } from 'electron';

import { GoogleSlidesApiClient } from '../../src/infrastructure/googleSlides/GoogleSlidesApiClient';
import { LocalImageCacheRepository } from '../../src/infrastructure/storage/LocalImageCacheRepository';
import {
  SlidesNetworkError,
  SlidesNotPublicError,
  SlidesQuotaExceededError,
} from '../../src/domain/ports/IGoogleSlidesPort';
import { parseGoogleSlidesUrl } from '../../src/shared/utils/googleSlidesUrl';

// ─────────────────────────────────────────────────────────────
// Lazy init (app.whenReady 이후 안전)
// ─────────────────────────────────────────────────────────────

let cache: LocalImageCacheRepository | null = null;
let client: GoogleSlidesApiClient | null = null;

function getCache(): LocalImageCacheRepository {
  if (!cache) {
    cache = new LocalImageCacheRepository(app.getPath('userData'));
  }
  return cache;
}

function getClient(): GoogleSlidesApiClient {
  if (client) return client;
  const apiKey = process.env.GOOGLE_SLIDES_API_KEY;
  if (!apiKey || apiKey.length === 0) {
    throw new Error(
      'Google Slides API 키가 설정되어 있지 않습니다. ' +
        'GOOGLE_SLIDES_API_KEY 환경변수를 빌드 시 주입해 주세요.',
    );
  }
  client = new GoogleSlidesApiClient(apiKey, getCache());
  return client;
}

// ─────────────────────────────────────────────────────────────
// 결과 타입 (renderer 측 typed receive용)
// ─────────────────────────────────────────────────────────────

export interface FetchFromGoogleResult {
  readonly revisionId: string;
  readonly slides: readonly {
    readonly pageId: string;
    /** 1-indexed (Slide 엔티티의 pageNumber와 동일) */
    readonly pageNumber: number;
    /** 영구 file:// 경로 */
    readonly imagePath: string;
  }[];
}

/** PDF 렌더 결과 (Google Slides와 동일 shape — UI 일관성) */
export interface RenderPdfResult {
  readonly revisionId: string;
  readonly slides: readonly {
    readonly pageId: string;
    readonly pageNumber: number;
    readonly imagePath: string;
  }[];
}

/** PDF 페이지 caps (Plan §3) */
const PDF_MAX_PAGES = 100;
const PDF_MAX_PAGE_BYTES = 5 * 1024 * 1024; // 페이지당 5MB
const PDF_MAX_TOTAL_BYTES = 50 * 1024 * 1024; // 전체 50MB

// ─────────────────────────────────────────────────────────────
// 사용자 친화적 에러 메시지 매핑
// ─────────────────────────────────────────────────────────────

function toUserFacingError(err: unknown): Error {
  if (err instanceof SlidesNotPublicError) {
    return new Error(
      '공유 설정이 "뷰어"가 아니거나 비공개 프레젠테이션입니다. 공유 설정을 확인하거나 PDF로 시작해 주세요.',
    );
  }
  if (err instanceof SlidesQuotaExceededError) {
    return new Error(
      '오늘 Google Slides API 한도에 도달했습니다. PDF 모드를 사용하거나 잠시 후 다시 시도해 주세요.',
    );
  }
  if (err instanceof SlidesNetworkError) {
    return new Error(
      `Google Slides 서버 오류 (${err.statusCode}). 잠시 후 다시 시도해 주세요.`,
    );
  }
  if (err instanceof Error) return err;
  return new Error('알 수 없는 오류가 발생했습니다.');
}

// ─────────────────────────────────────────────────────────────
// 핵심 로직: URL → revisionId → 캐시 확인 → 필요 시 fetch+download
// ─────────────────────────────────────────────────────────────

import type { IGoogleSlidesPort } from '../../src/domain/ports/IGoogleSlidesPort';
import type { IImageCachePort } from '../../src/domain/ports/IImageCachePort';

export interface FetchFromGoogleDeps {
  readonly client: IGoogleSlidesPort;
  readonly cache: IImageCachePort;
}

export async function fetchFromGoogleWithDeps(
  deps: FetchFromGoogleDeps,
  url: string,
): Promise<FetchFromGoogleResult> {
  const parsed = parseGoogleSlidesUrl(url);
  if (!parsed.ok) {
    if (parsed.reason === 'wrong-host') {
      throw new Error('Google Slides URL이 아닙니다 (docs.google.com 도메인 필요).');
    }
    if (parsed.reason === 'empty') {
      throw new Error('URL이 비어 있습니다.');
    }
    throw new Error('Google Slides URL 형식이 올바르지 않습니다.');
  }
  const presentationId = parsed.presentationId;

  let revisionId: string;
  try {
    revisionId = await deps.client.getRevisionId(presentationId);
  } catch (err) {
    throw toUserFacingError(err);
  }

  // 캐시 히트면 다운로드 스킵 (revisionId 기반 키)
  const alreadyCached = await deps.cache.exists(presentationId, revisionId);
  if (alreadyCached) {
    const paths = await deps.cache.list(presentationId, revisionId);
    return {
      revisionId,
      slides: paths
        .map((imagePath, i) => ({
          pageId: extractPageId(imagePath) ?? `p${i + 1}`,
          pageNumber: i + 1,
          imagePath,
        }))
        .sort((a, b) => a.pageNumber - b.pageNumber),
    };
  }

  // 다른 revisionId 캐시는 정리 (디스크 누적 방지 — Plan §3 revisionId 캐시 무효화)
  await deps.cache.invalidate(presentationId, revisionId);

  // 단명 contentUrl 조회 + 즉시 다운로드
  let cached: readonly { pageId: string; imagePath: string }[];
  try {
    const thumbs = await deps.client.getPageThumbnails(presentationId);
    if (thumbs.length === 0) {
      throw new Error('빈 프레젠테이션입니다 (슬라이드가 없습니다).');
    }
    cached = await deps.client.downloadAndCache(
      presentationId,
      revisionId,
      thumbs,
    );
  } catch (err) {
    throw toUserFacingError(err);
  }

  return {
    revisionId,
    slides: cached.map((s, i) => ({
      pageId: s.pageId,
      pageNumber: i + 1,
      imagePath: s.imagePath,
    })),
  };
}

/** Production wrapper — singleton client/cache 사용 */
async function fetchFromGoogle(url: string): Promise<FetchFromGoogleResult> {
  return fetchFromGoogleWithDeps(
    { client: getClient(), cache: getCache() },
    url,
  );
}

/** file:// 경로의 끝부분에서 pageId 추출 (예: ".../p1.png" → "p1") */
function extractPageId(filePath: string): string | null {
  const match = filePath.match(/\/([^/]+)\.png$/);
  return match ? match[1]! : null;
}

// ─────────────────────────────────────────────────────────────
// PDF 페이지 저장 (renderer가 렌더한 PNG를 캐시에 영구 저장)
// ─────────────────────────────────────────────────────────────

const PDF_CONTENT_HASH_RE = /^[A-Za-z0-9_-]+$/;

interface RenderPdfArgs {
  /** SHA-256 hex 앞부분 (renderer 측에서 산출, 16~64자 권장) */
  readonly contentHash: string;
  /** PDF 메타 — UI 표시용 (저장 X) */
  readonly originalFileName: string;
  readonly originalSize: number;
  /** 렌더된 페이지들 (1-indexed pageNumber 순서대로) */
  readonly pages: readonly {
    readonly pageId: string;
    readonly pngBytes: Uint8Array;
  }[];
}

export async function renderPdfWithCache(
  cache: LocalImageCacheRepository,
  args: RenderPdfArgs,
): Promise<RenderPdfResult> {
  if (!PDF_CONTENT_HASH_RE.test(args.contentHash)) {
    throw new Error('잘못된 PDF contentHash 입니다.');
  }
  if (args.pages.length === 0) {
    throw new Error('PDF에 페이지가 없습니다.');
  }
  if (args.pages.length > PDF_MAX_PAGES) {
    throw new Error(
      `PDF 페이지가 너무 많습니다 (${args.pages.length}장). 최대 ${PDF_MAX_PAGES}장까지 지원됩니다.`,
    );
  }

  let totalBytes = 0;
  for (const p of args.pages) {
    if (p.pngBytes.byteLength > PDF_MAX_PAGE_BYTES) {
      throw new Error(
        `${p.pageId} 페이지가 너무 큽니다 (페이지당 5MB 제한).`,
      );
    }
    totalBytes += p.pngBytes.byteLength;
  }
  if (totalBytes > PDF_MAX_TOTAL_BYTES) {
    throw new Error(
      `전체 PDF 이미지가 너무 큽니다 (${(totalBytes / 1024 / 1024).toFixed(1)}MB). 최대 50MB.`,
    );
  }

  // 동일 contentHash 기존 캐시는 유효 (PDF는 내용 불변) — 재저장은 멱등.
  // 다른 contentHash 폴더는 정리(여기서는 같은 presentationId=contentHash 사용 → invalidate 불필요)

  const slides: { pageId: string; pageNumber: number; imagePath: string }[] = [];
  for (let i = 0; i < args.pages.length; i++) {
    const p = args.pages[i]!;
    if (!PDF_CONTENT_HASH_RE.test(p.pageId)) {
      throw new Error(`잘못된 pageId: ${p.pageId}`);
    }
    const imagePath = await cache.store(
      args.contentHash,
      args.contentHash,
      p.pageId,
      p.pngBytes,
    );
    slides.push({
      pageId: p.pageId,
      pageNumber: i + 1,
      imagePath,
    });
  }

  return { revisionId: args.contentHash, slides };
}

// ─────────────────────────────────────────────────────────────
// IPC 등록
// ─────────────────────────────────────────────────────────────

export function registerSlidesSourceHandlers(): void {
  ipcMain.handle(
    'slides-source:fetch-from-google',
    async (_event, args: { url: string }): Promise<FetchFromGoogleResult> => {
      return fetchFromGoogle(args.url);
    },
  );

  ipcMain.handle(
    'slides-source:render-pdf',
    async (_event, args: RenderPdfArgs): Promise<RenderPdfResult> => {
      return renderPdfWithCache(getCache(), args);
    },
  );
}

// 테스트 / 디버그용 export
export const __test__ = {
  fetchFromGoogle,
  resetClients: (): void => {
    cache = null;
    client = null;
  },
};
