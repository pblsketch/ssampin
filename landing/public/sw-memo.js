/**
 * 쌤핀 우리 반 메모 — /memo/ 전용 최소 서비스 워커 (PWA 설치성 보강)
 *
 * - 페이지 이동: network-first, 오프라인이면 마지막 캐시된 페이지
 * - 정적 자산(/_next/static, 아이콘): cache-first
 * - Drive API 등 외부 요청은 가로채지 않음 (passthrough)
 */
const CACHE_NAME = 'ssampin-memo-shell-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('ssampin-memo-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Drive API 등 외부는 통과

  const isMemoNavigation = request.mode === 'navigate' && url.pathname.startsWith('/memo/');
  const isStaticAsset =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname === '/icon.png' ||
    url.pathname === '/apple-icon.png' ||
    url.pathname.endsWith('/manifest.webmanifest');

  if (isMemoNavigation) {
    // network-first: 항상 최신 페이지, 오프라인일 때만 마지막 캐시
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const response = await fetch(request);
          if (response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        } catch (error) {
          const cached = await cache.match(request);
          if (cached) return cached;
          throw error;
        }
      })(),
    );
    return;
  }

  if (isStaticAsset) {
    // cache-first: 해시된 정적 자산은 불변
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          cache.put(request, response.clone());
        }
        return response;
      })(),
    );
  }
});
