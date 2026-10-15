// The relay credentials the function hands out (collab-worker/src/ice.ts): Cloudflare Realtime TURN's request and
// answer, the key and token never leaving the Worker, and what happens when the relay is down.
import { afterEach, describe, expect, it, vi } from "vitest";
import { relayConfigured, relayCredentials } from "../../collab-worker/src/ice";

afterEach(() => vi.unstubAllGlobals());

const KEY = { CF_TURN_KEY_ID: "key-id", CF_TURN_KEY_API_TOKEN: "secret-token" };

describe("relay credentials", () => {
  it("ask Cloudflare Realtime TURN for short-lived ones and keep only the TURN servers", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        {
          iceServers: [
            { urls: ["stun:stun.cloudflare.com:3478"] },
            { urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp", "stun:x"], username: "u", credential: "c" },
          ],
        },
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await relayCredentials({ ...KEY, TURN_TTL_SECONDS: "600" });
    expect(r).toEqual({ ok: true, ttl: 600, iceServers: [{ urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"], username: "u", credential: "c" }] });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://rtc.live.cloudflare.com/v1/turn/keys/key-id/credentials/generate-ice-servers");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
    expect(JSON.parse(String(init.body))).toEqual({ ttl: 600 });
    // the key and token are not in what the page gets
    expect(JSON.stringify(r)).not.toContain("secret-token");
  });

  it("say the relay is unavailable when Cloudflare fails, answers with nothing usable, or isn't set up", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    expect(await relayCredentials(KEY)).toMatchObject({ ok: false, error: { kind: "relay-unavailable" } });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ iceServers: [{ urls: ["stun:a"] }] })));
    expect(await relayCredentials(KEY)).toMatchObject({ ok: false, error: { kind: "relay-unavailable" } });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await relayCredentials(KEY)).toMatchObject({ ok: false, error: { kind: "relay-unavailable" } });
    expect(await relayCredentials({})).toMatchObject({ ok: false, error: { kind: "relay-unavailable" } });
    expect(relayConfigured({})).toBe(false);
    expect(relayConfigured(KEY)).toBe(true);
  });

  it("use a local TURN server's static login in local development, without calling Cloudflare", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await relayCredentials({ LOCAL_TURN_URLS: "turn:127.0.0.1:3478?transport=udp, turn:127.0.0.1:3479", LOCAL_TURN_USERNAME: "a", LOCAL_TURN_CREDENTIAL: "b" });
    expect(r).toMatchObject({ ok: true, iceServers: [{ urls: ["turn:127.0.0.1:3478?transport=udp", "turn:127.0.0.1:3479"], username: "a", credential: "b" }] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
