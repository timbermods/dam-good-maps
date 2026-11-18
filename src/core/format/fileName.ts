// The name a map's files get: the map's own name, kept as written (D443, amended 2026-11-18). Case, spaces and every
// letter stay; only what a file name can't hold on Windows, macOS or Linux is replaced, so "Old Loop Lakelands" is
// saved as "Old Loop Lakelands.timber" and listed in the game under the name the player sees in the header. A name
// that leaves nothing a file can be called is refused with a one-line reason, never silently replaced.

/** The longest stem kept, in characters and in UTF-8 bytes: a file name holds 255 bytes on Linux and macOS, and a whole
 *  path 260 characters on Windows; this leaves room for ".damgoodmaps.json", a "-2" and the Maps folder's path. */
export const MAX_FILE_STEM = 150;
const MAX_STEM_BYTES = 200;

/** Windows' device names: a file can't be called one of these, whatever follows the first dot. */
const RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$/i;

export type FileStem = { ok: true; stem: string } | { ok: false; reason: string };

/** The file stem (the name without ".timber") a map called `name` is saved under: `\ / : * ? " < > |` and control
 *  characters become a space (with the spaces around them, one space in all); dots and spaces at either end go (a
 *  trailing one is refused by Windows, a leading dot hides the file on macOS and Linux); a trailing ".timber" typed
 *  with the name goes; a Windows device name (CON, NUL, COM1…) gets " map" after it; a stem past 150 characters (or
 *  200 UTF-8 bytes) is cut there. A name with nothing left is refused. */
export function fileStemOf(name: string): FileStem {
  let s = name
    .replace(/\s*[\\/:*?"<>|\u0000-\u001f\u007f]+\s*/g, " ")
    .replace(/\.timber\s*$/i, "")
    .replace(/^[\s.]+|[\s.]+$/g, "");
  if (!s) return { ok: false, reason: 'A file can\'t be named with only dots, spaces or \\ / : * ? " < > |: use letters or digits' };
  s = cut(s);
  const dot = s.indexOf(".");
  const head = dot < 0 ? s : s.slice(0, dot);
  if (RESERVED.test(head.trimEnd())) s = `${head.trimEnd()} map${dot < 0 ? "" : s.slice(dot)}`;
  return { ok: true, stem: s };
}

/** The .timber file's name for a map called `name`; throws the one-line reason when the name makes none (a name the
 *  core keeps always makes one: `cleanMapName` refuses the rest). */
export function mapFileName(name: string): string {
  return `${stemOrThrow(name)}.timber`;
}

/** The project file's name for a map called `name`, beside its .timber. */
export function mapProjectFileName(name: string): string {
  return `${stemOrThrow(name)}.damgoodmaps.json`;
}

function stemOrThrow(name: string): string {
  const r = fileStemOf(name);
  if (!r.ok) throw new Error(r.reason);
  return r.stem;
}

/** At most MAX_FILE_STEM characters and MAX_STEM_BYTES UTF-8 bytes, cut between characters, never ending in a dot or space. */
function cut(s: string): string {
  const chars = [...s];
  if (chars.length <= MAX_FILE_STEM && new TextEncoder().encode(s).length <= MAX_STEM_BYTES) return s;
  let out = "";
  let bytes = 0;
  for (const c of chars.slice(0, MAX_FILE_STEM)) {
    const b = new TextEncoder().encode(c).length;
    if (bytes + b > MAX_STEM_BYTES) break;
    out += c;
    bytes += b;
  }
  return out.replace(/[\s.]+$/, "");
}
