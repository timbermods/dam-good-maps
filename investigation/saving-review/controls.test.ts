import { execFileSync } from 'node:child_process';
import { IDBFactory } from 'fake-indexeddb';
import { expect, it, vi } from 'vitest';
import { openYourMaps } from '@saving-src/platform/yourMaps';
import { YourMapsSaver } from '@saving-src/core/library/saver';
import { page, row, bytes, info, deferred, settle } from './harness';
const worker = () => ({ project: async () => ({ bytes: bytes(2), name: 'a', version: 2 }), openProject: async () => ({ info: info('b') }), setName: async (name: string) => ({ result: { ok: true, name }, info: info(name, 2) }) });
it('control: deleting the open map with a pending save does not resurrect it in this tab', async () => {
  const s = openYourMaps(new IDBFactory());
  await s.put(row('a'), bytes(1)); await s.put(row('b'), bytes(9));
  const maps = await s.list();
  const p = page(s, worker(), { maps });
  p.enterEditor({ info: info() }, { entry: maps.find(e => e.id === 'a') });
  p.onEditorChange(info('a', 2));
  p.deleteMap('a'); p.values.confirm.onYes(); await settle();
  expect(await s.project('a')).toBeNull();
  expect(await s.project('b')).toEqual(bytes(9));
});
it('control: two tabs saving different ids keep both projects', async () => {
  const factory = new IDBFactory(), a = openYourMaps(factory), b = openYourMaps(factory);
  const sa = new YourMapsSaver(a), sb = new YourMapsSaver(b);
  sa.changed('a', () => ({ entry: row('a'), project: bytes(2) }));
  sb.changed('b', () => ({ entry: row('b'), project: bytes(9) }));
  await Promise.all([sa.flush(), sb.flush()]);
  expect(await a.project('a')).toEqual(bytes(2)); expect(await b.project('b')).toEqual(bytes(9));
});
it('control: rename of the open map while a snapshot is running reaches the final project', async () => {
  const s = openYourMaps(new IDBFactory()); await s.put(row('a'), bytes(1));
  const hold = deferred<any>(); let named = false;
  const api = { ...worker(), project: () => named ? Promise.resolve({ bytes: new TextEncoder().encode(JSON.stringify({ meta: { name: 'Renamed' } })), name: 'Renamed', version: 2 }) : hold.promise, setName: async (name: string) => { named = true; return { result: { ok: true, name }, info: info(name, 2) }; } };
  const p = page(s, api); p.enterEditor({ info: info() }, { entry: (await s.list())[0] });
  p.onEditorChange(info('a', 2)); const writing = p.saver.flush(); await settle();
  await p.rename('Renamed');
  hold.resolve({ bytes: bytes(2), name: 'a', version: 2 }); await writing; await p.saver.flush();
  expect((await s.list())[0].name).toBe('Renamed');
  expect(JSON.parse(new TextDecoder().decode((await s.project('a'))!)).meta.name).toBe('Renamed');
});
it('control: closed-map rename survives a different map’s pending save', async () => {
  const s = openYourMaps(new IDBFactory()); await s.put(row('a'), bytes(1)); await s.put(row('b'), bytes(9));
  const p = page(s, worker(), { maps: await s.list() }); p.enterEditor({ info: info() }, { entry: (await s.list()).find(e => e.id === 'a') });
  p.onEditorChange(info('a', 2)); await p.renameMap('b', 'Renamed'); await p.saver.flush();
  expect((await s.list()).find(e => e.id === 'b')?.name).toBe('Renamed'); expect(await s.project('b')).toEqual(bytes(9));
});
it('control: quota failure partway through the transaction preserves the prior entry and project', () => {
  const result = JSON.parse(execFileSync(process.execPath, ['--import', 'tsx', 'investigation/saving-review/quota-probe.ts'], { encoding: 'utf8' }));
  expect(result.injected).toBe(true); expect(result.result).toEqual({ ok: false, reason: 'full' });
  expect(result.entry.name).toBe('before'); expect(result.entry.revision).toBe(1); expect(result.project).toEqual([1]);
});
it('control: migration clears autosave only after a successful commit', async () => {
  const hold = deferred<any>(), storage = { load: async () => ({ bytes: bytes(7) }), clear: vi.fn(async () => {}) };
  const s = { list: async () => [], put: () => hold.promise };
  const p = page(s, worker(), {}, storage);
  p.effects.find((f: Function) => f.toString().includes('const list = await yourMaps.list'))!(); await settle();
  hold.resolve({ ok: true }); await p.saver.flush(); await settle();
  expect(storage.clear).toHaveBeenCalledOnce();
});
