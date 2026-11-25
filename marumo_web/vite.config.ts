import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),



      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(import.meta.dirname, 'dist');
          const srcAssets = path.resolve(import.meta.dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      proxy: {
        '/auth': { target: process.env.MARUMO_API_TARGET || 'http://127.0.0.1:3000', changeOrigin: false },
        '/catalog': { target: process.env.MARUMO_API_TARGET || 'http://127.0.0.1:3000', changeOrigin: false },
        '/admin': { target: process.env.MARUMO_API_TARGET || 'http://127.0.0.1:3000', changeOrigin: false },
        '/bookings': { target: process.env.MARUMO_API_TARGET || 'http://127.0.0.1:3000', changeOrigin: false },
        '/payments': { target: process.env.MARUMO_API_TARGET || 'http://127.0.0.1:3000', changeOrigin: false },
        '/loyalty': { target: process.env.MARUMO_API_TARGET || 'http://127.0.0.1:3000', changeOrigin: false },
        '/public': { target: process.env.MARUMO_API_TARGET || 'http://127.0.0.1:3000', changeOrigin: false },
      },
      hmr: process.env.DISABLE_HMR !== 'true',

      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: ['**/.*.tmpdir/**'],
      },
    },
  };
});
