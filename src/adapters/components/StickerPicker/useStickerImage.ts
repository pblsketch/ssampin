import { useEffect, useState } from 'react';
import './stickerElectronTypes';

/**
 * 모듈 레벨 LRU-ish 캐시.
 *
 * 동일 stickerId가 여러 곳에서 동시에 마운트되어도 fetch는 1회만 발생하도록
 * Promise를 캐싱한다. 삭제·갱신 시 외부에서 invalidate를 호출.
 *
 * Map 크기 상한 200 — 500개 등록 환경에서도 active set은 보통 viewport에 보이는
 * ~50개 수준이므로 충분. 초과 시 가장 오래된 키부터 삭제.
 */
const MAX_CACHE = 200;
const cache = new Map<string, Promise<string | null>>();

function setCache(id: string, value: Promise<string | null>): void {
  if (cache.has(id)) cache.delete(id);
  cache.set(id, value);
  if (cache.size > MAX_CACHE) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
}

function fetchImage(stickerId: string): Promise<string | null> {
  const api = window.electronAPI?.sticker;
  if (!api) {
    return Promise.resolve(null);
  }
  return api.getImageDataUrl(stickerId).catch(() => null);
}

/**
 * stickerId → data:URL 변환 훅.
 *
 * - undefined: 로딩 중 (스켈레톤 표시)
 * - string: 성공 → <img src=...>
 * - null: 실패 → fallback UI
 */
export function useStickerImage(stickerId: string): string | null | undefined {
  const [src, setSrc] = useState<string | null | undefined>(() => {
    const cached = cache.get(stickerId);
    if (!cached) return undefined;
    // Promise가 이미 resolve된 경우에도 useState 동기 초기화에서는
    // resolved value를 알 수 없으므로 일단 undefined로 두고 effect에서 해소.
    return undefined;
  });

  useEffect(() => {
    let canceled = false;
    let promise = cache.get(stickerId);
    if (!promise) {
      promise = fetchImage(stickerId);
      setCache(stickerId, promise);
    }
    promise.then((value) => {
      if (!canceled) setSrc(value);
    });
    return () => {
      canceled = true;
    };
  }, [stickerId]);

  return src;
}

/** 이모티콘 갱신·삭제 시 호출 */
export function invalidateStickerImage(stickerId: string): void {
  cache.delete(stickerId);
}

export function clearStickerImageCache(): void {
  cache.clear();
}
