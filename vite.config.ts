import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
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
});
