import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
const path = (s: string) => fileURLToPath(new URL(s, import.meta.url));
export default defineConfig({
  root: path("."), publicDir: false, cacheDir: "local/vite-cache",
  resolve: { alias: [{ find: /^three$/, replacement: path("node_modules/three/build/three.module.js") },
    { find: /^three\//, replacement: path("node_modules/three/") }] },
  server: { host: "127.0.0.1", port: Number(process.env.BLOCK_PORT ?? 0), fs: { allow: [path("../../")] } },
  build: { outDir: "local/dist", emptyOutDir: true, chunkSizeWarningLimit: 900 },
});
