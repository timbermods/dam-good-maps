// The room-code function for collaborative editing (D431). It hands out a short room code, passes the two
// browsers' connection setup through a Durable Object per room, and hands out the relay's short-lived credentials
// to a holder of a room key. It never sees map data: that goes through the relay, encrypted end to end.
import { ERROR_STATUS, LIMITS, NOT_FOUND_MESSAGE, err, hashSecret, newCode, newSecret, normalizeCode, originAllowed } from "./room";
import type { Result } from "./room";
import { relayConfigured, relayCredentials } from "./ice";
import type { Env } from "./env";

export { Room } from "./roomObject";
export { Limiter } from "./limiter";

function cors(origin: string | null): Record<string, string> {
  return origin
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Max-Age": "600",
        Vary: "Origin",
      }
    : {};
}

function json(body: unknown, status: number, origin: string | null): Response {
  return Response.json(body, { status, headers: { ...cors(origin), "Cache-Control": "no-store" } });
}

function fail(error: { kind: keyof typeof ERROR_STATUS; message: string }, origin: string | null): Response {
  return json({ error }, ERROR_STATUS[error.kind], origin);
}

async function allowed(env: Env, kind: "rooms" | "joins", ip: string): Promise<boolean> {
  const limit = kind === "rooms" ? LIMITS.roomsPerMinute : LIMITS.joinsPerMinute;
  const stub = env.LIMITERS.get(env.LIMITERS.idFromName(`${kind}:${ip}`));
  return stub.hit(limit, 60_000);
}

function roomStub(env: Env, code: string) {
  return env.ROOMS.get(env.ROOMS.idFromName(code));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    if (!originAllowed(origin, { allowed: env.ALLOWED_ORIGINS, allowLocal: env.ALLOW_LOCAL_ORIGINS === "1" })) {
      return fail({ kind: "forbidden-origin", message: "This page isn't allowed to use the room service." }, null);
    }
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    const ip = request.headers.get("CF-Connecting-IP") ?? "local";
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/health" && request.method === "GET") return json({ ok: true, relay: relayConfigured(env) }, 200, origin);

    // a new room: the host gets the code and a key
    if (path === "/rooms" && request.method === "POST") {
      if (!(await allowed(env, "rooms", ip))) return fail({ kind: "rate-limited", message: "Too many rooms from here. Try again in a minute." }, origin);
      if (!relayConfigured(env)) return fail({ kind: "relay-unavailable", message: "The relay isn't set up." }, origin);
      const hostSecret = newSecret();
      const hostHash = await hashSecret(hostSecret);
      for (let attempt = 0; attempt < 6; attempt++) {
        const code = newCode();
        const made = await roomStub(env, code).create(code, hostHash);
        if (made.ok) return json({ code, hostSecret, expiresAt: made.expiresAt, codeTtlMs: LIMITS.codeTtlMs }, 201, origin);
      }
      return fail({ kind: "too-many", message: "Couldn't make a room. Try again." }, origin);
    }

    const m = /^\/rooms\/([^/]+)\/(join|ice|ws)$/.exec(path);
    if (!m) return fail({ kind: "not-found", message: "Not found." }, origin);
    const code = normalizeCode(decodeURIComponent(m[1]));
    const action = m[2];

    // joining spends the code
    if (action === "join" && request.method === "POST") {
      if (!(await allowed(env, "joins", ip))) return fail({ kind: "rate-limited", message: "Too many tries. Wait a minute." }, origin);
      if (!code) return fail({ kind: "not-found", message: NOT_FOUND_MESSAGE }, origin);
      const guestSecret = newSecret();
      const joined = await roomStub(env, code).join(await hashSecret(guestSecret));
      if (!joined.ok) return fail(joined.error, origin);
      return json({ code, guestSecret, expiresAt: joined.expiresAt }, 200, origin);
    }

    // relay credentials: for a holder of a room key
    if (action === "ice" && request.method === "POST") {
      if (!code) return fail({ kind: "not-found", message: NOT_FOUND_MESSAGE }, origin);
      const bearer = /^Bearer (.{1,100})$/.exec(request.headers.get("Authorization") ?? "");
      if (!bearer) return fail({ kind: "unauthorized", message: "Send the room key." }, origin);
      const who: Result<{ role: string }> = await roomStub(env, code).takeIce(await hashSecret(bearer[1]));
      if (!who.ok) return fail(who.error, origin);
      const creds = await relayCredentials(env);
      if (!creds.ok) return fail(creds.error, origin);
      return json({ iceServers: creds.iceServers, ttl: creds.ttl }, 200, origin);
    }

    // the room's socket: setup messages between the two players
    if (action === "ws" && request.method === "GET") {
      if (!code) return fail({ kind: "not-found", message: NOT_FOUND_MESSAGE }, origin);
      return roomStub(env, code).fetch(request);
    }

    return fail(err("bad-request", "Not supported.").error, origin);
  },
} satisfies ExportedHandler<Env>;
