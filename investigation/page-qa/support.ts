import { type Page } from '@playwright/test';
export async function openEditor(page: Page, hash: string) {
  if (page.url() !== 'about:blank') await page.goto('about:blank');
  await page.goto(`./#${hash}`);
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 120_000 });
}
export async function openDrawer(page: Page) {
  const b = page.getByRole('button', { name: 'Map Generator', exact: true });
  if (await b.getAttribute('aria-pressed') !== 'true') await b.click();
  const p = page.locator('aside[aria-label="Map Generator"]'); await p.waitFor(); return p;
}
export const generateButton = (page: Page) => page.getByRole('form', { name: 'Settings' }).locator('button[type=submit]');
export async function openYourMaps(page: Page) {
  const b = page.getByRole('button', { name: 'Your maps', exact: true });
  if (await b.getAttribute('aria-pressed') !== 'true') await b.click();
  const p = page.getByRole('region', { name: 'Your maps', exact: true }); await p.waitFor(); return p;
}
