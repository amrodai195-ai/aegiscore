import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'client', 'src'),
      '@shared': path.resolve(rootDir, 'shared'),
      '@assets': path.resolve(rootDir, 'attached_assets'),
    },
  },
  envDir: rootDir,
  root: path.resolve(rootDir, 'client'),
  publicDir: path.resolve(rootDir, 'client', 'public'),
  build: {
    outDir: path.resolve(rootDir, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
