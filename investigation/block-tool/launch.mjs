import { createServer } from "vite";
import { fileURLToPath } from "node:url";
const server = await createServer({ configFile: fileURLToPath(new URL("vite.config.ts", import.meta.url)) });
await server.listen();
console.log("Block tool · local demo");
server.printUrls();
