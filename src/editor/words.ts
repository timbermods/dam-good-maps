// The editor's words for the player: engine messages name ids and the plans' sections, and the
// player sees plain words.

export function plain(text: string): string {
  return text
    .replace(/\s*\((?:see )?(?:PLAN|EDITOR_PLAN|ROADMAP)\b[^)]*\)/g, "")
    .replace(/\s*\(D\d+(?:, D\d+)*\)/g, "")
    .replace(/\b(f-[a-z0-9]{6,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/g, "it")
    .replace(/^./, (c) => c.toUpperCase());
}
