import type { Room } from "./roomObject";
import type { Limiter } from "./limiter";
import type { Keeper } from "./keeper";
import type { RelayEnv } from "./ice";

/** The Worker's bindings, variables and secrets (README.md lists them). */
export interface Env extends RelayEnv {
  ROOMS: DurableObjectNamespace<Room>;
  LIMITERS: DurableObjectNamespace<Limiter>;
  KEEPER: DurableObjectNamespace<Keeper>;
  /** Comma-separated exact origins that may call from a page. */
  ALLOWED_ORIGINS: string;
  /** "1" also accepts localhost pages (local development only). */
  ALLOW_LOCAL_ORIGINS?: string;
  /** Relay logins handed out in a day, all together (default 3000). */
  MAX_DAILY_MINTS?: string;
  /** Seconds a session token lasts (default 24 hours). */
  SESSION_TOKEN_TTL_SECONDS?: string;
}
