// The demo's dev server: this folder is the root; the repository's own packages (three, vite) are
// used, and the repository's src/ and the other investigations it imports are allowed.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  publicDir: false,
  server: { host: "127.0.0.1", port: Number(process.env.ERODE_PORT ?? 0), strictPort: !!process.env.ERODE_PORT, fs: { allow: [fileURLToPath(new URL("../../", import.meta.url))] } },
  build: { outDir: "local/dist", emptyOutDir: true },
  worker: { format: "es" },
});
