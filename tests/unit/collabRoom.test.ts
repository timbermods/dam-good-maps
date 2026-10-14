// The room-code function's rules (collab-worker/src/room.ts): codes, secrets, expiry, single use, limits.
import { describe, expect, it } from "vitest";
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  LIMITS,
  SlidingWindow,
  createRoom,
  hashSecret,
  joinRoom,
  markConnected,
  newCode,
  newSecret,
  normalizeCode,
  noteIceFetch,
  noteSignal,
  originAllowed,
  roleOf,
} from "../../collab-worker/src/room";
import type { RoomRecord } from "../../collab-worker/src/room";

const T0 = 1_000_000;

async function room(): Promise<{ r: RoomRecord; host: string; guest: string }> {
  const host = await hashSecret("host-key");
  const guest = await hashSecret("guest-key");
  return { r: createRoom(T0, "ABC234", host), host, guest };
}

describe("codes", () => {
  it("are short, from an alphabet with no look-alikes", () => {
    for (const bad of "01OIL") expect(CODE_ALPHABET).not.toContain(bad);
    for (let i = 0; i < 200; i++) {
      const c = newCode();
      expect(c).toHaveLength(CODE_LENGTH);
      for (const ch of c) expect(CODE_ALPHABET).toContain(ch);
    }
  });

  it("use every letter equally: 248 usable bytes cover each of the 31 letters 8 times, the others are skipped", () => {
    const counts = new Map<string, number>();
    for (let b = 0; b < 248; b++) {
      const letter = newCode(() => new Uint8Array(12).fill(b))[0];
      counts.set(letter, (counts.get(letter) ?? 0) + 1);
    }
    expect(counts.size).toBe(CODE_ALPHABET.length);
    expect(new Set(counts.values())).toEqual(new Set([8]));
    let calls = 0;
    const skipping = newCode(() => new Uint8Array(12).fill(calls++ === 0 ? 250 : 0)); // a biased byte is dropped and asked again
    expect(skipping).toBe(CODE_ALPHABET[0].repeat(CODE_LENGTH));
  });

  it("forgive case, spaces and dashes, and refuse anything else", () => {
    expect(normalizeCode(" abc-234 ")).toBe("ABC234");
    expect(normalizeCode("ABC23")).toBeNull();
    expect(normalizeCode("ABC2340")).toBeNull();
    expect(normalizeCode("ABCO34")).toBeNull();
    expect(normalizeCode("ABCI34")).toBeNull();
  });

  it("make secrets that differ and hash to the same value only for the same secret", async () => {
    expect(newSecret()).not.toBe(newSecret());
    expect(await hashSecret("a")).toBe(await hashSecret("a"));
    expect(await hashSecret("a")).not.toBe(await hashSecret("b"));
  });
});

describe("a room", () => {
  it("lets the guest in once, and the code is spent", async () => {
    const { r, guest } = await room();
    const joined = joinRoom(r, T0 + 1000, guest);
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    const again = joinRoom(joined.room, T0 + 2000, await hashSecret("someone-else"));
    expect(again).toMatchObject({ ok: false, error: { kind: "taken" } });
  });

  it("refuses an unknown or expired code with a plain reason", async () => {
    const { r, guest } = await room();
    expect(joinRoom(null, T0, guest)).toMatchObject({ ok: false, error: { kind: "not-found" } });
    expect(joinRoom(r, T0 + LIMITS.codeTtlMs, guest)).toMatchObject({ ok: false, error: { kind: "expired" } });
    expect(joinRoom(r, T0 + LIMITS.codeTtlMs - 1, guest).ok).toBe(true);
  });

  it("gives a joined pair time to connect after the code would have run out", async () => {
    const { r, guest } = await room();
    const at = T0 + LIMITS.codeTtlMs - 1000;
    const joined = joinRoom(r, at, guest);
    expect(joined.ok && joined.room.expiresAt).toBe(at + LIMITS.setupMs);
  });

  it("opens only for the holder of a key, as that key's role, and not once expired", async () => {
    const { r, host, guest } = await room();
    const joined = joinRoom(r, T0, guest);
    if (!joined.ok) throw new Error("join");
    expect(roleOf(joined.room, T0, host)).toMatchObject({ ok: true, role: "host" });
    expect(roleOf(joined.room, T0, guest)).toMatchObject({ ok: true, role: "guest" });
    expect(roleOf(joined.room, T0, await hashSecret("guess"))).toMatchObject({ ok: false, error: { kind: "unauthorized" } });
    expect(roleOf(joined.room, joined.room.expiresAt, host)).toMatchObject({ ok: false, error: { kind: "expired" } });
    // before anyone has joined there is no guest key to match
    expect(roleOf(r, T0, await hashSecret("guess")).ok).toBe(false);
  });

  it("limits setup messages by size and count, and relay logins by count", async () => {
    let { r } = await room();
    expect(noteSignal(r, LIMITS.maxMessageBytes + 1)).toMatchObject({ ok: false, error: { kind: "too-large" } });
    for (let i = 0; i < LIMITS.maxSignalMessages; i++) {
      const n = noteSignal(r, 100);
      if (!n.ok) throw new Error("early refusal");
      r = n.room;
    }
    expect(noteSignal(r, 100)).toMatchObject({ ok: false, error: { kind: "too-many" } });
    // nobody has joined: no relay login yet
    expect(noteIceFetch(r)).toMatchObject({ ok: false, error: { kind: "not-ready" } });
    const joined = joinRoom(r, T0, await hashSecret("guest-key"));
    if (!joined.ok) throw new Error("join");
    r = joined.room;
    for (let i = 0; i < LIMITS.maxIceFetches; i++) {
      const n = noteIceFetch(r);
      if (!n.ok) throw new Error("early refusal");
      r = n.room;
    }
    expect(noteIceFetch(r)).toMatchObject({ ok: false, error: { kind: "too-many" } });
  });

  it("is done when both players have reported connected", async () => {
    const { r } = await room();
    const a = markConnected(r, "host");
    expect(a.done).toBe(false);
    expect(markConnected(a.room, "host").done).toBe(false);
    expect(markConnected(a.room, "guest").done).toBe(true);
  });

  it("keeps no addresses and no setup content: the record holds only hashes, times and counters", async () => {
    const { r } = await room();
    expect(Object.keys(r).sort()).toEqual(["code", "connected", "createdAt", "expiresAt", "guestHash", "hostHash", "iceFetches", "joinedAt", "signalCount", "v"]);
    expect(JSON.stringify(r)).not.toContain("host-key");
  });
});

describe("limits per address", () => {
  it("allow a number of events inside the window, then refuse, then allow again", () => {
    const w = new SlidingWindow(3, 60_000);
    expect([0, 1, 2, 3].map((i) => w.allow("a", T0 + i))).toEqual([true, true, true, false]);
    expect(w.allow("b", T0)).toBe(true); // another address is counted apart
    expect(w.allow("a", T0 + 60_001)).toBe(true);
  });
});

describe("origins", () => {
  const cfg = { allowed: "https://timbermods.github.io", allowLocal: false };
  it("accept the site, refuse other pages and anything that is not from a page", () => {
    expect(originAllowed("https://timbermods.github.io", cfg)).toBe(true);
    expect(originAllowed(null, cfg)).toBe(false);
    expect(originAllowed("https://evil.example", cfg)).toBe(false);
    expect(originAllowed("https://timbermods.github.io.evil.example", cfg)).toBe(false);
  });
  it("accept localhost only in local development", () => {
    expect(originAllowed("http://localhost:5173", cfg)).toBe(false);
    const dev = { ...cfg, allowLocal: true };
    expect(originAllowed(null, dev)).toBe(true); // local tools and tests call the function directly
    expect(originAllowed("http://localhost:5173", dev)).toBe(true);
    expect(originAllowed("http://127.0.0.1:4173", dev)).toBe(true);
    expect(originAllowed("http://localhost.evil.example", dev)).toBe(false);
  });
});
