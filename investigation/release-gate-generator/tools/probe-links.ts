// Adversarial share links and settings: does decoding or generating throw, or give a map that fails?
import { generate } from "../../../src/core/gen/generate";
import { decodeSpecFragment, encodeSpecFragment, makeSpec } from "../../../src/core/spec/mapspec";
import { validateSpec } from "../../../src/core/spec/schema";

const cases: string[] = [
  "s=5&t=riverValley&z=96&in=not-an-intention.also-bad&vr=2",
  "s=5&t=riverValley&z=96&in=dam-site",
  "s=5&t=riverValley&z=96&sp=" + Buffer.from(JSON.stringify([{ kind: "waterfall", params: { x: "a" } }])).toString("base64url"),
  "s=5&t=riverValley&z=96&sp=" + Buffer.from(JSON.stringify([{ kind: "damSite", params: {} }])).toString("base64url"),
  "s=5&t=riverValley&z=96&k=" + Buffer.from(JSON.stringify({ keepOut: [{ runs: [[200, 0, 255]] }], keep: ["nope"] })).toString("base64url"),
  "s=5&t=riverValley&z=96&c=2t",
  "s=5&t=riverValley&z=48x256",
  "s=5&t=canyon&z=256x48",
  "s=5&t=riverValley&z=49",
  "s=5&t=riverValley&z=48",
  "s=4294967295&t=any&z=96",
  "s=0&t=any&z=96",
  "s=5&t=riverValley&z=96&sm=AAAAAA",
  "s=5&t=riverValley&z=96&sm=AAAAZA",
  "s=5&t=riverValley&z=96&ht=10",
  "s=5&t=highlands&z=96&vt=100&ht=16",
  "s=5&t=highlands&z=96&vt=100&ht=10",
  "s=5&t=riverValley&z=96&p=%26%23hello%3D",
  "s=5&t=riverValley&z=96&fd=200&bb=300&ru=300&ms=4",
  "s=5&t=riverValley&z=96&fd=50&bb=50&ru=25&rc=0&gt=0&tb=0&uc=1",
  "s=5&t=riverValley&z=96&sb=200&sl=800&sw=4",
  "s=5&t=riverValley&z=96&bd=60&sx=60&sr=60",
  "s=5&t=riverValley&z=96&bd=8&sx=8&sr=0",
  "s=5&t=riverValley&z=96&so=n&bw=0",
  "s=5&t=delta&z=96&rv=0&lk=0&wf=0&fl=t",
  "s=5&t=islands&z=96&rv=3&lk=m&wf=m&fl=l",
];
for (const frag of cases) {
  const t0 = Date.now();
  try {
    const d = decodeSpecFragment(frag);
    if (!d) { console.log(`DECODE NULL  ${frag}`); continue; }
    const schema = validateSpec(d.spec);
    const r = generate(d.spec);
    const bad = r.report.checks.filter((c) => !c.ok).map((c) => `${c.id}: ${c.message}`);
    const top = Math.max(...Array.from(r.built.heights));
    console.log(`${r.report.passed ? "PASS" : "FAIL"} ${((Date.now() - t0) / 1000).toFixed(1)}s attempts=${r.attempts} top=${top} ${frag}${d.problems.length ? `\n   problems: ${d.problems.join("; ")}` : ""}${schema.length ? `\n   schema: ${schema.map((e) => e.path + " " + e.message).join("; ")}` : ""}${bad.length ? `\n   fails: ${bad.join(" | ")}` : ""}\n   re-encoded: ${encodeSpecFragment(r.spec)}`);
  } catch (e) {
    console.log(`THROW ${((Date.now() - t0) / 1000).toFixed(1)}s ${frag}\n   ${(e as Error).stack?.split("\n").slice(0, 4).join("\n   ")}`);
  }
}
