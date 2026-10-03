// The recordings the editor's sounds are made of (D226): Codex's CC0 foley bank (investigation/juice-2,
// PR #64), copied unchanged to public/sounds/juice-2/ with its manifest (bank.json: each file's
// source, author, licence, edits and SHA-256) and its provenance note (SOUNDS.md). 26 files, 1,186,936
// bytes (D459 added Naturalize's two): fetched and decoded on the player's first click or key, four at a time, never with the page.

/** The recordings (the manifest's ids, in its order): `audio/<id>.mp3` beside bank.json. */
export const BANK_IDS: readonly string[] = [
  "wood-a",
  "wood-b",
  "wood-body",
  "wood-heavy",
  "earth-a",
  "earth-b",
  "leaf-a",
  "leaf-b",
  "stone",
  "grit",
  "scrape",
  "metal",
  "tin",
  "resonance",
  "crack-a",
  "crack-b",
  "splash-a",
  "splash-b",
  "bubbles",
  "waterfall",
  "boom",
  "earth-bed",
  "leaf-bed",
  "stone-bed",
  "leaves",
  "leaves-bed",
];

/** Where the bank is served (under the site's base, as the build serves public/). */
export function bankUrl(file: string): string {
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
  return `${base.endsWith("/") ? base : `${base}/`}sounds/juice-2/${file}`;
}

/** A recording decoded: as it is, reversed (undo's catch), and as a seamless loop (a held bed's). */
export interface BankEntry {
  buffer: AudioBuffer;
  reversed: AudioBuffer;
  loop: AudioBuffer;
}

/** A loop of the recording with its end crossfaded into its start (a held bed never clicks). */
function seamless(context: BaseAudioContext, buffer: AudioBuffer): AudioBuffer {
  const original = buffer.getChannelData(0);
  const overlap = Math.min(Math.floor(context.sampleRate * 0.12), Math.floor(original.length / 4));
  const length = original.length - overlap;
  const loop = context.createBuffer(1, length, context.sampleRate);
  const out = loop.getChannelData(0);
  out.set(original.subarray(overlap));
  for (let i = 0; i < overlap; i++) {
    const t = i / overlap;
    out[length - overlap + i] = original[length + i] * (1 - t) + original[i] * t;
  }
  return loop;
}

/** Fetch and decode the whole bank (four at a time). No decoding ever happens when a sound plays. */
export async function loadBank(context: BaseAudioContext, fetcher: (url: string) => Promise<Response> = (url) => fetch(url)): Promise<Map<string, BankEntry>> {
  const bank = new Map<string, BankEntry>();
  let cursor = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (cursor < BANK_IDS.length) {
        const id = BANK_IDS[cursor++];
        const file = await fetcher(bankUrl(`audio/${id}.mp3`));
        if (!file.ok) throw new Error(`Missing sound: ${id}`);
        const buffer = await context.decodeAudioData(await file.arrayBuffer());
        const data = buffer.getChannelData(0);
        const reversed = context.createBuffer(1, data.length, context.sampleRate);
        reversed.getChannelData(0).set(data);
        reversed.getChannelData(0).reverse();
        bank.set(id, { buffer, reversed, loop: /bed$|waterfall|bubbles|boom/.test(id) ? seamless(context, buffer) : buffer });
      }
    }),
  );
  return bank;
}
