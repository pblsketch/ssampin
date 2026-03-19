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
          req.url = '/mobile.html' + (req.url?.includes('?') ? req.url.substring(req.url.indexOf('?')) : '');
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
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
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        categories: ['education', 'productivity'],
        lang: 'ko',
        dir: 'ltr',
      },
      workbox: {
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
        ],
      },
    }),
  ],
  root: '.',
  build: {
    outDir: 'dist-mobile',
    rollupOptions: {
      input: path.resolve(__dirname, 'mobile.html'),
    },
  },
  resolve: {
    alias: {
      '@domain': path.resolve(__dirname, 'src/domain'),
      '@usecases': path.resolve(__dirname, 'src/usecases'),
      '@adapters': path.resolve(__dirname, 'src/adapters'),
      '@infrastructure': path.resolve(__dirname, 'src/infrastructure'),
      '@mobile': path.resolve(__dirname, 'src/mobile'),
      '@widgets': path.resolve(__dirname, 'src/widgets'),
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
    },
  },
  define: {
    'process.env.GOOGLE_CLIENT_ID': JSON.stringify(env.VITE_GOOGLE_CLIENT_ID || ''),
    'process.env.GOOGLE_CLIENT_SECRET': JSON.stringify(env.VITE_GOOGLE_CLIENT_SECRET || ''),
    '__APP_VERSION__': JSON.stringify(pkg.version),
  },
  // Electron 전용 패키지를 외부로 처리
  optimizeDeps: {
    exclude: ['electron'],
  },
};
});
