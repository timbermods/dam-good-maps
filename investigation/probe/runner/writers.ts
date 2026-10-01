// Before a batch plans a group whose maps are made outside the repository, the runner writes that group's maps with
// the group's own writer (catalog.ts GROUP_WRITERS; tools/probe-maps/group.ts): every map is built now, compared with
// the file on disk by its sha256 and rewritten if it differs, so a stale map is never planned (Kyler, 2026-09-30). The
// plan then lists the maps written (file, size, sha256), and the launch code covers exactly those bytes.
import { describeWrite, writeGroup, type GroupWrite, type GroupWriter } from '../../../tools/probe-maps/group';
import { GROUP_WRITERS } from './catalog';

export type Writers = Record<string, () => GroupWriter>;

/** The groups a selection needs written: `--group`'s own, or the groups the `--only` ids belong to. */
export function groupsToWrite(only?: string, group?: string, writers: Writers = GROUP_WRITERS): string[] {
  if (group !== undefined) return writers[group] ? [group] : [];
  if (!only) return [];
  const ids = new Set(only.split(',').map((x) => x.trim()));
  return Object.keys(writers).filter((g) => writers[g]().ids.some((id) => ids.has(id)));
}

/** Writes each group's maps (or finds them current); a writer that fails refuses the whole plan, with its reason. */
export function writeGroups(groups: readonly string[], log: (line: string) => void = () => {}, writers: Writers = GROUP_WRITERS): GroupWrite[] {
  return groups.map((g) => {
    let w: GroupWriter;
    try {
      w = writers[g]();
    } catch (e) {
      throw new Error(`the ${g} writer could not be loaded: ${(e as Error).message}. Nothing was planned.`);
    }
    log(`writing the ${g} maps (${w.tool})`);
    try {
      const done = writeGroup(w, { log: (l) => log(`  ${l}`) });
      for (const l of describeWrite(done)) log(l);
      return done;
    } catch (e) {
      throw new Error(`the ${g} maps could not be written: ${(e as Error).message}. Nothing was planned.`);
    }
  });
}

/** What the plan records of the maps written: enough to tie a launch code to their exact bytes. */
export function writtenForPlan(w: readonly GroupWrite[]): { group: string; dir: string; files: { file: string; size: [number, number]; bytes: number; sha256: string; status: 'written' | 'current' }[] }[] {
  return w.map((g) => ({ group: g.group, dir: g.dir, files: g.files.map((f) => ({ file: f.file, size: f.size, bytes: f.bytes, sha256: f.sha256, status: f.status })) }));
}
