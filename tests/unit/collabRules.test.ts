// More of the room-code function's rules (collab-worker/src/room.ts): what may pass between the players, addresses, the
// day's budget and session tokens.
import { describe, expect, it } from "vitest";
import { checkSignal, ipKey, relayedCandidate, signToken, takeDaily, takeKeyed, takeRenewal, verifyToken } from "../../collab-worker/src/room";

const T0 = 1_000_000;
const relay = "candidate:1 1 udp 2 192.0.2.1 5000 typ relay raddr 0.0.0.0 rport 0";
const crlf = String.fromCharCode(13, 10);

describe("the setup messages", () => {
  it("let a relayed candidate with no address of the sender's through, and nothing that is not relayed", () => {
    expect(relayedCandidate(relay)).toBe(true);
    expect(relayedCandidate("candidate:1 1 udp 2 192.0.2.1 5000 typ relay")).toBe(true);
    expect(relayedCandidate("candidate:1 1 udp 2 10.0.0.2 5000 typ host")).toBe(false);
    expect(relayedCandidate("candidate:1 1 udp 2 203.0.113.9 5000 typ srflx raddr 10.0.0.2 rport 1")).toBe(false);
    expect(relayedCandidate("candidate:1 1 udp 2 192.0.2.1 5000 typ relay raddr 10.0.0.2 rport 1")).toBe(false);
  });

  it("pass an offer, an answer and candidates, refuse the rest", () => {
    const sdp = ["v=0", "a=candidate:" + relay, ""].join(crlf);
    expect(checkSignal(JSON.stringify({ k: "offer", sdp: "v=0" }))).toMatchObject({ ok: true, kind: "offer" });
    expect(checkSignal(JSON.stringify({ k: "answer", sdp }))).toMatchObject({ ok: true, kind: "answer" });
    expect(checkSignal(JSON.stringify({ k: "cand", c: { candidate: relay } }))).toMatchObject({ ok: true, kind: "cand" });
    expect(checkSignal(JSON.stringify({ k: "cand", c: null }))).toMatchObject({ ok: true });
    const bad = [
      "x",
      "null",
      "{}",
      JSON.stringify({ k: "bye" }),
      JSON.stringify({ k: "offer" }),
      JSON.stringify({ k: "cand", c: { candidate: "candidate:1 1 udp 2 10.0.0.2 5000 typ host" } }),
      JSON.stringify({ k: "offer", sdp: "a=candidate:1 1 udp 2 10.0.0.2 5000 typ host" }),
    ];
    for (const b of bad) expect(checkSignal(b), b).toMatchObject({ ok: false, error: { kind: "bad-request" } });
  });
});

describe("addresses and the day's budget", () => {
  it("count an IPv6 address by its /64 and an IPv4 address as it is", () => {
    expect(ipKey("203.0.113.5")).toBe("203.0.113.5");
    const a = ipKey("2001:db8:abcd:12:1:2:3:4");
    expect(ipKey("2001:0DB8:abcd:0012::9")).toBe(a);
    expect(ipKey("2001:db8:abcd:13::1")).not.toBe(a);
    expect(ipKey("::1")).toBe("0:0:0:0::/64");
    // an IPv4 address in IPv6 form is that IPv4 address
    expect(ipKey("::ffff:203.0.113.5")).toBe("203.0.113.5");
    expect(ipKey("::FFFF:203.0.113.5")).toBe("203.0.113.5");
  });

  it("hand out relay logins up to a daily cap, then start again the next day", () => {
    const noon = Date.UTC(2026, 9, 14, 12);
    let state: ReturnType<typeof takeDaily>["state"] | undefined;
    for (let i = 0; i < 3; i++) {
      const r = takeDaily(state, noon, 3);
      expect(r.allowed).toBe(true);
      state = r.state;
    }
    expect(takeDaily(state, noon + 1000, 3).allowed).toBe(false);
    expect(takeDaily(state, noon + 24 * 3600_000, 3).allowed).toBe(true);
  });
});

describe("budgets per address and per session token", () => {
  const noon = Date.UTC(2026, 9, 14, 12);
  it("count each address apart, and start again the next day", () => {
    let st: ReturnType<typeof takeKeyed>["state"] | undefined;
    for (let i = 0; i < 2; i++) st = takeKeyed(st, noon, "a", 2).state;
    expect(takeKeyed(st, noon, "a", 2).allowed).toBe(false);
    expect(takeKeyed(st, noon, "b", 2).allowed).toBe(true);
    expect(takeKeyed(st, noon + 24 * 3600_000, "a", 2).allowed).toBe(true);
  });
  it("let a session token renew a few times, forget it when it ends, and keep tokens apart", () => {
    let st: ReturnType<typeof takeRenewal>["state"] | undefined;
    for (let i = 0; i < 3; i++) {
      const r = takeRenewal(st, "t1", noon + 1000, noon, 3);
      expect(r.allowed).toBe(true);
      st = r.state;
    }
    expect(takeRenewal(st, "t1", noon + 1000, noon, 3).allowed).toBe(false);
    expect(takeRenewal(st, "t2", noon + 1000, noon, 3).allowed).toBe(true);
    const later = takeRenewal(st, "t2", noon + 5000, noon + 2000, 3);
    expect(Object.keys(later.state)).toEqual(["t2"]); // t1 ended and is forgotten
  });
});

describe("session tokens", () => {
  const key = new Uint8Array(32).fill(7);

  it("are accepted until they expire, and not when changed or made with another key", async () => {
    const token = await signToken(key, "session-1", T0, 1000);
    expect(await verifyToken(key, token, T0 + 500)).toMatchObject({ ok: true, sessionId: "session-1" });
    expect(await verifyToken(key, token, T0 + 1000)).toMatchObject({ ok: false, error: { kind: "expired" } });
    const [head, body, mac] = token.split(".");
    const other = await signToken(key, "session-2", T0, 1000);
    expect(await verifyToken(key, `${head}.${other.split(".")[1]}.${mac}`, T0)).toMatchObject({ ok: false, error: { kind: "unauthorized" } });
    expect(await verifyToken(new Uint8Array(32).fill(8), token, T0)).toMatchObject({ ok: false, error: { kind: "unauthorized" } });
    expect(await verifyToken(key, `${head}.${body}.`, T0)).toMatchObject({ ok: false });
    expect(await verifyToken(key, "garbage", T0)).toMatchObject({ ok: false });
    // each token has its own id, which the renewal budget counts
    const a = await verifyToken(key, token, T0);
    const b = await verifyToken(key, await signToken(key, "session-1", T0, 1000), T0);
    expect(a.ok && b.ok && a.jti !== b.jti).toBe(true);
  });
});
