import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

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

export default defineConfig({
  plugins: [
    serveMobileHtml(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '쌤핀 모바일',
        short_name: '쌤핀',
        description: '교사용 모바일 대시보드',
        theme_color: '#0a0e17',
        background_color: '#0a0e17',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
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
    __APP_VERSION__: JSON.stringify('mobile-dev'),
  },
  // Electron 전용 패키지를 외부로 처리
  optimizeDeps: {
    exclude: ['electron'],
  },
});
