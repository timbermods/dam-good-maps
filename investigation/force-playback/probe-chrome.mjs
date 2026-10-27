import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const local = new URL('./local/', import.meta.url);
await mkdir(local, { recursive: true });
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--renderer-process-limit=1', '--num-raster-threads=2'], ignoreDefaultArgs: ['--enable-unsafe-swiftshader'] });
  const cdp = await browser.newBrowserCDPSession();
  const gpu = await cdp.send('SystemInfo.getInfo');
  await writeFile(new URL('gpu.json', local), JSON.stringify(gpu, null, 2));
  console.log(JSON.stringify(gpu.gpu));
} catch (e) {
  await writeFile(new URL('chrome-error.txt', local), String(e));
  console.error(String(e));
  process.exitCode = 1;
} finally { await browser?.close(); }
