import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
export async function openDemo(viewport = { width: 1440, height: 980 }) {
  const software = process.argv.includes('--software');
  const browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: software ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-vulkan'] : [] });
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.setDefaultTimeout(300000);
  const errors = [];
  page.on('pageerror', e => { errors.push(String(e)); console.error(e); });
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('favicon')) { errors.push(m.text()); console.error(m.text()); } });
  const { url } = JSON.parse(readFileSync(new URL('./local/server.json', import.meta.url)));
  await page.goto(url);
  await page.waitForFunction(() => window.maplook3?.ready);
  await page.evaluate(() => window.maplook3.freeze());
  return { browser, page, errors };
}
