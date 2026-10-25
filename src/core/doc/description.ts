// The map's description (the .timber's MapDescription: the text the game shows with the map when its
// player picks it), written by the player with the `setDescription` operation (ops.schema.json).
// The game reads any length; the limit is ours, so the text stays short enough to read in the game's map
// panel and in the page's field. Refused with a one-line reason, never cut short (D342).

/** The longest description a player may write, in characters (a generated one is about 300). */
export const MAX_DESCRIPTION = 600;

/** Why `text` can't be the map's description now, in one line, or null. `current` is the description the
 *  player has written already (null: none, the generated one is used); empty text takes it away. */
export function descriptionProblem(text: string, current: string | null): string | null {
  if (text !== "" && text.trim() === "") return "A description of only spaces says nothing: leave it empty to use the generated one";
  const n = [...text].length;
  if (n > MAX_DESCRIPTION) return `A description holds up to ${MAX_DESCRIPTION} characters; this one has ${n}`;
  if (/[\u0000-\u0009\u000b-\u001f\u007f]/.test(text)) return "A description holds text and line breaks only";
  if (text === (current ?? "")) return text === "" ? "The map has no written description to take away" : "That is already the description";
  return null;
}

/** A real place's credits (its description's last paragraphs: the elevation source, what was changed, the
 *  providers' notices) travel with the map whatever its player writes: null for any other text. */
export function placeCredits(text: string): string | null {
  const at = text.indexOf("Made with Dam Good Maps from public elevation data");
  return at < 0 ? null : text.slice(at);
}
