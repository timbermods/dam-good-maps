import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root: here,
  publicDir: '../../public',
  resolve: { alias: {
    'three/addons': fileURLToPath(new URL('./node_modules/three/examples/jsm', import.meta.url)),
    three: fileURLToPath(new URL('./node_modules/three', import.meta.url)),
    fflate: fileURLToPath(new URL('./node_modules/fflate/esm/browser.js', import.meta.url))
  }},
  server: { host: '127.0.0.1', port: 0, strictPort: false, fs: { allow: [fileURLToPath(new URL('../../', import.meta.url))] } },
  build: { outDir: 'dist', emptyOutDir: true, copyPublicDir: false },
  worker: { format: 'es' }
});
