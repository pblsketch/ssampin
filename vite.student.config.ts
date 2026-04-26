import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import pkg from './package.json';

// dev 서버에서 index.html 대신 student.html을 서빙
function serveStudentHtml(): Plugin {
  return {
    name: 'serve-student-html',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const pathname = req.url?.split('?')[0] ?? '';
        if (pathname === '/' || pathname === '/index.html') {
          req.url =
            '/student.html' +
            (req.url?.includes('?') ? req.url.substring(req.url.indexOf('?')) : '');
        }
        next();
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [serveStudentHtml(), react()],
    root: '.',
    // Electron http 서버가 / 경로로 학생 SPA를 서빙하므로 상대 경로 사용.
    base: './',
    build: {
      outDir: 'dist-student',
      target: ['es2020', 'safari14'],
      // v2.1 student-ux 회귀 fix (2026-04-24, Bug 1):
      // 기본값 4096 bytes 이하 chunk가 base64 data: URL로 inline되면서
      // student.html CSP `script-src 'self'`에 차단되어 학생 화면이 빈 화면으로
      // 떴음(`Loading the script 'data:application/octet-stream;base64,...'
      // violates the following Content Security Policy directive`).
      // 0으로 설정해 모든 asset을 별도 파일로 분리 → CSP 적합.
      assetsInlineLimit: 0,
      rollupOptions: {
        input: path.resolve(__dirname, 'student.html'),
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
      port: 5175,
    },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    optimizeDeps: {
      exclude: ['electron'],
    },
  };
});
