import { expect, type Page } from '@playwright/test';

// These are controlled-latency reproductions, not claims of a successful player/Chrome run.
// Hold one existing Comlink reply, preserving all worker operations and their ordering.
// Release explicitly; there are no delays, speed assertions or timing gates.
export async function open(page: Page) {
  await page.addInitScript(() => {
    // Two cores disables extra water-strip helpers: generator + checks + start checker +
    // possible background generator, one renderer and one UI stay within six execution lanes.
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 2 });
    const gate = { method: '', armed: false, held: false, id: '', replies: [] as (() => void)[], release() {
      gate.armed = false;
      const replies = gate.replies.splice(0);
      gate.held = false;
      replies.forEach((f) => f());
    } };
    (window as any).__pageHunt = gate;
    const Native = window.Worker;
    window.Worker = class extends Native {
      override postMessage(message: any, options?: any) {
        const method = message?.path?.join('.');
        const match = method === gate.method || (gate.method === 'brush' &&
          ['apply', 'strokeClearing'].includes(method) && message.argumentList?.[0]?.op === 'brush');
        if (gate.armed && !gate.id && message?.type === 'APPLY' && match)
          gate.id = message.id;
        super.postMessage(message, options);
      }
      override addEventListener(type: any, listener: any, options?: any) {
        if (type !== 'message' || typeof listener !== 'function') return super.addEventListener(type, listener, options);
        super.addEventListener(type, (event: MessageEvent) => {
          if (gate.armed && event.data?.id === gate.id) {
            gate.held = true;
            gate.replies.push(() => listener.call(this, event));
          } else listener.call(this, event);
        }, options);
      }
    };
  });
  await page.goto('./#s=4242&z=96&d=n&t=riverValley');
  await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d);
  await page.waitForFunction(() => window.dgm!.kept!(window.dgmEditor!.info().version));
  await page.getByRole('button', { name: 'Top-down', exact: true }).click();
}
export async function arm(page: Page, method: string) {
  await page.evaluate((m) => Object.assign((window as any).__pageHunt, { method: m, armed: true, held: false, id: '' }), method);
}
export const held = (page: Page) => page.waitForFunction(() => (window as any).__pageHunt.held);
export const release = (page: Page) => page.evaluate(() => (window as any).__pageHunt.release());
export async function lower(page: Page, x: number, y: number) {
  const button = page.getByRole('button', { name: 'Lower brush (2)', exact: true });
  if (await button.getAttribute('aria-pressed') !== 'true') await button.click();
  await expect.poll(() => page.evaluate(() => window.dgm3d!.renderer.tool !== null)).toBe(true);
  const at = await page.evaluate(([x, y]) => {
    const r = window.dgm3d!.renderer;
    r.setView({ target: [x + .5, r.getView().target[1], -(y + .5)] });
    return window.dgmEditor!.tileToClient(x, y);
  }, [x, y]);
  // Confirm the camera has applied the view before projecting the click.
  const point = await page.evaluate(([x,y]) => window.dgmEditor!.tileToClient(x,y), [x,y]);
  await page.mouse.click(point.x, point.y);
  void at;
}
