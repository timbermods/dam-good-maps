// The project file the page writes on a worker of its own (ui/projectWriter.ts) from the document the generator's
// worker hands over (`MapSession.projectDocument`, sent as a structured clone) is the worker's own file, byte for byte:
// a fresh map, an edited one and one reopened from its file.

import { describe, expect, it } from "vitest";
import { decodeProject, encodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";

const same = (a: Uint8Array, b: Uint8Array) => Buffer.from(a).equals(Buffer.from(b));

describe("the project written off the generator's thread", () => {
  it("is the worker's own file, a fresh map, an edited one and one reopened", () => {
    const r = generate(makeSpec({ seed: 4242, size: { x: 96, y: 96 }, theme: "riverValley" }));
    const s = MapSession.fromGenerated(r, r.file);
    for (const level of [6, 9]) expect(same(encodeProject(structuredClone(s.projectDocument()), level), s.project(level)), `fresh, level ${level}`).toBe(true);
    expect(s.setName("Written elsewhere").ok).toBe(true);
    expect(same(encodeProject(structuredClone(s.projectDocument()), 6), s.project(6)), "renamed").toBe(true);
    const reopened = MapSession.open(decodeProject(s.project(6)));
    expect(same(encodeProject(structuredClone(reopened.projectDocument()), 6), reopened.project(6)), "reopened").toBe(true);
  });
});
