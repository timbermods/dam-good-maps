import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('.', import.meta.url));
const repo = resolve(root, '../..');
export default defineConfig({
  root, publicDir: false,
  resolve: { alias: { three: resolve(root, 'node_modules/three'), fflate: resolve(root, 'node_modules/fflate') } },
  server: { host: '127.0.0.1', port: 0, fs: { allow: [repo] } },
  plugins: [{
    name: 'maplook3-local-comparison',
    transform(code, id) {
      if (!id.replaceAll('\\', '/').endsWith('/src/render3d/renderer.ts')) return;
      const needle = 'this.software = softwareRendering();';
      if (!code.includes(needle)) throw new Error('Standard renderer bridge changed');
      // Compare actual Standard even on software WebGL; never silently compare Light.
      return code.replace(needle, 'this.software = false;');
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0];
        if (!/^\/maps\/place\/near-[a-z0-9-]+\.json\.gz$/.test(path)) return next();
        const file = resolve(repo, 'public/real-places/data', path.split('/').at(-1)!);
        if (!existsSync(file)) { res.statusCode = 404; res.end('Place not found'); return; }
        res.setHeader('Content-Type', 'application/octet-stream');
        res.end(readFileSync(file));
      });
    },
  }],
});
