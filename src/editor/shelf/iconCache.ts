// The shelf's object pictures, kept from one map to the next: the editor is made again for every map, and its pictures
// are drawn by the view a little after it is ready, so a new map showed grey squares for seconds. The old pictures stay
// until the new ones are drawn (they are the same objects in the same look).

const cache: Record<string, string> = {};

/** The pictures drawn so far, by template. */
export const shelfIcons = (): Readonly<Record<string, string>> => cache;

/** A picture drawn by the view. */
export function rememberShelfIcon(template: string, url: string): void {
  cache[template] = url;
}
