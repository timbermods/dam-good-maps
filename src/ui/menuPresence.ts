// A menu that leaves as it came (Kyler, 2026-10-15): the menus grow from their button and shrink back into it. The entry is
// CSS alone (@starting-style); the exit needs the menu to stay in the page while it plays, so a menu asks this hook: `mounted`
// is what to draw, `closing` marks the menu (data-closing) that is on its way out. The styles are in page.css, "menus".

import { useEffect, useState } from "preact/hooks";

/** A little longer than the exit transition (--dur-fast, 160ms), so it has finished when the menu is taken away. */
export const MENU_EXIT_MS = 180;

export function useMenuPresence(open: boolean): { mounted: boolean; closing: boolean } {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return undefined;
    }
    if (!mounted) return undefined;
    const t = setTimeout(() => setMounted(false), MENU_EXIT_MS);
    return () => clearTimeout(t);
  }, [open]);
  return { mounted: open || mounted, closing: !open && mounted };
}
