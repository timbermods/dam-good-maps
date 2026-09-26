// The app (PLAN §14.1, EDITOR_PLAN §4): generate → refine → play as one page. The settings page
// shows the map (2D, or 3D on request) with its card and downloads; "Refine this map" opens it in
// the editor, and "Back to settings" returns with the edits kept. Generating again while the map
// has edits regenerates around them (a settings change, PLAN §19.1). Any .timber or project file
// opens in the editor. The open map is autosaved in the browser. A Real places link
// (`#place=<id>`, from the gallery's Refine) opens that place in the editor.

import type { ComponentType } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { createGenerator, readFile, saveFile, saveToTimberborn, storage, type Autosave, type SaveToTimberbornResult } from "../platform";
import {
  decodeSpecFragment,
  defaultSettings,
  DIFFICULTY_RULES,
  encodeSpecFragment,
  GENERATOR_VERSION,
  makeSpec,
  mineSitesForSize,
  seedFromText,
  shareLink,
  type Difficulty,
  type MapSpec,
  type Settings,
  type ThemeId,
} from "../core/spec/mapspec";
import type { GenerateResponse } from "../worker/api";
import type { SessionInfo, SessionOpen } from "../worker/session";
import type { EditorProps } from "../editor/Editor";
import type { ExportDialogProps } from "../editor/panels";
import { fetchIndex, fetchPlace, placeFromHash, PLACES_URL } from "../places/data";
import { Preview2D, type Layers } from "./Preview2D";
import { MapCard } from "./MapCard";
import { SettingsPanel } from "./SettingsPanel";
import { shareText } from "./settingsModel";

const generator = createGenerator();

const LAYER_NAMES: Record<keyof Layers, string> = {
  water: "Water",
  moisture: "Moist soil",
  contamination: "Contaminated soil",
  reach: "Walkable from start",
  dam: "Dam site",
  entities: "Objects",
  features: "Feature outlines",
};

declare global {
  interface Window {
    /** Test hooks (tests/e2e): generate a map from a URL fragment and return its sha256; the map
     *  on screen, its sha256 and its share link. */
    dgm?: {
      generate(fragment: string): Promise<{ sha256: string; bytes: number; passed: boolean; ms: number; ticks: number }>;
      current?(): { sha256: string; link: string; passed: boolean; checks: { id: string; ok: boolean; value?: number | string; limit?: number | string; where?: { tiles?: [number, number][] } }[] } | null;
    };
  }
}
let shown: GenerateResponse | null = null;
window.dgm = {
  async generate(fragment: string) {
    const d = decodeSpecFragment(fragment);
    if (!d) throw new Error("bad fragment");
    const r = await generator.generate(d.spec);
    return { sha256: r.sha256, bytes: r.timber.length, passed: r.passed, ms: r.ms, ticks: r.facts.settle.ticks };
  },
  current() {
    return shown ? { sha256: shown.sha256, link: shareLink(location.href, shown.spec), passed: shown.passed, checks: shown.checks.map((c) => ({ id: c.id, ok: c.ok, value: c.value, limit: c.limit, ...(c.where?.tiles ? { where: { tiles: c.where.tiles } } : {}) })) } : null;
  },
};

/** What the page says when the new map is fine but the player's edits fail a check on it. */
export function editProblemsNote(n: number): string {
  return `The new map is ready. Your edits leave ${n === 1 ? "a problem" : `${n} problems`} on it, listed in the map's checks below. Refine the map to fix ${n === 1 ? "it" : "them"}.`;
}

function randomSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0];
}

function initialSpec(): { spec: MapSpec; fromLink: boolean; note?: string } {
  const d = decodeSpecFragment(location.hash);
  if (d) {
    const note = d.version !== GENERATOR_VERSION ? `This link was made with generator ${d.version}; this is ${GENERATOR_VERSION}, so the map may differ.` : undefined;
    return { spec: d.spec, fromLink: true, note: d.problems.length ? d.problems.join("; ") : note };
  }
  return { spec: makeSpec({ seed: randomSeed() }), fromLink: false };
}

/** A lazily loaded module's export (the 3D view and the editor are separate chunks). */
function useLazy<T>(load: () => Promise<T>, when: boolean): T | null {
  const [mod, setMod] = useState<T | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (!when || started.current) return;
    started.current = true;
    void load().then((m) => setMod(() => m));
  }, [when]);
  return mod;
}

function isProjectFile(name: string, bytes: Uint8Array): boolean {
  if (/\.timber$/i.test(name)) return false;
  if (/\.(json|gz)$/i.test(name)) return true;
  return bytes[0] === 0x1f && bytes[1] === 0x8b; // gzip, not a zip (.timber starts "PK")
}

interface Confirm {
  text: string;
  yes: string;
  onYes(): void;
  /** Cancel, when it needs more than closing the dialog. */
  onNo?(): void;
  /** Keep the map being replaced (default: the open document's project file). */
  save?(): void;
}

export function App() {
  const init = useMemo(initialSpec, []);
  const [seedText, setSeedText] = useState(String(init.spec.seed));
  const [size, setSize] = useState<{ x: number; y: number }>(init.spec.size);
  const [difficulty, setDifficulty] = useState<Difficulty>(init.spec.designedFor);
  const [theme, setTheme] = useState<ThemeId>(init.spec.theme);
  const [settings, setSettings] = useState<Settings>(init.spec.settings);
  const [copied, setCopied] = useState("");
  const [result, setResult] = useState<GenerateResponse | null>(null);
  /** The settings page shows the open document's map (its edits included). */
  const [fromSession, setFromSession] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | undefined>(init.note);
  const [layers, setLayers] = useState<Layers>({ water: true, moisture: false, contamination: false, reach: false, dam: true, entities: true, features: false });
  const [downloaded, setDownloaded] = useState(false);
  const [timberborn, setTimberborn] = useState<SaveToTimberbornResult | null>(null);
  const [savingToTimberborn, setSavingToTimberborn] = useState(false);
  const [preview, setPreview] = useState<"2d" | "3d">("2d");
  const [screen, setScreen] = useState<"settings" | "editor">("settings");
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [opened, setOpened] = useState<{ key: number; data: SessionOpen } | null>(null);
  const [resume, setResume] = useState<Autosave | null>(null);
  const [saveState, setSaveState] = useState("");
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [exporting, setExporting] = useState(false);
  /** A real place being opened in the editor: what the page says meanwhile. */
  const [opening, setOpening] = useState<string | null>(null);
  const saveTimer = useRef(0);
  const screenRef = useRef(screen);
  screenRef.current = screen;

  const Preview3D = useLazy(() => import("./Preview3D").then((m) => m.default), preview === "3d");
  const EditorMod = useLazy(() => import("../editor/Editor").then((m) => m.default as ComponentType<EditorProps>), screen === "editor" || !!opened);
  const Dialog = useLazy(() => import("../editor/panels").then((m) => m.ExportDialog as ComponentType<ExportDialogProps>), exporting);

  const spec = useMemo(
    () => ({ ...makeSpec({ seed: seedFromText(seedText || "0"), size, designedFor: difficulty, theme }), settings }),
    [seedText, size, difficulty, theme, settings],
  );
  const stale = !!result && encodeSpecFragment(result.spec) !== encodeSpecFragment(spec);
  const edited = fromSession && !!session && session.kind === "generated" && session.edits > 0;

  function showSpec(s: MapSpec) {
    setSeedText(String(s.seed));
    setSize(s.size);
    setDifficulty(s.designedFor);
    setTheme(s.theme);
    setSettings(s.settings);
  }

  // a theme pre-fills every setting (PLAN §6); a difficulty sets the start rules and its badwater
  // distance and berry target (PLAN §5.6); a size sets the default number of mine sites
  function chooseTheme(t: ThemeId) {
    setTheme(t);
    setSettings(defaultSettings(t, difficulty, size));
  }
  function chooseDifficulty(d: Difficulty) {
    setDifficulty(d);
    const r = DIFFICULTY_RULES[d];
    setSettings((s) => ({
      ...s,
      hazards: { ...s.hazards, badwaterDistance: r.badwaterWithin },
      resources: { ...s.resources, berriesNearStart: r.berriesTarget },
      start: { ...s.start, rules: { waterWithin: r.waterWithin, woodWithin20: r.woodWithin20, bushesWithin20: r.bushesWithin20, badwaterWithin: r.badwaterWithin, ruinsWithin: r.ruinsWithin } },
    }));
  }
  function chooseSize(z: { x: number; y: number }) {
    setSize(z);
    setSettings((s) => ({ ...s, resources: { ...s.resources, mineSites: mineSitesForSize(z.x, z.y) } }));
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(`${what} copied.`);
    } catch {
      setCopied(`Could not copy. ${what}: ${text}`);
    }
    window.setTimeout(() => setCopied(""), 4000);
  }

  async function saveToTimberbornClick(bytes: Uint8Array, name: string) {
    setSavingToTimberborn(true);
    try {
      setTimberborn(await saveToTimberborn(bytes, name));
      setDownloaded(true);
    } finally {
      setSavingToTimberborn(false);
    }
  }

  // ------------------------------------------------------------------------------ generating

  async function run(s: MapSpec) {
    setBusy(true);
    setError(null);
    setDownloaded(false);
    setTimberborn(null);
    try {
      if (edited) {
        // keep the player's edits: regenerate the open document with the new settings
        const r = await generator.regenerate(s);
        setSession(r.info);
        if (!r.ok || !r.response) {
          setError(`The map was not changed: ${r.errors.join("; ")}`);
          return;
        }
        setResult(r.response);
        scheduleSave();
        history.replaceState(null, "", "#" + encodeSpecFragment(r.response.spec));
        if (r.editProblems.length) setNote(editProblemsNote(r.editProblems.length));
        else if (!r.response.passed) setError(`No layout passed every check after ${r.response.attempts} attempts; this is the last one. Try another seed.`);
        return;
      }
      if (session && session.kind === "generated" && session.edits === 0) {
        // nothing to keep: the open document was the unedited map
        await generator.closeSession();
        setSession(null);
        void storage.clear();
      }
      const r = await generator.generate(s);
      setResult(r);
      setFromSession(false);
      history.replaceState(null, "", "#" + encodeSpecFragment(r.spec));
      if (!r.passed) setError(`No valid map after ${r.attempts} attempts. Try another seed.`);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void (async () => {
      const saved = await storage.load();
      const place = placeFromHash(location.hash);
      if (place && !saved) {
        await openPlace(place);
        return;
      }
      if (place && saved) {
        // the place would replace the map saved in this browser: ask first
        setConfirm({
          text: `Opening this real place replaces ${saved.name}, which is saved in this browser. Save its project file first if you want to keep it.`,
          yes: "Open the real place",
          onYes: () => void openPlace(place),
          onNo: () => {
            setResume(saved);
            void run(init.spec);
          },
          save: () => saveFile(saved.bytes, `${saved.name}.damgoodmaps.json`, "application/gzip"),
        });
        return;
      }
      if (saved && location.hash === "#edit") {
        await openBytes(saved.bytes, saved.name + ".damgoodmaps.json", true);
        return;
      }
      if (saved) setResume(saved);
      await run(init.spec);
    })();
  }, []);

  /** Open a real place in the editor: its .timber is built in the worker and imported. */
  async function openPlace(id: string) {
    setError(null);
    setOpening("Opening the map…");
    try {
      const entry = (await fetchIndex()).places.find((p) => p.id === id);
      if (!entry) throw new Error(`there is no real place called "${id}"`);
      setOpening(`Opening ${entry.name}…`);
      enterEditor(await generator.openPlace(await fetchPlace(id)));
      setOpening(null);
    } catch (e) {
      setOpening(null);
      await run(init.spec);
      setError(`The real place could not be opened: ${String(e instanceof Error ? e.message : e)}`);
    }
  }

  // -------------------------------------------------------------------------------- the editor

  function enterEditor(data: SessionOpen) {
    setSession(data.info);
    setOpened((o) => ({ key: (o?.key ?? 0) + 1, data }));
    setScreen("editor");
    setResume(null);
    history.replaceState(null, "", "#edit");
    scheduleSave();
  }

  /** Ask before replacing an open document that has edits. */
  function guard(action: () => void, what: string) {
    if (session && session.edits > 0) {
      setConfirm({
        text: `${what} closes ${session.name} and its ${session.edits} edit${session.edits > 1 ? "s" : ""}. Save its project file first if you want to keep them.`,
        yes: "Close it",
        onYes: action,
      });
    } else action();
  }

  async function refine() {
    setError(null);
    try {
      if (fromSession && session?.kind === "generated") enterEditor(await generator.sessionView());
      else guard(() => void generator.refine().then(enterEditor, (e) => setError(String(e instanceof Error ? e.message : e))), "Refining this map");
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  async function openBytes(bytes: Uint8Array, name: string, fromAutosave = false) {
    setError(null);
    setBusy(true);
    try {
      const data = isProjectFile(name, bytes) ? await generator.openProject(bytes) : await generator.openTimber(bytes, name);
      enterEditor(data);
    } catch (e) {
      const text = String(e instanceof Error ? e.message : e);
      setError(fromAutosave ? `The autosaved map could not be opened: ${text}` : `${name} could not be opened: ${text}`);
      setScreen("settings");
      if (fromAutosave) await run(init.spec);
    } finally {
      setBusy(false);
    }
  }

  function openFile(file: File) {
    guard(() => void readFile(file).then((b) => openBytes(b, file.name)), `Opening ${file.name}`);
  }

  async function backToSettings(info: SessionInfo) {
    setScreen("settings");
    setSession(info);
    if (info.kind === "generated" && info.spec) {
      showSpec(info.spec);
      setBusy(true);
      try {
        setResult(await generator.settingsResponse());
        setFromSession(true);
        history.replaceState(null, "", "#" + encodeSpecFragment(info.spec));
      } catch (e) {
        setError(String(e instanceof Error ? e.message : e));
      } finally {
        setBusy(false);
      }
    } else {
      setFromSession(false);
      history.replaceState(null, "", "#" + encodeSpecFragment(spec));
      if (!result) await run(spec);
    }
  }

  function discardEdits() {
    setConfirm({
      text: `Discard your ${session?.edits ?? 0} edits and show the generated map? This cannot be undone.`,
      yes: "Discard edits",
      onYes: () =>
        void (async () => {
          await generator.closeSession();
          setSession(null);
          setFromSession(false);
          await storage.clear();
          await run(spec);
        })(),
    });
  }

  // ------------------------------------------------------------------------------- autosave

  function scheduleSave() {
    clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      try {
        const info = await generator.sessionInfo();
        if (!info) return;
        setSaveState("saving…");
        const p = await generator.project(6);
        const ok = await storage.save({ bytes: p.bytes, name: p.name, savedAt: new Date().toISOString(), kind: info.kind, screen: screenRef.current });
        setSaveState(ok ? "saved in this browser" : "autosave is off in this browser");
      } catch {
        setSaveState("autosave failed");
      }
    }, 1200);
  }

  const lastVersion = useRef("");
  function onEditorChange(info: SessionInfo) {
    setSession(info);
    // (a change of the map, or of the editor's camera bookmarks, which the project keeps)
    const key = `${info.version}|${JSON.stringify(info.views ?? [])}`;
    if (key !== lastVersion.current) {
      lastVersion.current = key;
      scheduleSave();
    }
  }

  // ---------------------------------------------------------------------------------- render

  shown = result;

  const confirmDialog = confirm ? (
    <div class="dialog-backdrop">
      <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-text">
        <p id="confirm-text">{confirm.text}</p>
        <footer>
          <button
            type="button"
            class="ghost"
            onClick={() => {
              const c = confirm;
              setConfirm(null);
              c.onNo?.();
            }}
            autoFocus
          >
            Cancel
          </button>
          {confirm.save || session ? (
            <button
              type="button"
              class="ghost"
              onClick={() => (confirm.save ? confirm.save() : void generator.project().then((p) => saveFile(p.bytes, p.fileName, "application/gzip")))}
            >
              Save project file
            </button>
          ) : null}
          <button
            type="button"
            class="primary"
            onClick={() => {
              const c = confirm;
              setConfirm(null);
              c.onYes();
            }}
          >
            {confirm.yes}
          </button>
        </footer>
      </div>
    </div>
  ) : null;

  if (screen === "editor" && opened) {
    return (
      <>
        {EditorMod ? (
          <EditorMod key={opened.key} api={generator} opened={opened.data} onBack={(i) => void backToSettings(i)} onChange={onEditorChange} onOpenFile={openFile} saveState={saveState} />
        ) : (
          <div class="placeholder">Opening the editor…</div>
        )}
        {error ? (
          <p class="error floating" role="alert">
            {error}
          </p>
        ) : null}
        {confirmDialog}
      </>
    );
  }

  const openInput = (
    <label class="button ghost wide">
      Open a map
      <input
        type="file"
        class="visually-hidden"
        accept=".timber,.json,.gz,application/json"
        aria-label="Open a map or a project file in the editor"
        onChange={(e) => {
          const input = e.target as HTMLInputElement;
          const file = input.files?.[0];
          input.value = "";
          if (file) openFile(file);
        }}
      />
    </label>
  );

  return (
    <div class="app">
      <header class="top">
        <div class="top-row">
          <h1>Dam Good Maps</h1>
          <nav class="top-nav" aria-label="Pages">
            <a href={PLACES_URL}>Real places</a>
          </nav>
        </div>
        <p class="tag">Timberborn maps from a seed: generate, refine, download, play.</p>
      </header>
      {resume ? (
        <div class="banner" role="status">
          <span>
            Continue editing <strong>{resume.name}</strong>? It was saved in this browser {new Date(resume.savedAt).toLocaleString()}.
          </span>
          <button type="button" class="primary" onClick={() => void openBytes(resume.bytes, resume.name + ".damgoodmaps.json", true)}>
            Continue
          </button>
          <button
            type="button"
            class="ghost"
            onClick={() => {
              setResume(null);
              void storage.clear();
            }}
          >
            Discard
          </button>
        </div>
      ) : null}
      {session && session.kind === "import" ? (
        <div class="banner accent" role="status">
          <span>
            You're editing <strong>{session.name}</strong>. The map below is a new one, made from these settings.
          </span>
          <button type="button" class="primary" onClick={() => void generator.sessionView().then(enterEditor)}>
            Back to editing
          </button>
        </div>
      ) : null}
      <main class="panes">
        <section class="settings" aria-label="Settings">
          <SettingsPanel
            spec={spec}
            seedText={seedText}
            onSeed={setSeedText}
            onDice={() => setSeedText(String(randomSeed()))}
            onSize={chooseSize}
            onTheme={chooseTheme}
            onDifficulty={chooseDifficulty}
            onSettings={setSettings}
            onReset={() => setSettings(defaultSettings(theme, difficulty, size))}
          />
          <div class="generate-bar">
            <button type="button" class="primary" disabled={busy || !!opening} onClick={() => run(spec)}>
              {busy ? "Generating…" : edited ? "Generate, keeping my edits" : stale ? "Generate (settings changed)" : "Generate"}
            </button>
            {edited ? (
              <p class="note">
                Your {session!.edits} edit{session!.edits > 1 ? "s stay" : " stays"} when you generate again.{" "}
                <button type="button" class="linkish" onClick={discardEdits}>
                  Discard edits
                </button>
              </p>
            ) : null}
          </div>
          {note && <p class="note">{note}</p>}
          {openInput}
          <details class="more">
            <summary>What's in this version</summary>
            <p>
              Three themes: River Valley, Canyon and Lake Basin. The water is simulated with the game's own rules and
              shipped settled, so rivers run from the first tick. Trees live where that water keeps the soil moist.
            </p>
            <p>
              Every map is checked against the game's loading rules and for a colony's survival: clean water in pump
              reach, food, wood, land to build on, and a dam site that holds a drought's water.
            </p>
            <p>Refine a map in the editor, or open any map to look at it in 3D and change it.</p>
          </details>
        </section>
        <section class="view" aria-label="Map">
          <div class="view-bar">
            <div class="segmented" role="group" aria-label="Preview">
              <button type="button" aria-pressed={preview === "2d"} onClick={() => setPreview("2d")}>
                2D
              </button>
              <button type="button" aria-pressed={preview === "3d"} onClick={() => setPreview("3d")}>
                3D
              </button>
            </div>
            {preview === "2d" ? (
              <div class="layers" role="group" aria-label="Preview layers">
                {(Object.keys(LAYER_NAMES) as (keyof Layers)[]).map((k) => (
                  <label class="check" key={k}>
                    <input type="checkbox" checked={layers[k]} onChange={() => setLayers({ ...layers, [k]: !layers[k] })} />
                    {LAYER_NAMES[k]}
                  </label>
                ))}
              </div>
            ) : null}
          </div>
          {error && (
            <p class="error" role="alert">
              {error}
            </p>
          )}
          {result ? (
            <p class="view-caption" data-shows={fromSession ? "edited" : "new"}>
              {fromSession ? (
                <>
                  Your map: <strong>{result.name}</strong>
                  {session && session.edits ? `, with your ${session.edits} edit${session.edits > 1 ? "s" : ""}` : ""}
                </>
              ) : (
                <>
                  {session && session.kind === "import" ? "New map from these settings" : "This map"}: <strong>{result.name}</strong>, seed {result.spec.seed}
                </>
              )}
            </p>
          ) : null}
          {result ? (
            preview === "3d" ? (
              Preview3D ? (
                <Preview3D result={result} />
              ) : (
                <div class="placeholder">Loading the 3D view…</div>
              )
            ) : (
              <Preview2D result={result} layers={layers} />
            )
          ) : (
            <div class="placeholder">{opening ?? (busy ? "Generating…" : "")}</div>
          )}
          {result && (
            <>
              <div class="downloads">
                <button type="button" class="primary" disabled={!result.passed && !fromSession} onClick={() => void refine()}>
                  Refine this map
                </button>
                {fromSession ? (
                  <>
                    <button type="button" class="ghost" onClick={() => setExporting(true)}>
                      Export {session?.timberName ?? result.timberName}
                    </button>
                    <button type="button" class="ghost" onClick={() => void generator.project().then((p) => saveFile(p.bytes, p.fileName, "application/gzip"))}>
                      Download project file
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      class="ghost"
                      disabled={!result.passed}
                      onClick={() => {
                        saveFile(result.timber, result.timberName);
                        setDownloaded(true);
                      }}
                    >
                      Download {result.timberName}
                    </button>
                    <button type="button" class="ghost" disabled={!result.passed || savingToTimberborn} onClick={() => void saveToTimberbornClick(result.timber, result.timberName)}>
                      {savingToTimberborn ? "Saving…" : "Save to Timberborn"}
                    </button>
                    <button type="button" class="ghost" onClick={() => saveFile(result.project, result.projectName, "application/gzip")}>
                      Download project file
                    </button>
                    <button
                      type="button"
                      class="ghost"
                      disabled={!result.passed}
                      title="The same map with no water in the file: the game fills the rivers during the first day (for comparing in game)"
                      onClick={async () => {
                        const f = await generator.emptyWater();
                        if (f) saveFile(f.bytes, f.name);
                      }}
                    >
                      Without pre-filled water
                    </button>
                    {timberborn ? (
                      <span class="muted" role="status">
                        {timberborn.via === "fsa" ? (
                          <>
                            Saved to <strong>{timberborn.folder}</strong>. It'll show up in Timberborn's custom maps.
                            {timberborn.savedAs ? (
                              <>
                                {" "}
                                Saved as <strong>{timberborn.savedAs}</strong>.
                              </>
                            ) : null}
                          </>
                        ) : (
                          <>
                            Downloaded. Move the file to <code>Documents\Timberborn\Maps</code>.
                          </>
                        )}
                      </span>
                    ) : null}
                  </>
                )}
              </div>
              <div class="share" role="group" aria-label="Share this map">
                <button type="button" class="ghost" onClick={() => void copy(shareLink(location.href, result.spec), "Link")}>
                  Copy link
                </button>
                <button type="button" class="ghost" onClick={() => void copy(shareText(result.spec, shareLink(location.href, result.spec)), "Seed and settings")}>
                  Copy seed + settings
                </button>
                <span class="muted" role="status">
                  {copied || (fromSession ? "The link makes the generated map. To share your edits, send the project file." : "The link makes this exact map.")}
                </span>
              </div>
              <MapCard result={result} />
              <div class={downloaded ? "install open" : "install"}>
                <h3>Play it</h3>
                <ol>
                  <li>
                    Move <strong>{result.timberName}</strong> to <code>Documents\Timberborn\Maps</code> (on macOS{" "}
                    <code>~/Documents/Timberborn/Maps</code>).
                  </li>
                  <li>Start Timberborn, choose New game, and pick the map from your maps. The map editor can open it too.</li>
                  <li>
                    The game shows the file name as the map name. The project file (<code>.damgoodmaps.json</code>) keeps
                    your map and its edits: open it here to keep editing.
                  </li>
                </ol>
              </div>
            </>
          )}
        </section>
      </main>
      <footer class="foot">
        Generator {GENERATOR_VERSION}. Not affiliated with Mechanistry. <a href="https://github.com/timbermods/dam-good-maps">Source</a>
      </footer>
      {exporting && session && Dialog ? (
        <Dialog
          api={generator}
          info={session}
          onClose={() => setExporting(false)}
          onChecked={() => undefined}
          queue={(fn) => fn()}
        />
      ) : null}
      {confirmDialog}
    </div>
  );
}
