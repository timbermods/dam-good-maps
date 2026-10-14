import type { Room } from "./roomObject";
import type { Limiter } from "./limiter";
import type { RelayEnv } from "./ice";

/** The Worker's bindings, variables and secrets (README.md lists them). */
export interface Env extends RelayEnv {
  ROOMS: DurableObjectNamespace<Room>;
  LIMITERS: DurableObjectNamespace<Limiter>;
  /** Comma-separated exact origins that may call from a page. */
  ALLOWED_ORIGINS: string;
  /** "1" also accepts localhost pages (local development only). */
  ALLOW_LOCAL_ORIGINS?: string;
}
