// Evidence only: observe shared placement without changing any choice or return value.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
export function install(out: string): void {
  const baseline = require('../../src/core/resources/baseline');
  const pads = require('../../src/core/land/minePads');
  const original = baseline.pickMineSite, room = pads.roomMap;
  const events: unknown[] = [];
  pads.roomMap = (...args: any[]) => {
    const result = room(...args); events.push({kind:'roomMap', want:args[3].want, lo:args[3].lo, allowed:Array.from(result).filter(Boolean).length});
    writeFileSync(join(out,'trace.json'),JSON.stringify(events,null,2)); return result;
  };
  baseline.pickMineSite = (...args: any[]) => {
    const result = original(...args);
    events.push({kind:'mine', root:args[0].root, landRoot:args[0].landRoot, band:args[2], result});
    writeFileSync(join(out,'trace.json'),JSON.stringify(events,null,2)); return result;
  };
}
