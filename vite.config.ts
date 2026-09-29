import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// The site is served from https://timbermods.github.io/dam-good-maps/ (PLAN §20, D12).
// DGM_BASE overrides it for local previews and the end-to-end tests.
// Two pages: the generator and editor (index.html), and the Real places gallery
// (real-places/index.html; its data is in public/real-places/, written by tools/real-places.ts).
// Builds other than the site's (the browser tests' "e2e" mode) add a third: the side panel's
// workbench (workbench/index.html), its parts on their own until the workspace uses them.
const WORKBENCH = fileURLToPath(new URL("./workbench/index.html", import.meta.url));

export default defineConfig(({ mode }) => ({
  base: process.env.DGM_BASE ?? "/dam-good-maps/",
  plugins: [preact()],
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
        ...(mode === "production" || !existsSync(WORKBENCH) ? {} : { workbench: WORKBENCH }),
      },
    },
  },
}));
