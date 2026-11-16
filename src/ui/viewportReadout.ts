// The viewport's measures in plain words, for one screenshot from a phone (`?viewport=on`, phoneRoot.ts): what the browser
// says of its viewports, its units and its safe areas, and where the editor's root and `--bar-b` put the foot. If the
// foot still lies under a browser's bar on a real phone, this box says why. Mid-screen, never at the foot, where a bar
// could cover it; it takes no taps. Not a control: nothing on the page opens it.

/** Shows the box; returns how to update it with the fixed box's rect, `--bar-b` and the overlap read now (which
 *  `--bar-b` takes only when it trusts it, ui/phoneRoot.ts), and how to remove it. */
export function showReadout(): { update: (room: DOMRect, bar: number, read: number) => void; remove: () => void } {
  const box = document.createElement("pre");
  box.className = "viewport-readout";
  box.setAttribute("aria-hidden", "true");
  box.style.cssText =
    "position:fixed;left:8px;right:8px;top:30%;z-index:2000;margin:0;padding:8px;font:11px/1.35 ui-monospace,Menlo,monospace;" +
    "white-space:pre-wrap;overflow-wrap:anywhere;color:#fff;background:rgba(0,0,0,0.82);border-radius:6px;pointer-events:none";
  const ruler = document.createElement("div");
  ruler.setAttribute("aria-hidden", "true");
  ruler.style.cssText = "position:fixed;left:0;top:0;width:0;visibility:hidden;pointer-events:none";
  document.body.append(box, ruler);
  const unit = (u: string) => {
    ruler.style.padding = "0";
    ruler.style.height = `100${u}`;
    return ruler.getBoundingClientRect().height;
  };
  const insets = () => {
    ruler.style.height = "0";
    ruler.style.padding = "env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)";
    const s = getComputedStyle(ruler);
    return [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map((v) => parseFloat(v) || 0);
  };
  const n = (v: number) => String(Math.round(v * 10) / 10);
  const rect = (r: DOMRect | undefined) => (r ? `${n(r.left)},${n(r.top)} → ${n(r.right)},${n(r.bottom)} (${n(r.width)}×${n(r.height)})` : "none");
  const ua = navigator.userAgent;
  const version = [ua.match(/OS (\d+[_.]\d+(?:[_.]\d+)?)/)?.[0], ua.match(/Version\/[\d.]+/)?.[0], ua.match(/(?:Chrome|CriOS|Firefox|FxiOS)\/[\d.]+/)?.[0]]
    .filter(Boolean)
    .join(" ");
  const update = (room: DOMRect, bar: number, read: number) => {
    const vv = window.visualViewport;
    const [t, r, b, l] = insets();
    const root = document.querySelector<HTMLElement>(".editor");
    box.textContent = [
      `innerHeight ${window.innerHeight}  innerWidth ${window.innerWidth}  html client ${document.documentElement.clientWidth}×${document.documentElement.clientHeight}`,
      vv ? `visualViewport height ${n(vv.height)} offsetTop ${n(vv.offsetTop)} scale ${n(vv.scale)} pageTop ${n(vv.pageTop)}` : "visualViewport none",
      `100vh ${n(unit("vh"))}  100svh ${n(unit("svh"))}  100dvh ${n(unit("dvh"))}  100lvh ${n(unit("lvh"))}`,
      `safe-area top ${n(t)} right ${n(r)} bottom ${n(b)} left ${n(l)}`,
      `fixed box ${rect(room)}`,
      `root ${rect(root?.getBoundingClientRect())}${root ? ` [${root.dataset.phone ?? (root.dataset.tablet !== undefined ? "tablet" : "desktop")}]` : ""}`,
      `--bar-b ${bar}px (read ${read}px)  --room-h ${document.documentElement.style.getPropertyValue("--room-h")}`,
      `standalone ${String((navigator as Navigator & { standalone?: boolean }).standalone)}  ${version || ua}`,
    ].join("\n");
  };
  const remove = () => {
    box.remove();
    ruler.remove();
  };
  return { update, remove };
}
