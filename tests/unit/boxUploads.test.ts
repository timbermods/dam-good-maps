// A 3D texture's changed rows go to the GPU with the pixel store a 3D upload allows (render3d/rowUploads.ts
// `BoxUploads`): never flipped or premultiplied, whatever the last 2D upload (a canvas's, an image's) left set
// ("texSubImage3D: FLIP_Y or PREMULTIPLY_ALPHA isn't allowed for uploading 3D textures", the upload refused and the
// cave's light left stale), and the store put back as it was after.

import { describe, expect, it } from "vitest";
import { Data3DTexture, type WebGLRenderer } from "three";
import { BoxUploads } from "../../src/render3d/rowUploads";

const GL = { TEXTURE0: 1, TEXTURE_3D: 2, RG: 3, UNSIGNED_BYTE: 4, UNPACK_ALIGNMENT: 10, UNPACK_ROW_LENGTH: 11, UNPACK_IMAGE_HEIGHT: 12, UNPACK_SKIP_PIXELS: 13, UNPACK_SKIP_ROWS: 14, UNPACK_SKIP_IMAGES: 15, UNPACK_FLIP_Y_WEBGL: 16, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 17 };

describe("a 3D texture's changed rows", () => {
  it("go up neither flipped nor premultiplied, and the pixel store is put back after", () => {
    const W = 32;
    const H = 32;
    const D = 4;
    const t = new Data3DTexture(new Uint8Array(W * H * D * 2), W, H, D);
    // (as a canvas texture's upload leaves it)
    const store = new Map<number, number | boolean>([
      [GL.UNPACK_FLIP_Y_WEBGL, true],
      [GL.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true],
      [GL.UNPACK_ALIGNMENT, 4],
    ]);
    const atUpload: Record<string, unknown>[] = [];
    const ctx = {
      ...GL,
      texSubImage3D: () => atUpload.push({ flip: store.get(GL.UNPACK_FLIP_Y_WEBGL), premultiply: store.get(GL.UNPACK_PREMULTIPLY_ALPHA_WEBGL), align: store.get(GL.UNPACK_ALIGNMENT) }),
    };
    const gl = {
      properties: { get: () => ({ __version: t.version, __webglTexture: {} }) },
      getContext: () => ctx,
      state: {
        getParameter: (p: number) => store.get(p) ?? 0,
        pixelStorei: (p: number, v: number | boolean) => store.set(p, v),
        activeTexture: () => undefined,
        bindTexture: () => undefined,
      },
    } as unknown as WebGLRenderer;
    const up = new BoxUploads(gl, () => t);
    up.touch(3, 4, 5, 6);
    up.flush();
    expect(atUpload).toEqual([{ flip: false, premultiply: false, align: 1 }]);
    expect(store.get(GL.UNPACK_FLIP_Y_WEBGL)).toBe(true);
    expect(store.get(GL.UNPACK_PREMULTIPLY_ALPHA_WEBGL)).toBe(true);
    expect(store.get(GL.UNPACK_ALIGNMENT)).toBe(4);
  });
});
