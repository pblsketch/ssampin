import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import pkg from './package.json';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@domain': path.resolve(__dirname, 'src/domain'),
        '@usecases': path.resolve(__dirname, 'src/usecases'),
        '@adapters': path.resolve(__dirname, 'src/adapters'),
        '@infrastructure': path.resolve(__dirname, 'src/infrastructure'),
        '@widgets': path.resolve(__dirname, 'src/widgets'),
      },
    },
    base: './',
    build: {
      outDir: 'dist',
    },
    define: {
      'process.env.GOOGLE_CLIENT_ID': JSON.stringify(env.VITE_GOOGLE_CLIENT_ID || ''),
      'process.env.GOOGLE_CLIENT_SECRET': JSON.stringify(env.VITE_GOOGLE_CLIENT_SECRET || ''),
      '__APP_VERSION__': JSON.stringify(pkg.version),
    },
    server: {
      port: 5173,
      proxy: {
        '/neis-api': {
          target: 'https://open.neis.go.kr',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/neis-api/, ''),
        },
      },
    },
  };
});
