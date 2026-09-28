import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import preact from "@preact/preset-vite";

// The site is served from https://timbermods.github.io/dam-good-maps/ (PLAN §20, D12).
// DGM_BASE overrides it for local previews and the end-to-end tests.
// Three pages: the generator and editor (index.html), the Real places gallery
// (real-places/index.html; its data is in public/real-places/, written by tools/real-places.ts) and
// its credits (real-places/credits/index.html).

/** Real places' .timber files are built after `vite build`, into dist (tools/places-build.ts). The
 *  dev server builds one on request instead, with the same code, so `npm run dev` works too. */
function placesDevServer(): Plugin {
  return {
    name: "dgm-real-places-dev",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const id = /\/real-places\/maps\/([a-z0-9-]+)\.timber$/.exec((req.url ?? "").split("?")[0])?.[1];
        const data = id && `public/real-places/data/${id}.json.gz`;
        if (!data || !existsSync(data)) return next();
        server
          .ssrLoadModule("/src/core/places/place.ts")
          .then((m) => {
            const place = m as typeof import("./src/core/places/place");
            const { bytes } = place.placeTimber(place.decodePlaceFile(new Uint8Array(readFileSync(data))));
            res.setHeader("Content-Type", "application/octet-stream");
            res.end(bytes);
          })
          .catch(next);
      });
    },
  };
}

export default defineConfig({
  base: process.env.DGM_BASE ?? "/dam-good-maps/",
  plugins: [preact(), placesDevServer()],
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
        credits: fileURLToPath(new URL("./real-places/credits/index.html", import.meta.url)),
      },
    },
  },
});
