// Save to Timberborn on a phone (#1074 slice 4): the map file goes to the phone's share sheet (save to Files, send to the
// computer that plays), where the browser can share a file and the pointer is a finger; else it downloads as on a
// desktop. The bytes are the same either way (D455): this only chooses how the file leaves the page.

/** What a share needs of the browser (`navigator`, or a stand-in in the tests). */
export interface ShareDeps {
  canShare?: (data: { files: File[] }) => boolean;
  share?: (data: { files: File[] }) => Promise<void>;
  /** The pointer is a finger (`(pointer: coarse)`). */
  touch: boolean;
  /** The download, as a desktop's. */
  download(bytes: Uint8Array, name: string): void;
}

/** How the file left: shared, its share sheet closed without sending it, waiting for a fresh tap (the browser asks
 *  for one when building the file took long), or downloaded. */
export type ShareResult = "shared" | "closed" | "needs-tap" | "downloaded";

/** The file as the share sheet takes it. */
export function mapFile(bytes: Uint8Array, name: string): File {
  return new File([bytes as unknown as ArrayBuffer], name, { type: "application/octet-stream" });
}

/** The share sheet is there for this file. */
export function canShareFile(file: File, deps: ShareDeps): boolean {
  if (!deps.touch || !deps.share || !deps.canShare) return false;
  try {
    return deps.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Hand the map to the share sheet where there is one, else download it. `freshTap`: this call comes straight from
 *  a tap made for it ("Send it"), so a browser that still refuses the share will never allow it: the file downloads. */
export async function shareOrDownload(bytes: Uint8Array, name: string, deps: ShareDeps, freshTap = false): Promise<ShareResult> {
  const file = mapFile(bytes, name);
  if (!canShareFile(file, deps)) {
    deps.download(bytes, name);
    return "downloaded";
  }
  try {
    await deps.share!({ files: [file] });
    return "shared";
  } catch (e) {
    const kind = e instanceof Error || (typeof e === "object" && e && "name" in e) ? (e as { name: string }).name : "";
    if (kind === "AbortError") return "closed";
    // (the tap that asked has lapsed while the file was built: the share waits for another)
    if (kind === "NotAllowedError" && !freshTap) return "needs-tap";
    deps.download(bytes, name);
    return "downloaded";
  }
}

/** The browser's own, as the page uses it. */
export function liveShareDeps(download: (bytes: Uint8Array, name: string) => void): ShareDeps {
  const nav = typeof navigator === "undefined" ? undefined : (navigator as Navigator & { canShare?: ShareDeps["canShare"] });
  return {
    canShare: nav?.canShare?.bind(nav),
    share: nav?.share ? (d) => nav.share(d) : undefined,
    touch: typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches,
    download,
  };
}
