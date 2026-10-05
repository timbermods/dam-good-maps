import { IDBFactory, IDBTransaction } from 'fake-indexeddb';
const root = process.env.SAVING_FIXED ? './local/product/src' : './local/base/src';
const { openYourMaps } = await import(new URL(`${root}/platform/yourMaps.ts`, import.meta.url).href);
const errors: string[] = [];
process.on('unhandledRejection', e => errors.push(String(e)));
const factory = new IDBFactory();
const s = openYourMaps(factory);
const entry = { id: 'quota', name: 'before', kind: 'import', revision: 1, bytes: 1, createdAt: '2026-10-04', editedAt: '2026-10-04', starred: false, thumbnail: null, savedToTimberborn: null, size: { w: 8, h: 8 } };
await s.put(entry, new Uint8Array([1]));
// Inject an asynchronous request failure at the project write, after the entry write succeeded.
// Keep the real request dispatch, abort and rollback machinery. fake-indexeddb has no disk quota.
const original = (IDBTransaction.prototype as any)._execRequestAsync;
let injected = false;
(IDBTransaction.prototype as any)._execRequestAsync = function(args: any) {
  if (!injected && args.source?.name === 'projects' && args.operation.name.includes('storeRecord')) {
    injected = true;
    args = { ...args, operation: () => { throw new DOMException('Injected full storage', 'QuotaExceededError'); } };
  }
  return original.call(this, args);
};
const result = await s.put({ ...entry, revision: 2, name: 'after' }, new Uint8Array([2]));
(IDBTransaction.prototype as any)._execRequestAsync = original;
const list = await s.list(), project = await s.project('quota');
await new Promise(r => setImmediate(r));
console.log(JSON.stringify({ result, entry: list[0], project: Array.from(project ?? []), injected, unhandled: errors }));
