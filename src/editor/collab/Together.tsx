// Together (docs/COLLAB-BRIEF.md, D486): one quiet button in the header's right group, before File, and the small panel it opens.
// Alone, the panel has the player's name, Invite and Join. After Invite it shows the room code, large, with Copy, while it waits
// for the other player. Live, it names the other player with their colour, "Go to <name>" and Leave. Paused (the other has left or
// the connection dropped), it says so, the map read-only, with Invite again (the host) or the new code's field (the guest).
// Colours are the session's, a swatch beside each name; the button wears the other player's dot while a session is live.

import { useEffect, useRef, useState } from "preact/hooks";
import type { Together as TogetherController, TogetherState } from "../../collab/together";
import type { Role } from "../../core/collab";
import { tip } from "../../ui/Tooltip";

const ICON = { width: 18, height: 18, viewBox: "0 0 20 20", "aria-hidden": "true" as const, fill: "none", stroke: "currentColor", "stroke-width": 1.8, "stroke-linecap": "round" as const, "stroke-linejoin": "round" as const };

function Swatch(p: { role: Role | null }) {
  return <span class={`together-swatch${p.role ? ` who-${p.role}` : ""}`} aria-hidden="true" />;
}

/** The room code, large, with Copy. */
function Code(p: { code: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(p.code);
    } catch {
      // (a browser that won't copy: the code stays on screen to read out)
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div class="together-code">
      <output class="together-code-text" aria-label="Room code">
        {p.code}
      </output>
      <button type="button" class="ghost" {...tip("Copy the code")} onClick={() => void copy()}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/** The code field and its Join button. */
function JoinRow(p: { again?: boolean; busy: boolean; onJoin(code: string): void }) {
  const [code, setCode] = useState("");
  const go = () => code.trim() && !p.busy && p.onJoin(code);
  return (
    <div class="together-join">
      <input
        type="text"
        class="together-input together-code-input"
        value={code}
        maxLength={12}
        spellcheck={false}
        autoComplete="off"
        autoCapitalize="characters"
        placeholder="Code"
        aria-label="Room code to join"
        title={p.again ? "The new code the host gave you" : "The code the other player gave you"}
        onInput={(e) => setCode((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => e.key === "Enter" && go()}
      />
      <button type="button" class="ghost" disabled={!code.trim() || p.busy} {...tip(p.again ? "Join with the new code" : "Join the other player's map")} onClick={go}>
        {p.again ? "Join again" : "Join"}
      </button>
    </div>
  );
}

export function Together(p: { controller: TogetherController; state: TogetherState }) {
  const { controller: c, state: s } = p;
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(s.me.name);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", off);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", off);
      window.removeEventListener("keydown", key);
    };
  }, [open]);
  // (an Invite just made: the panel shows its code)
  useEffect(() => {
    if (s.phase === "inviting" || s.problem) setOpen(true);
  }, [s.phase === "inviting", s.problem]);
  const busy = !!s.working;
  const withOther = s.other && s.phase !== "alone" && s.phase !== "inviting" && s.phase !== "joining" ? s.other : null;
  const otherName = s.other?.name ?? "The other player";

  return (
    <div class="together-wrap" ref={wrap}>
      <button
        type="button"
        class={`ghost together-button${withOther ? " with-other" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={withOther ? `Together with ${otherName}` : "Together"}
        {...tip("Edit this map with someone else")}
        onClick={() => setOpen(!open)}
      >
        <svg {...ICON}>
          <circle cx="7.5" cy="6.5" r="2.8" />
          <circle cx="14" cy="7.5" r="2.3" />
          <path d="M2.5 16c.3-2.8 2.4-4.4 5-4.4s4.7 1.6 5 4.4M13 11.9c2.4-.2 4.2 1.1 4.5 3.6" />
        </svg>
        <span class="together-label">Together</span>
        {withOther ? <span class={`together-dot who-${withOther.role}${s.phase === "paused" ? " paused" : ""}`} aria-hidden="true" /> : null}
      </button>
      {open ? (
        <div class="together-panel" role="dialog" aria-label="Together">
          {s.phase === "alone" ? (
            <>
              <label class="together-field">
                <span>Your name</span>
                <input
                  type="text"
                  class="together-input"
                  value={name}
                  maxLength={40}
                  spellcheck={false}
                  autoComplete="off"
                  title="Your name in the session"
                  onInput={(e) => setName((e.target as HTMLInputElement).value)}
                  onBlur={() => c.setName(name)}
                  onKeyDown={(e) => e.key === "Enter" && c.setName(name)}
                />
              </label>
              <button
                type="button"
                class="ghost together-wide"
                disabled={busy}
                {...tip("Make a code for the other player")}
                onClick={() => {
                  c.setName(name);
                  void c.invite();
                }}
              >
                {busy ? s.working : "Invite"}
              </button>
              <p class="together-or" aria-hidden="true">
                or
              </p>
              <JoinRow
                busy={busy}
                onJoin={(code) => {
                  c.setName(name);
                  void c.join(code);
                }}
              />
            </>
          ) : null}

          {s.phase === "inviting" ? (
            <>
              {s.code ? <Code code={s.code} /> : <p class="together-line">{s.working ?? "Making a code…"}</p>}
              <p class="together-line">{s.code ? "Waiting for them to join…" : ""}</p>
              <button type="button" class="ghost together-wide" {...tip("Take the code back")} onClick={() => void c.cancelInvite()}>
                Cancel
              </button>
            </>
          ) : null}

          {s.phase === "joining" ? (
            <>
              <p class="together-line">{s.working ?? "Joining…"}</p>
              <button type="button" class="ghost together-wide" {...tip("Stop joining")} onClick={() => void c.leave()}>
                Cancel
              </button>
            </>
          ) : null}

          {s.phase === "live" || s.phase === "paused" ? (
            <>
              <ul class="together-people">
                <li>
                  <Swatch role={s.me.role} />
                  <span class="together-person">{s.me.name}</span>
                  <span class="together-you">you</span>
                </li>
                <li>
                  <Swatch role={s.other?.role ?? null} />
                  <span class="together-person">{otherName}</span>
                </li>
              </ul>
              {s.paused ? (
                <p class="together-line" role="status">
                  {s.paused}
                </p>
              ) : null}
              {s.opening ? (
                <p class="together-line" role="status">
                  {s.opening}
                </p>
              ) : null}
              {s.desync ? (
                <p class="together-line bad" role="alert">
                  {s.role === "guest" ? "This copy of the map has fallen out of step." : "The other copy of the map has fallen out of step."}
                </p>
              ) : null}
              {s.phase === "paused" && s.role === "host" ? (
                s.code ? (
                  <>
                    <Code code={s.code} />
                    <p class="together-line">Waiting for them to come back…</p>
                  </>
                ) : (
                  <button type="button" class="ghost together-wide" disabled={busy} {...tip("Make a new code to carry on")} onClick={() => void c.invite()}>
                    {busy ? s.working : "Invite again"}
                  </button>
                )
              ) : null}
              {s.phase === "paused" && s.role === "guest" ? <JoinRow again busy={busy} onJoin={(code) => void c.join(code)} /> : null}
              <div class="together-actions">
                {s.phase === "live" ? (
                  <button type="button" class="ghost" disabled={!s.hasView} {...tip("Move the camera to where they are looking")} onClick={() => c.goTo()}>
                    Go to {otherName}
                  </button>
                ) : null}
                {s.desync && s.role === "guest" ? (
                  <button type="button" class="ghost" {...tip("Ask the host for the map again")} onClick={() => c.resync()}>
                    Get the map again
                  </button>
                ) : null}
                <button type="button" class="ghost" {...tip("Leave the session; the map stays here")} onClick={() => void c.leave()}>
                  Leave
                </button>
              </div>
            </>
          ) : null}

          {s.problem ? (
            <p class="together-line bad" role="alert">
              {s.problem}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
