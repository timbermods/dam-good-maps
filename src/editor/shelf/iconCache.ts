// The shelf's object pictures, kept from one map to the next: the editor is made again for every map, and its pictures
// are drawn by the view a little after it is ready, so a new map showed grey squares for seconds. The old pictures stay
// until the new ones are drawn (they are the same objects in the same look). They are kept in this browser too, so the
// frame a reload or a share link opens on has them before the view has drawn any (only the very first visit has none).

const KEY = "dgm.shelf-icons";

let cache: Record<string, string> | null = null;
let saving: ReturnType<typeof setTimeout> | undefined;

function load(): Record<string, string> {
  if (cache) return cache;
  const kept: Record<string, string> = {};
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;
    for (const [k, v] of Object.entries(stored)) if (typeof v === "string" && v.startsWith("data:image/")) kept[k] = v;
  } catch {
    // (no storage, or nothing kept: the pictures are drawn as before)
  }
  return (cache = kept);
}

/** The pictures drawn so far, by template. */
export const shelfIcons = (): Readonly<Record<string, string>> => load();

/** A picture drawn by the view. */
export function rememberShelfIcon(template: string, url: string): void {
  const all = load();
  all[template] = url;
  // (once the run of pictures is drawn, not after each)
  clearTimeout(saving);
  saving = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch {
      // (storage full or blocked: the next visit draws them again)
    }
  }, 1500);
}
