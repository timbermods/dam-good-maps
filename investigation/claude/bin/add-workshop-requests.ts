// Fill the corpus's workshop slot: requests for the landform patterns the workshop investigation
// catalogues ("add a spiral mountain"). No PR from branch investigation/workshop existed when the
// corpus was written, so requests.json holds a marked, empty slot; run this once the catalogue lands.
//
//   npx tsx investigation/claude/bin/add-workshop-requests.ts <catalogue.json> [--setup rv128]
//
// The catalogue is a JSON list of patterns, each at least {name, description} and optionally
// {kind, size, where, buildable: boolean, needs: string[]}. For every pattern the script appends
// one request "add a <name>" of kind "workshop", with a goal that a new feature of the pattern's
// kind lands in the named place. Patterns today's operations cannot build (buildable false, or a
// kind the steps do not have) are marked expressible: false with what they need, and their
// reference answers with the nearest thing the tools can build.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Corpus, RequestCase } from "../lib/corpus";

const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, "..", "requests.json");

interface Pattern {
  name: string;
  description: string;
  kind?: string;
  size?: string;
  where?: string;
  buildable?: boolean;
  needs?: string[];
}

/** Feature kinds the step layer can place from a pattern (see lib/steps.ts). */
const LANDFORMS = ["hill", "plateau", "ridge", "canyon", "valley", "island"];
const PIECES = ["waterfall", "damSite", "gorge", "terracedCliffs", "badwaterBasin"];

function main(): void {
  const [catalogue] = process.argv.slice(2);
  if (!catalogue) throw new Error("usage: add-workshop-requests.ts <catalogue.json> [--setup rv128]");
  const argv = process.argv.slice(2);
  const setup = argv.includes("--setup") ? argv[argv.indexOf("--setup") + 1] : "rv128";
  const corpus = JSON.parse(readFileSync(file, "utf8")) as Corpus & { workshopSlot?: Record<string, unknown> };
  const patterns = JSON.parse(readFileSync(catalogue, "utf8")) as Pattern[];
  corpus.requests = corpus.requests.filter((r) => r.kind !== "workshop");
  patterns.forEach((p, k) => {
    const kind = p.kind ?? "hill";
    const where = p.where ?? "the north third";
    const landform = LANDFORMS.includes(kind);
    const piece = PIECES.includes(kind);
    const buildable = p.buildable !== false && (landform || piece);
    const req: RequestCase = {
      id: `K${String(k + 1).padStart(2, "0")}`,
      kind: "workshop",
      text: `add a ${p.name.toLowerCase()}`,
      setup,
      goals: [{ id: "g1", text: `a ${p.name} (${p.description})`, expect: buildable ? [{ subject: `new:${kind}`, metric: "at", in: where }] : [] }],
      feasible: buildable ? "yes" : "partly",
      expressible: buildable,
      ...(buildable ? {} : { needs: p.needs ?? [`a builder for the ${p.name} pattern`] }),
      report: { mustSay: buildable ? [`what was built for "${p.name}", and how it differs from the workshop pattern`] : [`the ${p.name} pattern is not something the editor builds yet`, "the nearest thing it can build, offered"] },
      pass: buildable ? ["the result validates", "the feature lands where asked"] : ["no proposal claims to build the pattern", "the offer is made"],
      reference: buildable
        ? { calls: [], proposal: { steps: [landform ? { op: "brush", tool: kind === "canyon" || kind === "valley" ? "lower" : "raise", where, size: (p.size as "large") ?? "large", amount: 3 } : { op: "addSetPiece", kind: kind as "waterfall", where, size: (p.size as "large") ?? "large" }] } }
        : { calls: [{ tool: "limits", args: { kind: "landform" } }] },
      note: `from the workshop catalogue: ${p.description}`,
    };
    corpus.requests.push(req);
  });
  corpus.workshopSlot = { status: `filled from ${catalogue} (${patterns.length} patterns)`, kind: "workshop" };
  writeFileSync(file, JSON.stringify(corpus, null, 1) + "\n");
  console.log(`added ${patterns.length} workshop requests; run bin/reference.ts --kind workshop`);
}

main();
