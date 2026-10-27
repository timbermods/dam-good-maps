import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { openYourMaps } from '@saving-src/platform/yourMaps';
import { YourMapsSaver } from '@saving-src/core/library/saver';
import { page, row, bytes, info, deferred, settle } from './harness';
afterEach(() => vi.useRealTimers());
const worker = (n = 1) => ({ project: async () => ({ bytes: bytes(n), name: 'a', version: 1 }), setName: async (name: string) => ({ result: { ok: true, name }, info: info(name) }), openProject: async () => ({ info: info() }) });

describe('reproduced failures: assertions describe the safe outcome', () => {
  it('F1 edits and new maps warn before reload while waiting for a save', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const s = openYourMaps(new IDBFactory());
    await s.put(row('a'), bytes(1));
    const p = page(s, worker(2));
    p.enterEditor({ info: info() }, { entry: (await s.list())[0] });
    p.onEditorChange(info('a', 2));
    // Install effects except startup. No browser event listener exists in baseline.
    p.effects.filter((f: Function) => !f.toString().includes('yourMaps.list')).forEach((f: Function) => f());
    const e = { preventDefault: vi.fn(), returnValue: undefined };
    p.fire('beforeunload', e);
    expect.soft(e.preventDefault).toHaveBeenCalled();
    expect(await s.project('a')).toEqual(bytes(1));
    const fresh = page(s, worker(3));
    fresh.enterEditor({ info: info('fresh') }, { kind: 'import' });
    fresh.effects.filter((f: Function) => !f.toString().includes('yourMaps.list')).forEach((f: Function) => f());
    const newEvent = { preventDefault: vi.fn(), returnValue: undefined };
    fresh.fire('beforeunload', newEvent);
    expect(newEvent.preventDefault).toHaveBeenCalled();
    await fresh.saver.flush(); await p.saver.flush();
  });
  it('F2 switching maps cannot lose a snapshot queued behind an earlier storage write', async () => {
    const s = openYourMaps(new IDBFactory());
    await s.put(row('a'), bytes(1)); await s.put(row('b'), bytes(9));
    const list = await s.list(), hold = deferred<void>();
    let first = true, current = { name: 'a', version: 2, bytes: bytes(2) };
    const store = { ...s, put: async (...args: any[]) => { if (first) { first = false; await hold.promise; } return (s.put as any)(...args); } };
    const p = page(store, { ...worker(), project: async () => current });
    p.enterEditor({ info: info() }, { entry: list.find(e => e.id === 'a') });
    p.onEditorChange(info('a', 2));
    const saving = p.saver.flush(); await settle();
    current = { name: 'a', version: 3, bytes: bytes(3) };
    p.onEditorChange(info('a', 3));
    // The second debounce has fired: its callback now waits behind write 1, with no pending timer.
    const queued = p.saver.flush(); await settle();
    let replaced = false;
    const replacing = p.replacing(async () => {
      replaced = true; current = { name: 'b', version: 1, bytes: bytes(9) };
      p.enterEditor({ info: info('b') }, { entry: list.find(e => e.id === 'b') });
    });
    await settle(); const early = replaced;
    hold.resolve(); await saving; await queued; await replacing;
    expect(await s.project('a')).toEqual(bytes(3));
    expect(await s.project('b')).toEqual(bytes(9)); expect(early).toBe(false);
  });
  it('F3 autosave migration retains the source when Your maps cannot commit', async () => {
    const storage = { load: async () => ({ bytes: bytes(7) }), clear: vi.fn(async () => {}) };
    const s = { list: async () => [], put: async () => ({ ok: false, reason: 'full' }) };
    const p = page(s, worker(7), {}, storage);
    p.effects.find((f: Function) => f.toString().includes('const list = await yourMaps.list'))!();
    await settle();
    expect(storage.clear).not.toHaveBeenCalled();
    // In baseline the only remaining copy is an unsaved worker and a 4s timer.
  });
  it('F4 two tabs cannot overwrite the first tab’s saved edit', async () => {
    const factory = new IDBFactory(), a = openYourMaps(factory), b = openYourMaps(factory);
    await a.put(row('a'), bytes(1));
    const oldA = (await a.list())[0], oldB = (await b.list())[0];
    const sa = new YourMapsSaver(a), sb = new YourMapsSaver(b);
    sa.changed('a', () => ({ entry: { ...oldA, revision: 2 }, project: bytes(2) }));
    sb.changed('a', () => ({ entry: { ...oldB, revision: 2 }, project: bytes(3) }));
    await sa.flush(); await sb.flush();
    expect(await a.project('a')).toEqual(bytes(2));
  });
  it('F4 a second tab’s stale save cannot resurrect a deleted map', async () => {
    const factory = new IDBFactory(), a = openYourMaps(factory), b = openYourMaps(factory);
    await a.put(row('a'), bytes(1));
    const old = (await b.list())[0];
    const saver = new YourMapsSaver(b);
    saver.changed('a', () => ({ entry: { ...old, revision: 2 }, project: bytes(2) }));
    await a.remove('a'); await saver.flush();
    expect(await a.project('a')).toBeNull();
  });
  it('F4 a pending save cannot undo another tab’s closed-map rename', async () => {
    const factory = new IDBFactory(), a = openYourMaps(factory), b = openYourMaps(factory);
    await a.put(row('a'), bytes(1));
    const old = (await b.list())[0];
    const saver = new YourMapsSaver(b);
    saver.changed('a', () => ({ entry: old, project: bytes(2) }));
    await a.rename('a', 'Renamed'); await saver.flush();
    expect((await a.list())[0].name).toBe('Renamed');
  });
  it('F5 a newly failed save blocks replacement before the only edited copy closes', async () => {
    const p = page({ list: async () => [], put: async () => ({ ok: false, reason: 'full' }) }, worker(2));
    p.enterEditor({ info: info() }, { entry: row('a') });
    p.onEditorChange(info('a', 2));
    const load = vi.fn(async () => 'new map');
    await p.replacing(load).catch(() => {});
    expect(load).not.toHaveBeenCalled();
    expect(p.keeping.current).toBe(false);
  });
});

it('F5 Generate does not replace the open worker after its pre-save fails', async () => {
  const generate = vi.fn(async () => ({ passed: false, attempts: 1 }));
  const p = page({ list: async () => [], put: async () => ({ ok: false, reason: 'full' }) }, { ...worker(2), generate }, { session: info() });
  p.enterEditor({ info: info() }, { entry: row('a') });
  await p.run({ seed: 2 });
  expect(generate).not.toHaveBeenCalled();
});
it('F3 successful migration also waits for the commit before clearing recovery', async () => {
  const hold = deferred<any>(), storage = { load: async () => ({ bytes: bytes(7) }), clear: vi.fn(async () => {}) };
  const p = page({ list: async () => [], put: () => hold.promise }, worker(7), {}, storage);
  p.effects.find((f: Function) => f.toString().includes('const list = await yourMaps.list'))!(); await settle();
  const early = storage.clear.mock.calls.length;
  hold.resolve({ ok: true }); await p.saver.flush(); await settle();
  expect(early).toBe(0); expect(storage.clear).toHaveBeenCalledOnce();
});
