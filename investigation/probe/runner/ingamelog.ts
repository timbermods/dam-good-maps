// Reads the in-game log (docs/archive/ingame-log.md since the document prune, D390; docs/ingame-log.md
// before): every check row of every milestone table, with its status and files.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './paths';

export interface LogRow {
  section: string;
  id: string;
  todo: string;
  expected: string;
  files: string;
  status: string;
  pending: boolean;
}

export const INGAME_LOG = [join(REPO, 'docs', 'archive', 'ingame-log.md'), join(REPO, 'docs', 'ingame-log.md')].find((p) => existsSync(p)) ?? join(REPO, 'docs', 'archive', 'ingame-log.md');

export function readIngameLog(path = INGAME_LOG): LogRow[] {
  const rows: LogRow[] = [];
  let section = '';
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const h = /^## (.+)$/.exec(line);
    if (h) {
      section = h[1].trim();
      continue;
    }
    if (!line.startsWith('|') || /^\|\s*-/.test(line) || /^\|\s*Check\s*\|/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 5) continue;
    const [id, todo, expected, files, status] = cells;
    rows.push({ section, id, todo, expected, files, status, pending: /^pending\b/i.test(status) });
  }
  return rows;
}
