// Labels fit under any system font. The page's font is the system's (system-ui, Segoe UI, Roboto), and Linux's and macOS's
// are wider than Segoe UI, in which the tight labels were drawn (a bar cell's Naturalize, the settings' Remove unfed water,
// Cut down and Wander, the shelf's Reserve warehouse): there they spilled out of their boxes. This measures the page's
// font on those words once, against Segoe UI's width of the same words, and sets --wide-font (1 for Segoe UI, so nothing
// changes there) that the CSS divides those labels' sizes by, taking back the share of the extra width their cells
// have no slack for.

/** The words that sit tightest in their boxes. */
const SAMPLE = "Naturalize Remove unfed water Cut down Fill water Drag on the map to select Seed Reserve warehouse Wander";
/** What SAMPLE measures at 100px in Segoe UI. */
export const SEGOE_UI_WIDTH = 4918.9;
/** The share of the extra width the labels give back: the cells hold some slack (Remove unfed water needs 55% of Verdana's
 *  extra), but Wander beside its longest value needs nearly all of it. */
const GIVE_BACK = 0.75;
/** The shelf's rows have no slack (Reserve warehouse fills its row in Segoe UI): all of the extra width, and a little over
 *  for a font whose words run wider than the sample's. */
const SHELF_MARGIN = 1.02;

/** The scales for a font whose SAMPLE measures `width` at 100px: --wide-font (the labels with some slack) and --wide-font-full
 *  (the shelf's). Segoe UI measures its own width and gets 1, exactly, so nothing changes there; any wider font is scaled,
 *  Arial's width (Liberation Sans on Linux, 1.7% wider) included, which a band around Segoe UI's width left clipping the
 *  shelf. The CSS never takes a label below --text-floor. */
export function fitScales(width: number): { wide: number; full: number } {
  const wider = width / SEGOE_UI_WIDTH - 1;
  // (a hair of tolerance for the measure itself, not for the font)
  if (!(wider > 0.001)) return { wide: 1, full: 1 };
  return { wide: 1 + wider * GIVE_BACK, full: (1 + wider) * SHELF_MARGIN };
}

export function fitFonts(): void {
  try {
    const measure = () => {
      const family = getComputedStyle(document.body).fontFamily;
      const ctx = document.createElement("canvas").getContext("2d");
      if (!ctx) return;
      ctx.font = `100px ${family}`;
      const { wide, full } = fitScales(ctx.measureText(SAMPLE).width);
      const root = document.documentElement.style;
      root.setProperty("--wide-font", wide.toFixed(3));
      root.setProperty("--wide-font-full", full.toFixed(3));
    };
    // (the stylesheet decides the family: measured once it has applied)
    if (getComputedStyle(document.body).fontSize === "15px") measure();
    else addEventListener("load", measure, { once: true });
  } catch {
    // (a canvas that won't measure leaves the labels as drawn)
  }
}
