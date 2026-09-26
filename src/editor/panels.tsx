// The editor's panels (EDITOR_PLAN §3): the water layers' words, Source's options, the start's
// requirements while it moves, the history list, the map's health and its problems, and the
// export dialog.

import { proxy, type Remote } from "comlink";
import { useEffect, useRef, useState } from "preact/hooks";
import { OFFICIAL_FLOW } from "../core/gen/calibrated";
import { saveFile, saveToTimberborn, type SaveToTimberbornResult } from "../platform";
import type { GeneratorApi } from "../worker/generator.worker";
import type { CheckItem, CheckProgress, ExportCheck, SessionInfo, WaterLayers } from "../worker/session";
import type { FixOp } from "../core/validate/report";
import { woodDetail } from "../core/analysis/wood";
import type { StartCheck } from "./features";
import { plain } from "./words";

// ------------------------------------------------------------------------------ the water layers

export type LayerKind = "none" | "moisture" | "badwater" | "drought" | "roofed";

export const LAYER_NAMES: Record<LayerKind, string> = {
  none: "None",
  moisture: "Soil moisture",
  badwater: "Badwater",
  drought: "Drought",
  roofed: "Water under roofs",
};

/** What the water layer on the map shows, in a line or two. */
export function LayerLegend({ kind, layers }: { kind: LayerKind; layers: WaterLayers }) {
  let text = "";
  if (kind === "moisture") text = "Green soil is moist: living trees and bushes grow there. Darker is wetter.";
  else if (kind === "badwater") text = "Dark brown is badwater. Light brown soil is contaminated: plants die there.";
  else if (kind === "drought")
    text = `After a ${layers.droughtDays}-day drought, blue water is still there and orange water has dried up. About ${layers.droughtKept.toLocaleString()} of ${layers.droughtNow.toLocaleString()} water is left.`;
  else if (kind === "roofed")
    text = layers.roofed.length
      ? `Violet tiles are under caves or overhangs. Their water is the map's own: the preview is approximate there.`
      : "No caves or overhangs on this map.";
  return (
    <div class="layer-legend" role="status">
      <p>{text}</p>
      {layers.approximate ? <p class="note">Water checks are approximate here: {layers.approximate}.</p> : null}
      {layers.preview && kind !== "roofed" ? <p class="note">Preview water: the exact settle is still running.</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------- a source's strength

/** Water's strength, blocks per second, with the brushes' slider: a few steps from a trickle to
 *  the most the game handles; past the official maps' range it says so, never a block. */
export function StrengthSlider(p: { value: number; steps: readonly number[]; onChange(v: number): void; label?: string }) {
  const k = p.steps.reduce((best, f, j) => (Math.abs(f - p.value) < Math.abs(p.steps[best] - p.value) ? j : best), 0);
  return (
    <>
      <label class="slider-field" title="Blocks of water a second">
        {p.label ?? "Strength"}
        <input type="range" min={0} max={p.steps.length - 1} step={1} value={k} aria-valuetext={`${p.value} water per second`} onInput={(e) => p.onChange(p.steps[Number((e.target as HTMLInputElement).value)])} />
        <output>{p.value} water/s</output>
      </label>
      {p.value > OFFICIAL_FLOW ? <p class="note">Stronger than any official map.</p> : null}
    </>
  );
}

// ------------------------------------------------------------------------------- the start

/** The start's footprint check while it is dragged: whether it fits, the three start requirements
 *  (PLAN §5.6, D85, D164) with the map's numbers, and the targets it misses as warnings. */
export function StartIndicators({ check, rules }: { check: StartCheck; rules: { waterWithin: number; woodWithin20: number; bushesWithin20: number } }) {
  const mark = (ok: boolean) => (ok ? "ok" : "low");
  const waterOk = check.water !== null && check.water <= rules.waterWithin;

  return (
    <div class="start-indicators" role="status">
      <p class={check.problem || !check.meets ? "bad" : "ok"}>
        {check.problem ? `Does not fit: ${check.problem}` : check.meets ? "The district center fits here" : "Fits, but misses a start requirement"}
      </p>
      <ul>
        <li class={mark(waterOk)} data-need="water">
          Water without stairs: {check.water === null ? "none in reach" : `${check.water} tiles' walk`} (at most {rules.waterWithin})
        </li>
        <li class={mark(check.wood >= rules.woodWithin20)} data-need="wood">
          Starting wood: {check.wood} logs{woodDetail(check.woodBySpecies, check.woodGrowing)} (at least {rules.woodWithin20})
        </li>
        <li class={mark(check.bushes >= rules.bushesWithin20)} data-need="bushes">
          Starting bushes: {check.bushes} (at least {rules.bushesWithin20})
        </li>
        {check.warnings.map((w) => (
          <li key={w} class="warn">
            {w}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------------- the history

export function HistoryPanel({ info, onJump, onClose }: { info: SessionInfo; onJump(index: number): void; onClose(): void }) {
  const current = info.history.filter((h) => h.applied).length - 1;
  const orphanNotes = info.orphans.filter((o) => !info.history.some((h) => h.seq === o.seq && h.orphaned));
  return (
    <aside class="history" aria-label="History">
      <header>
        <h2>History</h2>
        <button type="button" class="linkish" aria-label="Close the history" onClick={onClose}>
          ×
        </button>
      </header>
      <p class="muted">Click a step to go back to it. Nothing is lost: you can go forward again until you make a new edit.</p>
      <ol>
        <li>
          <button type="button" class="linkish" aria-current={current === -1} onClick={() => onJump(-1)}>
            {info.kind === "import" ? "Opened the map" : "The generated map"}
          </button>
        </li>
        {info.history.map((h, k) => (
          <li key={k} class={h.applied ? "" : "undone"}>
            <button type="button" class="linkish" aria-current={current === k} onClick={() => onJump(k)}>
              {h.label}
            </button>
            {h.orphaned ? <p class="orphan">No effect now: {h.orphaned}.</p> : null}
          </li>
        ))}
      </ol>
      {orphanNotes.length ? (
        <>
          <h3>To review</h3>
          <ul>
            {orphanNotes.map((o) => (
              <li key={o.seq} class="orphan">
                {o.label}: {o.reason}.
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </aside>
  );
}

// ------------------------------------------------------------------------------ health and export

/** A problem's first tile, for "Show". */
export function whereOf(c: CheckItem, entityAt: (id: string) => [number, number] | null): [number, number] | null {
  if (c.where?.tiles?.length) return c.where.tiles[0];
  for (const id of c.where?.entities ?? []) {
    const p = entityAt(id);
    if (p) return p;
  }
  return null;
}

export interface ItemActions {
  onFix(fix: FixOp[]): void;
  onShow(c: CheckItem): void;
  canShow(c: CheckItem): boolean;
}

export function Items({ items, actions }: { items: CheckItem[]; actions?: ItemActions }) {
  return (
    <ul>
      {items.map((c) => (
        <li key={c.id + c.message}>
          {c.message[0].toUpperCase() + c.message.slice(1)} <code>{c.id}</code>
          {actions && c.fix?.length ? (
            <>
              {" "}
              <button type="button" class="linkish" onClick={() => actions.onFix(c.fix!)}>
                {c.fix[0].label || "Fix it"}
              </button>
            </>
          ) : null}
          {actions && actions.canShow(c) ? (
            <>
              {" "}
              <button type="button" class="linkish" onClick={() => actions.onShow(c)}>
                Show
              </button>
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export interface ExportDialogProps {
  api: Remote<GeneratorApi>;
  info: SessionInfo;
  onClose(): void;
  onChecked(c: ExportCheck): void;
  queue<T>(fn: () => Promise<T>): Promise<T>;
  /** Fix and show buttons (the editor); the settings page lists the checks only. */
  actions?: ItemActions;
}

export function ExportDialog(p: ExportDialogProps) {
  const [check, setCheck] = useState<ExportCheck | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [savedVia, setSavedVia] = useState<SaveToTimberbornResult | null>(null);
  const [progress, setProgress] = useState<CheckProgress | null>(null);
  const [exportingNow, setExportingNow] = useState<"download" | "timberborn" | null>(null);
  const first = useRef<HTMLButtonElement>(null);
  const onProgress = proxy((q: CheckProgress) => setProgress(q));
  // the checks run after the canonical settle, in slices with progress (EDITOR_PLAN §6)
  const checkNow = async (): Promise<ExportCheck> => {
    for (;;) {
      const r = await p.queue(() => p.api.backgroundCheck(onProgress));
      if (r) return r.check;
    }
  };
  const load = () =>
    checkNow()
      .then((c) => {
        setProgress(null);
        setCheck(c);
        p.onChecked(c);
      })
      .catch((e) => setError(String(e instanceof Error ? e.message : e)));
  useEffect(() => {
    let live = true;
    void checkNow()
      .then((c) => {
        if (!live) return;
        setProgress(null);
        setCheck(c);
        p.onChecked(c);
      })
      .catch((e) => live && setError(String(e instanceof Error ? e.message : e)));
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && p.onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      live = false;
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  const canExport = !!check && !check.blocking.length && (!check.warnings.length || confirmed);
  async function doExport(kind: "download" | "timberborn") {
    setError(null);
    setExportingNow(kind);
    try {
      const r = await p.queue(() => p.api.exportTimber(confirmed, onProgress));
      if (!r.ok) return setError(r.errors.join(" "));
      if (kind === "download") {
        saveFile(r.bytes, r.fileName);
        setSavedVia(null);
      } else {
        setSavedVia(await saveToTimberborn(r.bytes, r.fileName));
      }
      setSaved(r.fileName);
    } finally {
      setExportingNow(null);
      setProgress(null);
    }
  }
  // a fix changes the map: apply it, then check again
  const given = p.actions;
  const actions: ItemActions | undefined = given && {
    ...given,
    onFix: (fix) => {
      setCheck(null);
      given.onFix(fix);
      void load();
    },
    onShow: (c) => {
      given.onShow(c);
      p.onClose();
    },
  };
  return (
    <div class="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && p.onClose()}>
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="export-title">
        <header>
          <h2 id="export-title">Export {p.info.timberName}</h2>
          <button type="button" class="linkish" aria-label="Close" onClick={p.onClose} ref={first}>
            ×
          </button>
        </header>
        {!check && !error ? (
          <p role="status">
            {progress?.stage === "water" ? "Settling the water…" : "Checking the map…"}
            {progress ? <progress max={1} value={progress.done} aria-label="Progress" /> : null}
          </p>
        ) : null}
        {check ? (
          <>
            {check.blocking.length ? (
              <section class="checks bad">
                <h3>Fix these first</h3>
                <p class="note">Each would stop the map from loading as you made it.</p>
                <Items items={check.blocking} actions={actions} />
              </section>
            ) : null}
            {check.warnings.length ? (
              <section class="checks warn">
                <h3>Warnings</h3>
                <Items items={check.warnings} actions={actions} />
                <label class="check">
                  <input type="checkbox" checked={confirmed} onChange={() => setConfirmed(!confirmed)} />
                  Export anyway. The warnings are added to the map's description.
                </label>
              </section>
            ) : null}
            {!check.blocking.length && !check.warnings.length ? <p class="ok-line">All {check.checks} checks pass. Ready to play.</p> : null}
            {check.advisory.length ? (
              <section class="checks">
                <h3>Good to know</h3>
                <Items items={check.advisory} actions={actions} />
              </section>
            ) : null}
            {check.existing.length ? (
              <section class="checks">
                <h3>Already in the map when you opened it</h3>
                <p class="note">These stay as they were. They do not stop the export.</p>
                <Items items={check.existing} />
              </section>
            ) : null}
            {check.approximate ? <p class="note">The water and start checks are approximate on this map: {check.approximate}.</p> : null}
          </>
        ) : null}
        {error ? (
          <p class="error" role="alert">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p class="ok-line" role="status">
            {savedVia?.via === "fsa" ? (
              <>
                Saved <strong>{saved}</strong> to <strong>{savedVia.folder}</strong>. It'll show up in Timberborn's custom maps.
                {savedVia.savedAs ? (
                  <>
                    {" "}
                    Saved as <strong>{savedVia.savedAs}</strong>.
                  </>
                ) : null}
              </>
            ) : (
              <>
                Saved <strong>{saved}</strong>. Move it to <code>Documents\Timberborn\Maps</code>, then start a new game and pick the map.
              </>
            )}
          </p>
        ) : null}
        <footer>
          <button type="button" class="ghost" onClick={p.onClose}>
            {saved ? "Done" : "Cancel"}
          </button>
          <button type="button" class="ghost" disabled={!canExport || !!exportingNow} onClick={() => void doExport("timberborn")}>
            {exportingNow === "timberborn" ? "Saving…" : "Save to Timberborn"}
          </button>
          <button type="button" class="primary" disabled={!canExport || !!exportingNow} onClick={() => void doExport("download")}>
            {exportingNow === "download" ? "Exporting…" : "Export"}
          </button>
        </footer>
      </div>
    </div>
  );
}

export { plain };
