import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import path from 'node:path';

import pkg from './package.json';

// The Electron main/preload processes run under Node, so runtime `dependencies` (in
// particular `better-sqlite3`, a native addon) must stay `require()`-able at their real
// node_modules path rather than bundled by rollup — rollup can't statically resolve the
// `.node` binary's dynamic require, which fails at runtime with "Could not dynamically
// require ...better_sqlite3.node". Externalizing every dependency (not just the native one)
// is the standard vite-plugin-electron pattern: only first-party source gets bundled.
const externalDependencies = Object.keys(pkg.dependencies ?? {});

// https://vitejs.dev/config/
export default defineConfig({
  root: path.resolve(__dirname, 'src/renderer'),
  plugins: [
    react(),
    electron({
      main: {
        entry: path.join(__dirname, 'electron/main.ts'),
        vite: {
          build: {
            outDir: path.resolve(__dirname, 'dist-electron'),
            rollupOptions: {
              external: externalDependencies,
              output: { format: 'cjs', entryFileNames: '[name].js' },
            },
          },
        },
      },
      preload: {
        input: path.join(__dirname, 'electron/preload.ts'),
        vite: {
          build: {
            outDir: path.resolve(__dirname, 'dist-electron'),
            rollupOptions: {
              external: externalDependencies,
              output: { format: 'cjs', entryFileNames: '[name].js' },
            },
          },
        },
      },
      renderer: {},
    }),
  ],
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
});
