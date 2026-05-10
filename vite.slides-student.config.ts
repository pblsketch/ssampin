import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import pkg from './package.json';

// dev 서버에서 / 경로를 slides-student.html로 라우팅
function serveSlidesStudentHtml(): Plugin {
  return {
    name: 'serve-slides-student-html',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const pathname = req.url?.split('?')[0] ?? '';
        if (pathname === '/' || pathname === '/index.html') {
          req.url =
            '/slides-student.html' +
            (req.url?.includes('?') ? req.url.substring(req.url.indexOf('?')) : '');
        }
        next();
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [serveSlidesStudentHtml(), react()],
    root: '.',
    // Electron HTTP 서버가 / 경로로 SPA를 서빙 → 상대 경로
    base: './',
    build: {
      // **중요**: vite.config.ts (dist) / vite.student.config.ts (dist-student)와 절대 충돌 X
      // Plan §13.1 메타테스트 MT-6 대상.
      outDir: 'dist-slides-student',
      target: ['es2020', 'safari14'],
      // CSP 'script-src self' 친화 — assetsInlineLimit=0 (data: URL 회피)
      assetsInlineLimit: 0,
      rollupOptions: {
        input: path.resolve(__dirname, 'slides-student.html'),
      },
    },
    resolve: {
      alias: {
        '@config': path.resolve(__dirname, 'src/config'),
        '@domain': path.resolve(__dirname, 'src/domain'),
        '@usecases': path.resolve(__dirname, 'src/usecases'),
        '@adapters': path.resolve(__dirname, 'src/adapters'),
        '@infrastructure': path.resolve(__dirname, 'src/infrastructure'),
        '@shared': path.resolve(__dirname, 'src/shared'),
        '@student': path.resolve(__dirname, 'src/student'),
      },
    },
    server: {
      port: 5176,
    },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    optimizeDeps: {
      exclude: ['electron'],
    },
  };
});
