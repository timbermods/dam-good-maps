// M9a review set, part 2 (PLAN §20 D252 (2)): one image per theme from `sheet.ts`'s own comparison
// page (`npm run sheet -- --compare main`), so the old and new versions of each seed sit side by
// side, as the tool already lays them out (each figure a `.pair`: the compared version on the left,
// this checkout on the right).
//
//   npx tsx investigation/m9a-review/capture-compare.ts <sheet-html> [--out investigation/m9a-review]
//
// Screenshots each theme's <section> from the sheet page (a local file, no server needed) and
// re-compresses it to a JPEG under 1 MB (quality steps down until it fits).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";

const html = process.argv[2];
if (!html || !existsSync(html)) throw new Error("usage: capture-compare.ts <sheet-html> [--out dir]");
const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const OUT = resolve(arg("out", "investigation/m9a-review"));

async function main(): Promise<void> {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    await page.goto(`file://${resolve(html).replace(/\\/g, "/")}`);
    const sections = page.locator("section");
    const n = await sections.count();
    for (let i = 0; i < n; i++) {
      const s = sections.nth(i);
      const theme = (await s.locator("h2").innerText()).trim();
      const slug = theme.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      let quality = 85;
      let buf: Buffer;
      for (;;) {
        buf = await s.screenshot({ type: "jpeg", quality });
        if (buf.length <= 1_000_000 || quality <= 30) break;
        quality -= 15;
      }
      const file = join(OUT, `comparison-${slug}.jpg`);
      writeFileSync(file, buf);
      console.log(`${file}: ${buf.length} bytes (quality ${quality})`);
    }
  } finally {
    await browser.close();
  }
}

void main();
