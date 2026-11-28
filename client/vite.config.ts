import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';

const clientRoot = import.meta.dirname;

export default defineConfig(() => {
  const outDir = path.resolve(clientRoot, 'dist');
  return {
    root: clientRoot,
    publicDir: path.resolve(clientRoot, 'public'),
    build: {
      outDir,
      emptyOutDir: true,
      target: 'es2020',
      cssCodeSplit: true,
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (
              id.includes('/react-dom/') ||
              id.includes('/react/') ||
              id.includes('/react-is/') ||
              id.includes('/scheduler/') ||
              id.includes('/react-router')
            ) {
              return 'react-vendor';
            }
            if (id.includes('/axios/')) {
              return 'http-vendor';
            }
            if (id.includes('/lucide-react/') || id.includes('/sonner/')) {
              return 'ui-vendor';
            }
          },
        },
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      // Copies client/src/assets into client/dist/src/assets so root-relative URLs like
      // "/src/assets/images/..." still resolve in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const srcAssets = path.resolve(clientRoot, 'src/assets');
          const distAssets = path.resolve(outDir, 'src/assets');
          if (fs.existsSync(outDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, { recursive: true, force: true });
          }
        },
      },
    ],
    resolve: {
      dedupe: ['react', 'react-dom', 'react-is', 'react-router-dom'],
      alias: {
        '@': clientRoot,
      },
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'react-router-dom',
        'recharts',
        'lucide-react',
        'sonner',
        'axios',
        'react-hook-form',
        '@hookform/resolvers/zod',
        'zod',
        'socket.io-client',
      ],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
