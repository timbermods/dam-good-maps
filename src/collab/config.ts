// Where the room-code function lives (collab-worker/). One constant the page reads.
//
// TODO(Kyler): the deploy prints the real address; replace <account> with the Cloudflare account's workers.dev
// subdomain (Workers & Pages → the "dam-good-maps-collab" Worker → its URL), or set a custom domain.
export const COLLAB_WORKER_URL = "https://dam-good-maps-collab.<account>.workers.dev";

/** The relay and function origins a content-security policy has to allow in `connect-src` (the site sets none today). */
export const COLLAB_CONNECT_ORIGINS = [COLLAB_WORKER_URL, COLLAB_WORKER_URL.replace(/^https:/, "wss:")];

/** Whether the address above is still the placeholder (collaboration is then unavailable, and the page says so). */
export const collabConfigured = (url: string = COLLAB_WORKER_URL): boolean => !url.includes("<account>");
