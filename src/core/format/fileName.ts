// The name a map's files get: the map's own name, kept as written (D443, amended 2026-11-18). Case, spaces and every
// letter stay; only what a file name can't hold on Windows, macOS or Linux is replaced, so "Old Loop Lakelands" is
// saved as "Old Loop Lakelands.timber" and listed in the game under the name the player sees in the header. A name
// that leaves nothing a file can be called is refused with a one-line reason, never silently replaced.

/** The longest stem kept, in characters and in UTF-8 bytes: a file name holds 255 bytes on Linux and macOS, and a whole
 *  path 260 characters on Windows; this leaves room for ".damgoodmaps.json", a " (2)" and the Maps folder's path. */
export const MAX_FILE_STEM = 150;
const MAX_STEM_BYTES = 200;

/** Windows' device names: a file can't be called one of these, whatever follows the first dot. */
const RESERVED = /^(con|prn|aux|nul|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³])$/i;

/** The marks that reverse how a name is drawn (embeddings, overrides, isolates, the left and right marks): a file named
 *  with one can show its end first, so they are removed outright, not replaced by a space. */
const BIDI = /[‪-‮⁦-⁩‎‏]/g;

export type FileStem = { ok: true; stem: string } | { ok: false; reason: string };

/** The file stem (the name without ".timber") a map called `name` is saved under: the marks that reverse a name's
 *  display go; `\ / : * ? " < > |` and control characters become a space (with the spaces around them, one space in
 *  all); dots and spaces at either end go (a trailing one is refused by Windows, a leading dot hides the file on macOS
 *  and Linux), and only then a trailing ".timber" typed with the name; a Windows device name (CON, NUL, COM1, CONIN$…)
 *  gets " map" after it; and a stem past 150 characters (or 200 UTF-8 bytes) is cut there, last of all, so the " map"
 *  stays. A name with nothing left is refused. */
export function fileStemOf(name: string): FileStem {
  let s = name
    .replace(BIDI, "")
    .replace(/\s*[\\/:*?"<>|\u0000-\u001f\u007f]+\s*/g, " ")
    .replace(/[\s.]+$/, "")
    .replace(/\.timber$/i, "")
    .replace(/^[\s.]+|[\s.]+$/g, "");
  if (!s) return { ok: false, reason: 'A file can\'t be named with only dots, spaces or \\ / : * ? " < > |: use letters or digits' };
  const dot = s.indexOf(".");
  const head = dot < 0 ? s : s.slice(0, dot);
  if (RESERVED.test(head.trimEnd())) s = `${head.trimEnd()} map${dot < 0 ? "" : s.slice(dot)}`;
  return { ok: true, stem: cut(s) };
}

/** The stem of the n-th copy of a file (n from 2): "Old Loop Lakelands" is "Old Loop Lakelands (2)", then "(3)" and
 *  on, the way a system file manager counts copies. The name is cut to make room, never the number, so the result
 *  fits the same limits as any stem. A name that already ends in " (2)" gets another, "Name (2) (2)": the OS's own
 *  behaviour. `stem` is one `fileStemOf` gave. */
export function numberedStem(stem: string, n: number): string {
  const tail = ` (${n})`;
  return cut(stem, [...tail].length, new TextEncoder().encode(tail).length) + tail;
}

/** The file name of the n-th copy of `fileName`: `numberedStem` of what comes before the last dot, then the extension. */
export function numberedFileName(fileName: string, n: number): string {
  const dot = fileName.lastIndexOf(".");
  return dot < 0 ? numberedStem(fileName, n) : `${numberedStem(fileName.slice(0, dot), n)}${fileName.slice(dot)}`;
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

/** At most MAX_FILE_STEM characters and MAX_STEM_BYTES UTF-8 bytes, less the room kept for what is added after it,
 *  cut between characters, never ending in a dot or space. */
function cut(s: string, roomChars = 0, roomBytes = 0): string {
  const maxChars = MAX_FILE_STEM - roomChars;
  const maxBytes = MAX_STEM_BYTES - roomBytes;
  const chars = [...s];
  if (chars.length <= maxChars && new TextEncoder().encode(s).length <= maxBytes) return s;
  let out = "";
  let bytes = 0;
  for (const c of chars.slice(0, maxChars)) {
    const b = new TextEncoder().encode(c).length;
    if (bytes + b > maxBytes) break;
    out += c;
    bytes += b;
  }
  return out.replace(/[\s.]+$/, "");
}
