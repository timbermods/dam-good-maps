import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { rustWatch } from "./tools/rust/vite-plugin.mjs";

// The site is served from https://timbermods.github.io/dam-good-maps/ (PLAN §20, D12).
// DGM_BASE overrides it for local previews and the end-to-end tests.
// Two pages: the generator and editor (index.html), and the Real places gallery
// (real-places/index.html; its data is in public/real-places/, written by tools/real-places.ts).
// Cross-origin isolation (the multi-core water, src/core/sim/parallel.ts): the dev server and the preview the
// tests use send the headers themselves; on GitHub Pages the service worker adds them (public/sw.js, D397).
const isolation = { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" };

export default defineConfig({
  base: process.env.DGM_BASE ?? "/dam-good-maps/",
  // rustWatch: saving a .rs file rebuilds the Rust's Wasm while `npm run dev` runs (D444)
  plugins: [preact(), rustWatch()],
  server: { headers: isolation },
  preview: { headers: isolation },
  worker: { format: "es" },
  build: {
    target: "es2022",
    sourcemap: true,
    // the 3D view's chunk (three.js) is about 570 KB; it loads only when a player opens 3D
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        places: fileURLToPath(new URL("./real-places/index.html", import.meta.url)),
      },
    },
  },
});
