import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
const here = fileURLToPath(new URL(".", import.meta.url));
export default defineConfig({
  root: here, publicDir: false,
  resolve: { alias: {
    three: here + "node_modules/three",
    fflate: here + "node_modules/fflate/esm/browser.js"
  } },
  server: { fs: { allow: [fileURLToPath(new URL("../../", import.meta.url))] } },
  build: { outDir: "dist", emptyOutDir: true }, worker: { format: "es" }
});
