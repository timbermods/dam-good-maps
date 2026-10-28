// The page's words for what an edit leaves round a cave or an overhang (D487; D280 (3), amended by #623).

/** The message after a Select action or Delete's ground that left a cave's or an overhang's ground as it is
 *  (core/doc/start.ts `applySelection`'s `left`). */
export function caveLeftWords(n: number): string {
  return `${n.toLocaleString("en-GB")} tile${n > 1 ? "s" : ""} with a cave or overhang left as ${n > 1 ? "they are" : "it is"}: shape ${n > 1 ? "their tops" : "its top"} with a brush`;
}

/** The one line after a brush stroke or a sculpt that kept ground holding up a cave's or an overhang's rock, or ground an
 *  object under a roof stands on (D491): how many tiles, and why they stayed (core/doc/session.ts `ApplyResult.held`, of
 *  which `under` hold an object alone; the same tiles are tinted on the map). */
export function heldWords(n: number, under = 0): string {
  const count = `${n.toLocaleString("en-GB")} tile${n > 1 ? "s" : ""}`;
  if (!under) return `${count} left high enough to hold up a cave or overhang`;
  if (under >= n) return `${count} left as ${n > 1 ? "they are" : "it is"}: an object under a roof stands on ${n > 1 ? "them" : "it"}`;
  return `${count} left to hold up a cave or overhang and an object under a roof`;
}
