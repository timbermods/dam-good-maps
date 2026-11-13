// Save to Timberborn on a phone (#1074 slice 4): the file goes to the share sheet where the browser can share it and the
// pointer is a finger, else it downloads; the same bytes either way (D455).

import { describe, expect, it } from "vitest";
import { shareOrDownload, type ShareDeps } from "../../src/platform/share";

const BYTES = new Uint8Array([1, 2, 3, 250]);

function deps(over: Partial<ShareDeps> & { fail?: string } = {}) {
  const sent: File[] = [];
  const downloaded: [Uint8Array, string][] = [];
  const d: ShareDeps = {
    touch: true,
    canShare: () => true,
    share: async ({ files }) => {
      if (over.fail) throw Object.assign(new Error(over.fail), { name: over.fail });
      sent.push(...files);
    },
    download: (b, n) => void downloaded.push([b, n]),
    ...over,
  };
  return { d, sent, downloaded };
}

describe("shareOrDownload", () => {
  it("hands a phone's file to the share sheet, the same bytes and name", async () => {
    const { d, sent, downloaded } = deps();
    expect(await shareOrDownload(BYTES, "dgm-riverValley-4242.timber", d)).toBe("shared");
    expect(downloaded).toEqual([]);
    expect(sent).toHaveLength(1);
    expect(sent[0].name).toBe("dgm-riverValley-4242.timber");
    expect(new Uint8Array(await sent[0].arrayBuffer())).toEqual(BYTES);
  });

  it("downloads where there is no share sheet for files, or no finger", async () => {
    for (const over of [{ canShare: () => false }, { share: undefined }, { canShare: undefined }, { touch: false }]) {
      const { d, sent, downloaded } = deps(over);
      expect(await shareOrDownload(BYTES, "a.timber", d)).toBe("downloaded");
      expect(sent).toEqual([]);
      expect(downloaded).toEqual([[BYTES, "a.timber"]]);
    }
  });

  it("says the sheet was closed, or that it wants a fresh tap, without downloading; another failure downloads", async () => {
    expect(await shareOrDownload(BYTES, "a.timber", deps({ fail: "AbortError" }).d)).toBe("closed");
    const tap = deps({ fail: "NotAllowedError" });
    expect(await shareOrDownload(BYTES, "a.timber", tap.d)).toBe("needs-tap");
    expect(tap.downloaded).toEqual([]);
    const other = deps({ fail: "DataError" });
    expect(await shareOrDownload(BYTES, "a.timber", other.d)).toBe("downloaded");
    expect(other.downloaded).toEqual([[BYTES, "a.timber"]]);
  });
});
