import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
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
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'dist-electron', 'release', 'spikes/**'],
    globals: false,
  },
});
