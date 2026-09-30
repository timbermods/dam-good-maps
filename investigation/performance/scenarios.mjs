export const forces = [
  { name: 'Carve', key: '7', gesture: 'path' },
  { name: 'Craterize', key: '8', gesture: 'click' },
  { name: 'Quake', key: '9', gesture: 'path' },
  { name: 'Erupt', key: '0', gesture: 'click' },
  { name: 'Glaciate', key: '-', gesture: 'glacier' },
];
export const cases = [...forces.flatMap(force => ['fast', 'watch'].map(speed => ({ id: `${force.name.toLowerCase()}-${speed}`, kind: 'force', force, speed }))),
  { id: 'brush-large', kind: 'brush' },
  ...['raise', 'lower', 'flatten', 'cut', 'fill', 'depth', 'delete'].map(action => ({ id: `select-${action}`, kind: 'select', action })),
  { id: 'orbit-zoom-during-force', kind: 'orbit' }, { id: 'abuse', kind: 'abuse' }];
const client = (page, point) => page.evaluate(([x, y]) => window.dgmEditor.tileToClient(x, y), point);
export async function drag(page, a, b) {
  const from = await client(page, a), to = await client(page, b);
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  for (let k = 1; k <= 16; k++) {
    await page.mouse.move(from.x + (to.x - from.x) * k / 16, from.y + (to.y - from.y) * k / 16);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}
export async function idle(page, { afterHistory = false } = {}) {
  await page.waitForFunction(() => window.dgmEditor && !window.dgmEditor.force() && !window.dgmEditor.pendingTerrain(), null, { timeout: 180000 });
  await page.evaluate(() => window.dgmEditor.idle());
  // Treat the existing settle as a black box. Its completion and the presentation's completion
  // are different facts. A stuck status after the worker finishes is evidence, not an endless wait.
  await page.evaluate(() => Promise.race([
    window.dgmEditor.worker.whenWaterSettles(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Water black box did not finish within 180s')), 180000)),
  ]));
  if (afterHistory) {
    await page.waitForFunction(() => !window.dgm3d.renderer.waterQueue?.size &&
      ![...document.querySelectorAll('.checks-dot')].some(e => /Checking|Settling/.test(e.getAttribute('title') ?? '')),
      null, { timeout: 180000 });
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      const status = document.querySelector('.water-bar .bar-status')?.textContent;
      if (status?.includes('0%')) window.performanceHarness.note({ kind: 'outside-scope-interface-status', status,
        checks: document.querySelector('.checks-dot')?.getAttribute('title'), workerSettled: true,
        waterQueue: window.dgm3d.renderer.waterQueue?.size });
    });
    return;
  }
  await page.waitForFunction(() => {
    const r = window.dgm3d.renderer;
    return !r.waterQueue?.size && [...document.querySelectorAll('.water-bar')].some(e => e.textContent.includes('Water settled')) &&
      ![...document.querySelectorAll('.checks-dot')].some(e => /Checking|Settling/.test(e.getAttribute('title') ?? ''));
  }, null, { timeout: 15000 }).catch(async () => {
    await page.evaluate(() => {
      const finding = { kind: 'presentation-not-settled-after-worker',
        status: document.querySelector('.water-bar .bar-status')?.textContent,
        checks: document.querySelector('.checks-dot')?.getAttribute('title'), waterQueue: window.dgm3d.renderer.waterQueue?.size };
      if (finding.status?.includes('0%') && !/Checking|Settling/.test(finding.checks ?? '') && !finding.waterQueue) {
        window.performanceHarness.note({ ...finding, kind: 'outside-scope-interface-status', workerSettled: true });
      } else window.performanceHarness.fault(finding);
    });
  });
  await page.waitForTimeout(1200);
}
export async function setup(page, url, size, look) {
  if (look !== 'clean') throw new Error(`Unsupported requested look '${look}': base has no High renderer/selector`);
  await page.goto(`${url}/#s=4242&z=${size}&d=n&t=highlands`);
  await page.getByText(/All \d+ checks passed/).waitFor({ timeout: 180000 });
  await page.getByRole('button', { name: 'Refine this map' }).click();
  await page.waitForFunction(() => window.dgmEditor && window.dgm3d && window.performanceHarness, null, { timeout: 180000 });
  await page.bringToFront();
  await page.getByRole('group', { name: 'Forces', exact: true }).getByRole('button', { name: 'Craterize (8)', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Top-down', exact: true }).click();
  await idle(page);
  return page.evaluate(() => {
    const m = window.dgm3d.renderer.mapState(), points = [];
    for (let y = Math.round(m.H * 0.2); y < m.H * 0.8; y += 4)
      for (let x = Math.round(m.W * 0.2); x < m.W * 0.8; x += 4) {
        const p = window.dgmEditor.tileToClient(x, y);
        if (document.elementFromPoint(p.x, p.y)?.tagName === 'CANVAS') points.push({ at: [x, y], height: m.heights[y * m.W + x] });
      }
    points.sort((a, b) => b.height - a.height);
    if (!points.length) throw new Error('No unobscured terrain');
    const high = points[0].at;
    const low = points.find(p => Math.hypot(p.at[0] - high[0], p.at[1] - high[1]) > m.W / 3)?.at ?? points.at(-1).at;
    const mid = points.reduce((a, b) => Math.hypot(b.at[0] - m.W / 2, b.at[1] - m.H / 2) < Math.hypot(a.at[0] - m.W / 2, a.at[1] - m.H / 2) ? b : a).at;
    return { high, low, mid };
  });
}
async function setForce(page, f, speed) {
  const watch = page.getByRole('button', { name: 'Watch', exact: true });
  if ((await watch.getAttribute('aria-pressed') === 'true') !== (speed === 'watch')) await watch.click();
  const forceButton = page.getByRole('group', { name: 'Forces', exact: true }).getByRole('button', { name: `${f.name} (${f.key})`, exact: true });
  if (await forceButton.getAttribute('aria-pressed') !== 'true') await forceButton.click();
  const row = page.getByRole('group', { name: `${f.name} options`, exact: true });
  await row.waitFor();
  if (await row.getByRole('slider').count() === 0) throw new Error('Force has no sliders');
  // One event at a time: batching Power and Size input events in one task can replay a stale
  // options object and reset Power. High Power uses the force's natural Auto size.
  await row.getByRole('slider', { name: 'Power', exact: true }).evaluate(e => {
    e.value = '100'; e.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForFunction(name => document.querySelector(`[aria-label="${name} options"] input[aria-label="Power"]`)?.value === '100', f.name);
}
async function gesture(page, f, spots) {
  if (f.gesture === 'path') return drag(page, spots.high, spots.low);
  if (f.gesture === 'glacier') {
    // A cirque at high land, no aimed glacier forced uphill.
    const p = await client(page, spots.high); return page.mouse.click(p.x, p.y);
  }
  const p = await client(page, spots.mid);
  const target = await page.evaluate(p => ({ canvas: document.elementFromPoint(p.x, p.y) === window.dgm3d.renderer.canvas, tool: !!window.dgm3d.renderer.tool }), p);
  if (!target.canvas || !target.tool) throw new Error(`Gesture cannot reach active force: ${JSON.stringify(target)}`);
  await page.mouse.move(p.x + 3, p.y); await page.mouse.move(p.x, p.y);
  return page.mouse.click(p.x, p.y);
}
export async function act(page, c, spots, seed = 4242) {
  switch (c.kind) {
    case 'force':
      await setForce(page, c.force, c.speed); await gesture(page, c.force, spots); break;
    case 'brush':
      await page.keyboard.press('1');
      await page.getByRole('group', { name: 'Raise options', exact: true }).getByRole('slider', { name: 'Size', exact: true }).evaluate(e => { e.value = e.max; e.dispatchEvent(new Event('input', { bubbles: true })); });
      await drag(page, spots.high, spots.low); break;
    case 'select': {
      const select = page.getByRole('button', { name: 'Select (M)', exact: true });
      if (await select.getAttribute('aria-pressed') !== 'true') await select.click();
      await page.keyboard.press('Control+a');
      const row = page.getByRole('group', { name: 'Selection', exact: true });
      if (c.action === 'raise') await page.keyboard.press('ArrowUp');
      else if (c.action === 'lower') await page.keyboard.press('ArrowDown');
      else if (c.action === 'delete') {
        await row.getByRole('button', { name: 'Delete', exact: true }).click();
        await page.getByRole('menuitem', { name: /top level|ground/i }).first().click();
      } else if (c.action === 'depth') {
        await row.getByRole('spinbutton', { name: 'Max water depth', exact: true }).fill('1');
        await row.getByRole('button', { name: 'Max water depth', exact: true }).click();
      } else {
        await row.getByRole('spinbutton', { name: 'Level', exact: true }).fill(c.action === 'fill' ? '10' : '2');
        await row.getByRole('button', { name: { flatten: 'Flatten', cut: 'Cut down', fill: 'Fill up' }[c.action], exact: true }).click();
      }
      break;
    }
    case 'orbit': {
      await setForce(page, forces[1], 'watch'); await gesture(page, forces[1], spots);
      await page.evaluate(() => {
        const r = window.dgm3d.renderer; r.setMode('orbit');
        const start = performance.now(), initial = r.getView();
        function step(t) {
          r.setView({ yaw: initial.yaw + (t - start) / 3000 }); r.zoom(1 + Math.sin(t / 300) * 0.005);
          if (window.dgmEditor.force()) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      });
      break;
    }
    case 'abuse': {
      let rng = seed >>> 0;
      const random = () => ((rng = (1664525 * rng + 1013904223) >>> 0) / 2 ** 32);
      // New pointer gesture during Watch, ten undo keys without waiting, then successive forces.
      await setForce(page, forces[1], 'watch'); await gesture(page, forces[1], spots);
      await page.waitForTimeout(50 + random() * 300); await gesture(page, forces[1], spots);
      for (let k = 0; k < 10; k++) await page.keyboard.press('Control+z');
      await idle(page, { afterHistory: true });
      for (let k = 0; k < 5; k++) {
        const f = forces[k]; await setForce(page, f, k % 2 ? 'fast' : 'watch'); await gesture(page, f, spots);
        await page.waitForTimeout(random() * 650);
        await page.keyboard.press(random() < 0.5 ? 'Escape' : 'Control+z');
        await idle(page, { afterHistory: true });
      }
      break;
    }
  }
}
export async function snapshot(page) {
  await page.evaluate(() => window.performanceHarness.pauseMeasurement('byte-snapshot-after-idle'));
  try { return await page.evaluate(async () => {
    const { renderer: r } = window.dgm3d;
    const now = await window.dgmEditor.worker.terrainNow();
    const encode = value => {
      if (ArrayBuffer.isView(value)) return { type: value.constructor.name, bytes: Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
      if (value instanceof Map) return [...value].map(([k, v]) => [k, encode(v)]);
      if (Array.isArray(value)) return value.map(encode);
      if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(k => !['ms', 'elapsed', 'timing'].includes(k)).map(k => [k, encode(value[k])]));
      return value;
    };
    return { worker: encode(now), displayed: encode({ heights: r.map.heights, water: r.map.water, entities: r.map.entities }),
      features: encode(window.dgmEditor.info().features), history: window.dgmEditor.info().history.map(({ label, applied }) => ({ label, applied })),
      strokeMismatches: window.dgmEditor.strokeMismatches() };
  }); } finally { await page.evaluate(() => window.performanceHarness.resumeMeasurement()); }
}
