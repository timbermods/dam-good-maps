// Determinism (D366): the same spec gives the same bytes in a fresh process, after other maps, with and
// without the progress callbacks. Prints "<frag> <sha>" per spec; argv[2] = "warm" generates other maps
// first, "callbacks" passes every callback, "attempts" caps attempts at 8.
import { createHash } from "node:crypto";
import { generate } from "../../../src/core/gen/generate";
import { decodeSpecFragment } from "../../../src/core/spec/mapspec";
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const mode = process.argv[2] ?? "";
const frags = ["s=1&t=any&z=96", "s=2&t=riverValley&z=96", "s=3&t=canyon&z=96", "s=4&t=highlands&z=96", "s=5&t=lakeBasin&z=96", "s=6&t=delta&z=96", "s=7&t=islands&z=96", "s=8&t=any&z=128&vt=80", "s=9&t=highlands&z=96&so=n", "s=3&t=canyon&z=96&vr=1&in=landmark"];
if (mode === "warm") for (const f of ["s=99&t=islands&z=128", "s=98&t=delta&z=96", "s=3&t=canyon&z=128"]) generate(decodeSpecFragment(f)!.spec);
for (const f of frags) {
  const spec = decodeSpecFragment(f)!.spec;
  const opts = mode === "callbacks" ? { onProgress: () => {}, onLand: () => {}, onCandidate: () => {}, onAttempt: () => {} } : mode === "attempts" ? { maxAttempts: 8 } : {};
  const r = generate(spec, opts);
  console.log(f, sha(r.bytes), r.attempts, r.report.passed);
}
