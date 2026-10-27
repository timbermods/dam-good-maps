// Where the room-code function lives (collab-worker/). One constant the page reads.
//
// TODO(Kyler): the deploy prints the real address; replace <account> with the Cloudflare account's workers.dev
// subdomain (Workers & Pages → the "dam-good-maps-collab" Worker → its URL), or set a custom domain.
export const COLLAB_WORKER_URL = "https://dam-good-maps-collab.<account>.workers.dev";

/** The relay and function origins a content-security policy has to allow in `connect-src` (the site sets none today). */
export const COLLAB_CONNECT_ORIGINS = [COLLAB_WORKER_URL, COLLAB_WORKER_URL.replace(/^https:/, "wss:")];

/** Whether the address above is still the placeholder (collaboration is then unavailable, and the page says so). */
export const collabConfigured = (url: string = COLLAB_WORKER_URL): boolean => !url.includes("<account>");

/** The key a developer's browser keeps a local function's address under (tests and local work only). */
export const LOCAL_FUNCTION_KEY = "dgm.collab.function";

/** The address the page uses: the deployed one, or, on a page served from this machine only (localhost, 127.0.0.1), the local
 *  function a developer or a test set under `LOCAL_FUNCTION_KEY`. The deployed site never reads it. */
export function collabBaseUrl(): string {
  try {
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
    const url = local ? localStorage.getItem(LOCAL_FUNCTION_KEY) : null;
    if (url && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\/?$/.test(url)) return url.replace(/\/$/, "");
  } catch {
    // (no storage here: the deployed address)
  }
  return COLLAB_WORKER_URL;
}
