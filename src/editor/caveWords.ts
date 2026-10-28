// The page's words for what an edit leaves round a cave or an overhang (D487; D280 (3), amended by #ROCKHOLD-PR).

/** The one line after a brush stroke or a sculpt that kept ground holding up a cave's or an overhang's rock: how many
 *  tiles, and why they stayed (core/doc/session.ts `ApplyResult.held`; the same tiles are tinted on the map). */
export function rockHeldWords(n: number): string {
  return `${n.toLocaleString("en-GB")} tile${n > 1 ? "s" : ""} left high enough to hold up a cave or overhang`;
}
