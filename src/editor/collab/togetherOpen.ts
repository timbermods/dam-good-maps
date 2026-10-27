// Opening Together's panel from elsewhere in the header: File's Together… entry, below the width where the header has room for
// Together's own button (page.css, 1,340px). The panel itself stays in Together.tsx.

/** The window event the panel listens for. */
export const OPEN_TOGETHER = "dgm-open-together";

export function openTogether(): void {
  window.dispatchEvent(new Event(OPEN_TOGETHER));
}
