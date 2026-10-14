import { err } from "./room";
import type { Result } from "./room";

/** The part of the Worker's settings the relay credentials need. */
export interface RelayEnv {
  /** Seconds the relay's credentials last. */
  TURN_TTL_SECONDS?: string;
  /** Secrets: the relay's key id and API token (Cloudflare Realtime TURN). */
  CF_TURN_KEY_ID?: string;
  CF_TURN_KEY_API_TOKEN?: string;
  /** Local development: a local TURN server's address and static login, used instead of Cloudflare. */
  LOCAL_TURN_URLS?: string;
  LOCAL_TURN_USERNAME?: string;
  LOCAL_TURN_CREDENTIAL?: string;
}

/** The shape the browser's RTCPeerConnection takes. */
export interface IceServer {
  urls: string[];
  username: string;
  credential: string;
}

const DEFAULT_TTL_SECONDS = 4 * 60 * 60;

/**
 * Relay credentials for one room member. Local development returns a local TURN server's static login; otherwise
 * Cloudflare Realtime TURN is asked for short-lived ones. Only TURN servers come back (no STUN), so a page that uses
 * them with the relay-only policy never talks to anything else.
 */
export async function relayCredentials(env: RelayEnv): Promise<Result<{ iceServers: IceServer[]; ttl: number }>> {
  if (env.LOCAL_TURN_URLS) {
    return {
      ok: true,
      ttl: DEFAULT_TTL_SECONDS,
      iceServers: [
        {
          urls: env.LOCAL_TURN_URLS.split(",").map((s) => s.trim()).filter(Boolean),
          username: env.LOCAL_TURN_USERNAME ?? "dgm",
          credential: env.LOCAL_TURN_CREDENTIAL ?? "dgm",
        },
      ],
    };
  }
  if (!env.CF_TURN_KEY_ID || !env.CF_TURN_KEY_API_TOKEN) return err("relay-unavailable", "The relay isn't set up.");
  const ttl = Math.max(60, Math.min(Number(env.TURN_TTL_SECONDS) || DEFAULT_TTL_SECONDS, 48 * 60 * 60));
  try {
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.CF_TURN_KEY_ID)}/credentials/generate-ice-servers`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.CF_TURN_KEY_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return err("relay-unavailable", "The relay can't be reached.");
    const body = (await res.json()) as { iceServers?: { urls: string | string[]; username?: string; credential?: string }[] };
    const iceServers: IceServer[] = [];
    for (const s of body.iceServers ?? []) {
      if (!s.username || !s.credential) continue; // the STUN-only entry
      const urls = (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => u.startsWith("turn:") || u.startsWith("turns:"));
      if (urls.length) iceServers.push({ urls, username: s.username, credential: s.credential });
    }
    if (!iceServers.length) return err("relay-unavailable", "The relay gave no servers.");
    return { ok: true, iceServers, ttl };
  } catch {
    return err("relay-unavailable", "The relay can't be reached.");
  }
}

/** Whether credentials could be handed out at all (the page asks before it offers Invite). */
export function relayConfigured(env: RelayEnv): boolean {
  return Boolean(env.LOCAL_TURN_URLS || (env.CF_TURN_KEY_ID && env.CF_TURN_KEY_API_TOKEN));
}
