// The map card (PLAN §14.3): name, premise, key facts, the three start requirements (PLAN §5.6,
// D85) and the validation report, grouped as File, Terrain and objects, Water, and Start and
// resources (PLAN §11.6). Failures open their group; advisory warnings (the start targets,
// water.reservoir, the clean water targets, plants.drought) show as warnings and never block the
// download.

import { woodDetail, type WoodBySpecies } from "../core/analysis/wood";
import { groupOf, type CheckGroup, type CheckResult } from "../core/validate/report";
import type { GenerateResponse } from "../worker/api";

const GROUPS: CheckGroup[] = ["File", "Terrain and objects", "Water", "Start and resources"];

function status(c: CheckResult): "ok" | "bad" | "warn" | "na" {
  if (c.applicable === false) return "na";
  if (c.approximate) return "warn";
  if (c.ok) return "ok";
  return c.advisory || c.severity !== "error" ? "warn" : "bad";
}

/** The three start requirements (PLAN §5.6, D85, D164), as the map card lists them. `wood` says
 *  which species give the starting wood, and how much more is still growing. */
export const REQUIREMENTS: { id: string; name: string; text: (c: CheckResult, wood?: { bySpecies: WoodBySpecies; growing: number }) => string }[] = [
  {
    id: "start.water",
    name: "Water without stairs",
    text: (c) => (typeof c.value === "number" ? `${c.value} tiles' walk (at most ${c.limit})` : `none within reach (at most ${c.limit} tiles' walk)`),
  },
  {
    id: "start.wood",
    name: "Starting wood",
    text: (c, wood) => `${c.value} logs within 20 tiles' walk${wood ? woodDetail(wood.bySpecies, wood.growing) : ""} (at least ${c.limit})`,
  },
  { id: "start.food", name: "Starting bushes", text: (c) => `${c.value} living within 20 tiles' walk (at least ${c.limit})` },
];

/** The start requirements of a report: each met or not, with its numbers. */
export function StartRequirements({ checks, wood }: { checks: readonly CheckResult[]; wood?: { bySpecies: WoodBySpecies; growing: number } }) {
  const rows = REQUIREMENTS.map((r) => ({ r, c: checks.find((c) => c.id === r.id) })).filter((x) => x.c && x.c.applicable !== false);
  if (!rows.length) return null;
  return (
    <section class="requirements" aria-label="Start requirements">
      <h3>Start requirements</h3>
      <ul>
        {rows.map(({ r, c }) => (
          <li key={r.id} class={status(c!)} data-check={r.id}>
            <strong>{r.name}:</strong> {c!.approximate ? "approximate, " : ""}
            {r.text(c!, wood)}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MapCard({ result: r }: { result: GenerateResponse }) {
  const count = (pred: (t: string) => boolean) => r.entities.filter((e) => pred(e.template)).length;
  const trees = r.entities.filter((e) => ["Pine", "Birch", "Oak", "Succulent"].includes(e.template));
  const living = trees.filter((e) => !e.dead).length;
  const ruins = r.entities.filter((e) => e.template.startsWith("RuinColumnH"));
  const scrap = ruins.reduce((a, e) => a + 15 * Number(e.template.slice(11)), 0);
  const fields = r.features.filter((f) => f.kind === "ruinField").length;
  const f = r.facts;
  const blocking = r.checks.filter((c) => status(c) === "bad");
  const warnings = r.checks.filter((c) => status(c) === "warn");
  const applicable = r.checks.filter((c) => c.applicable !== false);
  const summary = blocking.length
    ? `${blocking.length} of ${applicable.length} checks failed`
    : `All ${applicable.length - warnings.length} checks passed` + (warnings.length ? `, ${warnings.length} warning${warnings.length > 1 ? "s" : ""}` : "");
  return (
    <article class="card">
      <header>
        <h2>{r.name}</h2>
        <span class="muted">
          {r.W}×{r.H} · seed {r.spec.seed} · designed for {r.spec.designedFor}
        </span>
      </header>
      <p class="premise">{r.premise}</p>
      <dl class="facts">
        <div><dt>River</dt><dd>{f.cleanSources} sources, {f.cleanFlow} water/s</dd></div>
        <div><dt>Badwater</dt><dd>{f.badwaterFlow ? `${f.badwaterFlow} water/s from ${f.badwaterSources} source${f.badwaterSources > 1 ? "s" : ""}` : "none"}</dd></div>
        <div><dt>Under water</dt><dd>{Math.round(f.wetShare * 100)}% of the map</dd></div>
        {f.startBench !== null ? <div><dt>Start bench</dt><dd>{f.startBench} level tiles round the district center</dd></div> : null}
        <div><dt>Water from the start</dt><dd>{f.waterDistance === null ? "none within reach" : `${f.waterDistance} tiles' walk`}</dd></div>
        <div>
          <dt>Best dam site</dt>
          <dd>{f.bestDam ? `${f.bestDam.volume.toLocaleString()} water behind a ${f.bestDam.length}-tile dam` : "none near the start"}</dd>
        </div>
        <div><dt>Drought need</dt><dd>{f.reservoirNeed.toLocaleString()} water stored</dd></div>
        <div><dt>Trees</dt><dd>{trees.length} ({living} alive)</dd></div>
        <div><dt>Berry bushes</dt><dd>{count((t) => t === "BlueberryBush")}</dd></div>
        <div><dt>Ruins</dt><dd>{ruins.length} columns in {fields} fields, {scrap.toLocaleString()} scrap</dd></div>
        <div><dt>Slopes</dt><dd>{count((t) => t === "Slope")}</dd></div>
        <div><dt>Features</dt><dd>{r.features.length} editable</dd></div>
      </dl>
      <StartRequirements checks={r.checks} wood={f.woodBySpecies ? { bySpecies: f.woodBySpecies, growing: f.woodGrowing } : undefined} />
      <details class="report" open={blocking.length > 0}>
        <summary>
          {summary}
          <span class="muted"> · {r.ms} ms{r.attempts > 1 ? `, ${r.attempts} attempts` : ""}</span>
        </summary>
        {GROUPS.map((g) => {
          const checks = r.checks.filter((c) => groupOf(c.id) === g);
          if (!checks.length) return null;
          const bad = checks.filter((c) => status(c) === "bad").length;
          const warn = checks.filter((c) => status(c) === "warn").length;
          return (
            <details class="group" key={g} open={bad > 0 || warn > 0}>
              <summary>
                {g} <span class="muted">· {bad ? `${bad} failed` : warn ? `${warn} warning${warn > 1 ? "s" : ""}` : "all passed"}</span>
              </summary>
              <ul>
                {checks.map((c) => (
                  <li key={c.id} class={status(c)}>
                    <code>{c.id}</code> {c.message}
                    {c.fix?.length ? <span class="muted"> Fix: {c.fix.map((x) => x.label).join("; ")}.</span> : null}
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </details>
    </article>
  );
}
