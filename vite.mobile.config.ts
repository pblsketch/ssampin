import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import pkg from './package.json';

// dev 서버에서 index.html 대신 mobile.html을 서빙
function serveMobileHtml(): Plugin {
  return {
    name: 'serve-mobile-html',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const pathname = req.url?.split('?')[0] ?? '';
        if (pathname === '/' || pathname === '/index.html') {
          req.url =
            '/mobile.html' +
            (req.url?.includes('?') ? req.url.substring(req.url.indexOf('?')) : '');
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // 빌드 타임 env 가드: 실제 production 배포 빌드에서 Supabase 환경변수 누락이면 즉시 실패.
  // 2026-05-13 OAuth 무한로딩 핫픽스 / 2026-05-14 설문 응답 silent fail 이슈와 같은
  // "Vercel env 누락이 silent fail로 이어져 사용자 신고 발생" 패턴을 영구 차단한다.
  //
  // Vercel Preview/Development 배포는 면제 — Preview env 에 동일 변수를 등록할 의무가
  // 없으므로 PR 머지를 막지 않기 위해 production 배포에만 가드를 적용한다.
  const isVercelNonProd = !!process.env.VERCEL && process.env.VERCEL_ENV !== 'production';
  if (command === 'build' && mode === 'production' && !isVercelNonProd) {
    const missing: string[] = [];
    if (!env.VITE_SUPABASE_URL) missing.push('VITE_SUPABASE_URL');
    if (!env.VITE_SUPABASE_ANON_KEY) missing.push('VITE_SUPABASE_ANON_KEY');
    if (missing.length > 0) {
      throw new Error(
        `[vite.mobile.config] production build에 필요한 환경변수 누락: ${missing.join(', ')}. ` +
          `Vercel 대시보드 또는 \`vercel env add\`로 추가한 뒤 다시 빌드해주세요.`,
      );
    }
  }

  return {
    plugins: [
      serveMobileHtml(),
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: '쌤핀 모바일',
          short_name: '쌤핀',
          description: '교사용 모바일 대시보드 — 시간표, 출결, 메모를 교실에서도',
          theme_color: '#0a0e17',
          background_color: '#0a0e17',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          id: '/',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            {
              src: '/icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
          categories: ['education', 'productivity'],
          lang: 'ko',
          dir: 'ltr',
        },
        workbox: {
          navigateFallback: 'mobile.html',
          navigateFallbackAllowlist: [/^\/$/],
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Pretendard Variable (jsdelivr) — CSS + 동적 서브셋 woff2 일괄 캐시
              urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/gh\/orioncactus\/pretendard\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'pretendard-cache',
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ],
    root: '.',
    build: {
      outDir: 'dist-mobile',
      target: ['es2020', 'safari14'],
      rollupOptions: {
        input: path.resolve(__dirname, 'mobile.html'),
      },
    },
    resolve: {
      alias: {
        '@config': path.resolve(__dirname, 'src/config'),
        '@domain': path.resolve(__dirname, 'src/domain'),
        '@usecases': path.resolve(__dirname, 'src/usecases'),
        '@adapters': path.resolve(__dirname, 'src/adapters'),
        '@infrastructure': path.resolve(__dirname, 'src/infrastructure'),
        '@mobile': path.resolve(__dirname, 'src/mobile'),
        '@widgets': path.resolve(__dirname, 'src/widgets'),
        '@shared': path.resolve(__dirname, 'src/shared'),
      },
    },
    server: {
      port: 5174,
      proxy: {
        '/neis-api': {
          target: 'https://open.neis.go.kr',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/neis-api/, ''),
        },
        '/weather-api': {
          target: 'https://api.weatherapi.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/weather-api/, ''),
        },
      },
    },
    define: {
      // 모바일 PWA 는 Google "Web application" OAuth 클라이언트 — code↔token 교환은
      // Supabase Edge Function `oauth-exchange` 가 서버 env 의 client_secret 으로 수행한다.
      // client_secret 을 PWA 번들에 절대 주입하지 않는다 (security-hardening P0-C / 감사 F-2).
      'process.env.GOOGLE_CLIENT_ID': JSON.stringify((env.VITE_GOOGLE_CLIENT_ID || '').trim()),
      'import.meta.env.VITE_MOBILE_GOOGLE_CLIENT_ID': JSON.stringify(
        (env.VITE_MOBILE_GOOGLE_CLIENT_ID || '').trim(),
      ),
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    // Electron 전용 패키지를 외부로 처리
    optimizeDeps: {
      exclude: ['electron'],
    },
  };
});
