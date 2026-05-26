import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import pkg from './package.json';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // v2.0.9 빌드 가드 — v2.0.8 빌드 사고(.env 누락 → client_id 빈 채로 박혀
  // OAuth 전체 깨짐) 재발 차단.
  // 프로덕션 빌드 시 client_id/secret 둘 다 비어있으면 즉시 throw.
  const clientId = (env.VITE_GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (env.VITE_GOOGLE_CLIENT_SECRET || '').trim();
  if (mode === 'production') {
    const missing: string[] = [];
    if (!clientId) missing.push('VITE_GOOGLE_CLIENT_ID');
    if (!clientSecret) missing.push('VITE_GOOGLE_CLIENT_SECRET');
    if (missing.length > 0) {
      throw new Error(
        `[vite] 프로덕션 빌드 중단: ${missing.join(', ')} 가 비어있습니다.\n` +
          `프로젝트 루트 .env 파일을 확인하거나, 빌드 cwd가 프로젝트 루트인지 확인하세요.\n` +
          `(이 가드는 v2.0.8 빌드 사고 — client_id 누락 채 배포되어 OAuth 전체 깨진 회귀를 차단합니다.)`,
      );
    }
  }

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@config': path.resolve(__dirname, 'src/config'),
        '@domain': path.resolve(__dirname, 'src/domain'),
        '@usecases': path.resolve(__dirname, 'src/usecases'),
        '@adapters': path.resolve(__dirname, 'src/adapters'),
        '@infrastructure': path.resolve(__dirname, 'src/infrastructure'),
        '@widgets': path.resolve(__dirname, 'src/widgets'),
        '@shared': path.resolve(__dirname, 'src/shared'),
        '@mobile': path.resolve(__dirname, 'src/mobile'),
        '@student': path.resolve(__dirname, 'src/student'),
      },
    },
    base: './',
    build: {
      outDir: 'dist',
    },
    optimizeDeps: {
      // pdfjs-dist 는 서식관리/내보내기 프리뷰에서 동적 import — 사전 번들 제외
      exclude: ['pdfjs-dist'],
    },
    define: {
      'process.env.GOOGLE_CLIENT_ID': JSON.stringify(clientId),
      'process.env.GOOGLE_CLIENT_SECRET': JSON.stringify(clientSecret),
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    server: {
      port: 5173,
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
  };
});
