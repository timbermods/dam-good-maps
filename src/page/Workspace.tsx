// The page is the editor (UI-BRIEF; PLAN §20 D330): one workspace. The map fills the window from the first
// visit and is editable as soon as it is made; the side panel holds the map as a whole (the generator's
// settings and Generate, the map card), and the editor's rows, shelf and Save sit over the land. Generate runs
// only from its button or Enter in the panel; a settings change never regenerates. Every Generate makes a new
// map: edits never replay onto new land (D336). A .timber or project file dropped or opened, and a Real places
// link (`#place=<id>`), open in the same window. The open map is autosaved in this browser and comes back on
// the next visit.

import type { ComponentType } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { proxy } from "comlink";
import { createGenerator, readFile, saveFile, storage, type Autosave } from "../platform";
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
import type { GenerateResponse, GenProgress } from "../worker/api";
import type { SessionInfo, SessionOpen } from "../worker/session";
import type { EditorProps } from "../editor/Editor";
import { fetchIndex, fetchPlace, placeFromHash } from "../places/data";
import { FirstLook, progressText, type Progress } from "../ui/FirstLook";
import { Panel } from "./Panel";

const generator = createGenerator();

declare global {
  interface Window {
    /** Test hooks (tests/e2e): generate a map from a URL fragment and return its sha256; the map
     *  on screen, its sha256 and its share link. */
    dgm?: {
      generate(fragment: string): Promise<{ sha256: string; bytes: number; passed: boolean; ms: number; ticks: number }>;
      current?(): { made: number; sha256: string; link: string; passed: boolean; checks: { id: string; ok: boolean; value?: number | string; limit?: number | string; where?: { tiles?: [number, number][] } }[] } | null;
    };
  }
}
let shown: GenerateResponse | null = null;
/** How many maps the page has shown (a test hook: waits for the next one). */
let made = 0;
window.dgm = {
  async generate(fragment: string) {
    const d = decodeSpecFragment(fragment);
    if (!d) throw new Error("bad fragment");
    const r = await generator.generate(d.spec);
    return { sha256: r.sha256, bytes: r.timber.length, passed: r.passed, ms: r.ms, ticks: r.facts.settle.ticks };
  },
  current() {
    return shown ? { made, sha256: shown.sha256, link: shareLink(location.href, shown.spec), passed: shown.passed, checks: shown.checks.map((c) => ({ id: c.id, ok: c.ok, value: c.value, limit: c.limit, ...(c.where?.tiles ? { where: { tiles: c.where.tiles } } : {}) })) } : null;
  },
};

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
  // Any (Surprise me) is the default (D209)
  return { spec: makeSpec({ seed: randomSeed(), theme: "any" }), fromLink: false };
}

function isProjectFile(name: string, bytes: Uint8Array): boolean {
  if (/\.timber$/i.test(name)) return false;
  if (/\.(json|gz)$/i.test(name)) return true;
  return bytes[0] === 0x1f && bytes[1] === 0x8b; // gzip, not a zip (.timber starts "PK")
}

const PANEL_KEY = "dgm.panel";
/** The panel as it was left (open on the first visit, UI-BRIEF §3). */
function savedPanel(): boolean {
  try {
    return localStorage.getItem(PANEL_KEY) !== "collapsed";
  } catch {
    return true;
  }
}
function savePanel(open: boolean): void {
  try {
    localStorage.setItem(PANEL_KEY, open ? "open" : "collapsed");
  } catch {
    // the choice lasts for this visit only
  }
}

const EDITS_KEY = "dgm.autosaveEdits";
/** How many edits the autosaved map holds (so a link asks before replacing a map with edits, and never
 *  for one without). */
function savedEdits(): number {
  try {
    return Number(localStorage.getItem(EDITS_KEY)) || 0;
  } catch {
    return 0;
  }
}
function noteEdits(n: number): void {
  try {
    localStorage.setItem(EDITS_KEY, String(n));
  } catch {
    // (a link then replaces the autosave without asking)
  }
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

export function Workspace() {
  const init = useMemo(initialSpec, []);
  const [seedText, setSeedText] = useState(String(init.spec.seed));
  /** A typed seed, or one from a share link, is kept: Generate makes that map again until the player
   *  unlocks it or clears the box (D323, item 20). Otherwise every Generate rolls a fresh seed. */
  const [seedPinned, setSeedPinned] = useState(init.fromLink);
  const [size, setSize] = useState<{ x: number; y: number }>(init.spec.size);
  const [difficulty, setDifficulty] = useState<Difficulty>(init.spec.designedFor);
  const [theme, setTheme] = useState<ThemeId>(init.spec.theme);
  const [settings, setSettings] = useState<Settings>(init.spec.settings);
  /** The generated map shown (null for an opened file or a real place). */
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [busy, setBusy] = useState(false);
  /** While a new map is made: its stage and first look. */
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note] = useState<string | undefined>(init.note);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [opened, setOpened] = useState<{ key: number; data: SessionOpen } | null>(null);
  const [saveState, setSaveState] = useState("");
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  /** A real place or a saved map being opened: what the page says meanwhile. */
  const [opening, setOpening] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(savedPanel);
  const [copied, setCopied] = useState("");
  const [EditorMod, setEditorMod] = useState<ComponentType<EditorProps> | null>(null);
  const saveTimer = useRef(0);

  // the editor's chunk loads with the page, beside the first map being made
  useEffect(() => {
    void import("../editor/Editor").then((m) => setEditorMod(() => m.default as ComponentType<EditorProps>));
  }, []);

  const spec = useMemo(
    () => ({ ...makeSpec({ seed: seedFromText(seedText || "0"), size, designedFor: difficulty, theme }), settings }),
    [seedText, size, difficulty, theme, settings],
  );
  // the settings differ from the shown map's (a fresh seed alone is not a change: Generate rolls one anyway)
  const changed = useMemo(() => {
    const of = session?.kind === "generated" ? session.spec : null;
    if (!of) return false;
    const same = (s: MapSpec) => encodeSpecFragment({ ...s, seed: 0 });
    return same(of) !== same(spec) || (seedPinned && of.seed !== spec.seed);
  }, [session, spec, seedPinned]);

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

  const words = (e: unknown) => String(e instanceof Error ? e.message : e);

  // ------------------------------------------------------------------------------ the open map

  function enterEditor(data: SessionOpen) {
    setSession(data.info);
    setOpened((o) => ({ key: (o?.key ?? 0) + 1, data }));
    if (data.info.kind === "generated" && data.info.spec) {
      showSpec(data.info.spec);
      history.replaceState(null, "", "#" + encodeSpecFragment(data.info.spec));
    }
    scheduleSave();
  }

  /** Ask before replacing an open map that has edits. (Until Your maps keeps every edited map, checkpoint 3.) */
  function guard(action: () => void, what: string) {
    if (session && session.edits > 0) {
      setConfirm({
        text: `${what} closes ${session.name} and its ${session.edits} edit${session.edits > 1 ? "s" : ""}. Save its project file first if you want to keep them.`,
        yes: "Close it",
        onYes: action,
      });
    } else action();
  }

  // ------------------------------------------------------------------------------ generating

  /** The latest run: a result from an older one is never shown over it. */
  const runId = useRef(0);
  async function run(s: MapSpec, seedWord?: string) {
    const id = ++runId.current;
    setBusy(true);
    setError(null);
    try {
      setProgress({ attempt: 0, stage: "land", land: null });
      const r = await generator.generate(
        s,
        proxy((p: GenProgress) => setProgress((q) => (p.kind === "stage" ? { attempt: p.attempt, stage: p.stage, land: q?.land ?? null } : { attempt: p.attempt, stage: q?.stage ?? "land", land: p }))),
        seedWord,
      );
      if (id !== runId.current) return;
      if (!r.passed) {
        setError(`No valid map after ${r.attempts} attempts. Try another seed.`);
        if (session) return;
      }
      setResult(r);
      // the map is the editor's from the start: there is no step between making it and shaping it
      enterEditor(await generator.refine());
    } catch (e) {
      setError(words(e));
    } finally {
      if (id === runId.current) {
        setBusy(false);
        setProgress(null);
      }
    }
  }

  /** Generate (D323, item 20): a kept seed makes its map again; otherwise a fresh seed each press, shown
   *  in the box. Every Generate makes a new map (D336). */
  function generate(over?: Partial<Pick<MapSpec, "theme">>) {
    const word = seedText.trim();
    if (seedPinned && !over) {
      // (a seed typed as a word names the saved file, D345 B10)
      const seedWord = word && !/^\d+$/.test(word) && seedFromText(word) === spec.seed ? word : undefined;
      return void run(spec, seedWord);
    }
    const seed = randomSeed();
    setSeedText(String(seed));
    setSeedPinned(false);
    const t = over?.theme ?? theme;
    if (over?.theme) setTheme(t);
    void run({ ...makeSpec({ seed, size, designedFor: difficulty, theme: t }), settings: over?.theme ? defaultSettings(t, difficulty, size) : settings });
    if (over?.theme) setSettings(defaultSettings(t, difficulty, size));
  }
  const generateClick = () => guard(() => generate(), "Generating a new map");
  /** Surprise me: a map of any kind, from the land's own choice of everything. */
  const surpriseClick = () => guard(() => generate({ theme: "any" }), "Generating a new map");

  useEffect(() => {
    void (async () => {
      const saved = await storage.load();
      const place = placeFromHash(location.hash);
      const replaces = (what: string, onYes: () => void, s: Autosave) =>
        setConfirm({
          text: `Opening ${what} replaces ${s.name}, which is saved in this browser with its edits. Save its project file first if you want to keep it.`,
          yes: `Open ${what}`,
          onYes,
          onNo: () => void openBytes(s.bytes, s.name + ".damgoodmaps.json", true),
          save: () => saveFile(s.bytes, `${s.name}.damgoodmaps.json`, "application/gzip"),
        });
      if (place) {
        if (saved && savedEdits() > 0) replaces("this real place", () => void openPlace(place), saved);
        else await openPlace(place);
        return;
      }
      if (init.fromLink) {
        if (saved && savedEdits() > 0) replaces("this link's map", () => void run(init.spec), saved);
        else await run(init.spec);
        return;
      }
      // the map left open comes back as it was
      if (saved) await openBytes(saved.bytes, saved.name + ".damgoodmaps.json", true);
      else await run(init.spec);
    })();
  }, []);

  /** Open a real place: its .timber is built in the worker and imported. */
  async function openPlace(id: string) {
    setError(null);
    setOpening("Opening the map…");
    try {
      const entry = (await fetchIndex()).places.find((p) => p.id === id);
      if (!entry) throw new Error(`there is no real place called "${id}"`);
      setOpening(`Opening ${entry.name}…`);
      setResult(null);
      enterEditor(await generator.openPlace(await fetchPlace(id)));
      setOpening(null);
    } catch (e) {
      setOpening(null);
      if (!session) await run(init.spec);
      setError(`The real place could not be opened: ${words(e)}`);
    }
  }

  async function openBytes(bytes: Uint8Array, name: string, fromAutosave = false) {
    setError(null);
    setBusy(true);
    if (!session) setOpening("Opening your map…");
    try {
      const data = isProjectFile(name, bytes) ? await generator.openProject(bytes) : await generator.openTimber(bytes, name);
      setResult(null);
      enterEditor(data);
      setBusy(false);
      setOpening(null);
    } catch (e) {
      setBusy(false);
      setOpening(null);
      setError(fromAutosave ? `The autosaved map could not be opened: ${words(e)}` : `${name} could not be opened: ${words(e)}`);
      if (fromAutosave) await run(init.spec);
    }
  }

  function openFile(file: File) {
    guard(() => void readFile(file).then((b) => openBytes(b, file.name)), `Opening ${file.name}`);
  }

  async function copyLink() {
    const s = session?.kind === "generated" ? session.spec : null;
    if (!s) return;
    const link = shareLink(location.href, s);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(session!.edits ? "Link copied. It makes the generated map; to share your edits, send the project file." : "Link copied.");
    } catch {
      setCopied(`Could not copy. Link: ${link}`);
    }
    window.setTimeout(() => setCopied(""), 5000);
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
        const ok = await storage.save({ bytes: p.bytes, name: p.name, savedAt: new Date().toISOString(), kind: info.kind, screen: "editor" });
        if (ok) noteEdits(info.edits);
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

  function togglePanel(open: boolean) {
    setPanelOpen(open);
    savePanel(open);
  }

  // ---------------------------------------------------------------------------------- render

  if (result !== shown) made++;
  shown = result;

  const map = session
    ? {
        name: session.name,
        premise: session.premise,
        facts: [`${session.W}×${session.H}`, session.kind === "generated" && session.spec ? `seed ${session.spec.seed}` : session.kind === "import" ? "opened" : "", session.edits ? `${session.edits} edit${session.edits > 1 ? "s" : ""}` : "", saveState].filter(Boolean).join(" · "),
      }
    : null;

  return (
    <div class={`workspace${panelOpen ? "" : " panel-collapsed"}`}>
      {opened && EditorMod ? (
        <EditorMod
          key={opened.key}
          api={generator}
          opened={opened.data}
          onNewMap={() => togglePanel(true)}
          onCopyLink={session?.kind === "generated" ? () => void copyLink() : undefined}
          onChange={onEditorChange}
          onOpenFile={openFile}
        />
      ) : (
        <div class="workspace-wait" role="status">
          {progress ? <FirstLook progress={progress} /> : <p>{opening ?? (opened ? "Opening the editor…" : "Generating…")}</p>}
        </div>
      )}
      <Panel
        open={panelOpen}
        onOpen={togglePanel}
        spec={spec}
        seedText={seedText}
        onSeed={(t) => {
          setSeedText(t);
          setSeedPinned(t.trim() !== "");
        }}
        seedPinned={seedPinned}
        onUnpinSeed={() => setSeedPinned(false)}
        onSize={chooseSize}
        onTheme={chooseTheme}
        onDifficulty={chooseDifficulty}
        onSettings={setSettings}
        onReset={() => setSettings(defaultSettings(theme, difficulty, size))}
        busy={busy || !!opening}
        busyWords={opening ?? progressText(progress)}
        changed={changed}
        onGenerate={generateClick}
        onSurprise={surpriseClick}
        map={map}
        notices={note ? <p class="panel-note">{note}</p> : null}
      />
      {error || copied ? (
        <p class={`workspace-message${error ? " error" : ""}`} role={error ? "alert" : "status"}>
          {error ?? copied}
          {error ? (
            <button type="button" class="linkish" aria-label="Dismiss" title="Dismiss this message" onClick={() => setError(null)}>
              ×
            </button>
          ) : null}
        </p>
      ) : null}
      {confirm ? (
        <div class="dialog-backdrop">
          <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-text">
            <p id="confirm-text">{confirm.text}</p>
            <footer>
              <button
                type="button"
                class="ghost"
                title="Keep the map as it is"
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
                <button type="button" class="ghost" title="Save the map and its edits as a project" onClick={() => (confirm.save ? confirm.save() : void generator.project().then((p) => saveFile(p.bytes, p.fileName, "application/gzip")))}>
                  Save project file
                </button>
              ) : null}
              <button
                type="button"
                class="primary"
                title="Replace the map"
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
      ) : null}
    </div>
  );
}
