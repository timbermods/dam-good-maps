// "Edited 5 minutes ago": when a map in Your maps was last edited, in plain words.

export function whenText(iso: string, now: Date): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, (now.getTime() - t) / 1000);
  const ago = (n: number, unit: string) => `Edited ${n} ${unit}${n === 1 ? "" : "s"} ago`;
  if (s < 60) return "Edited just now";
  if (s < 3600) return ago(Math.floor(s / 60), "minute");
  if (s < 86400) return ago(Math.floor(s / 3600), "hour");
  if (s < 86400 * 7) return ago(Math.floor(s / 86400), "day");
  const d = new Date(t);
  const sameYear = d.getFullYear() === now.getFullYear();
  return `Edited ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) })}`;
}
