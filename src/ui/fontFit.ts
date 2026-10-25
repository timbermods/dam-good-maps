// Labels fit under any system font. The page's font is the system's (system-ui, Segoe UI, Roboto), and Linux's and macOS's
// are wider than Segoe UI, in which the tight labels were drawn (a bar cell's Naturalize, the settings' Remove unfed water,
// Cut down and Wander, the shelf's Reserve warehouse): there they spilled out of their boxes. This measures the page's
// font on those words once, against Segoe UI's width of the same words, and sets --wide-font (1 for Segoe UI, so nothing
// changes there) that the CSS divides those labels' sizes by, taking back the share of the extra width their cells
// have no slack for.

/** The words that sit tightest in their boxes. */
const SAMPLE = "Naturalize Remove unfed water Cut down Fill water Drag on the map to select Seed Reserve warehouse Wander";
/** What SAMPLE measures at 100px in Segoe UI. */
const SEGOE_UI_WIDTH = 4918.9;
/** The share of the extra width the labels give back: the cells hold some slack (Remove unfed water needs 55% of Verdana's
 *  extra), but Wander beside its longest value needs nearly all of it. */
const GIVE_BACK = 0.75;
/** The shelf's rows have no slack (Reserve warehouse fills its row in Segoe UI): all of the extra width, and a little over
 *  for a font whose words run wider than the sample's. */
const SHELF_MARGIN = 1.02;

export function fitFonts(): void {
  try {
    const measure = () => {
      const family = getComputedStyle(document.body).fontFamily;
      const ctx = document.createElement("canvas").getContext("2d");
      if (!ctx) return;
      ctx.font = `100px ${family}`;
      const wider = ctx.measureText(SAMPLE).width / SEGOE_UI_WIDTH - 1;
      // (within 2% of Segoe UI is Segoe UI)
      const wide = wider > 0.02;
      const root = document.documentElement.style;
      root.setProperty("--wide-font", (wide ? 1 + wider * GIVE_BACK : 1).toFixed(3));
      root.setProperty("--wide-font-full", (wide ? (1 + wider) * SHELF_MARGIN : 1).toFixed(3));
    };
    // (the stylesheet decides the family: measured once it has applied)
    if (getComputedStyle(document.body).fontSize === "15px") measure();
    else addEventListener("load", measure, { once: true });
  } catch {
    // (a canvas that won't measure leaves the labels as drawn)
  }
}
