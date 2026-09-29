import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const here = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root: here, cacheDir: resolve(here, 'local/vite-cache'),
  resolve: { alias: { three: resolve(here, 'node_modules/three'), fflate: resolve(here, 'node_modules/fflate') } },
  server: { host: '127.0.0.1', port: 5184, strictPort: true, fs: { allow: [resolve(here, '../..')] } },
  worker: { format: 'es' }, build: { outDir: 'local/dist' },
});
