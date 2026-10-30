// The Dam Good Maps MCP server over stdio: what Claude Desktop and `npx` start (mcp/README.md).

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server";

// stdout carries the protocol alone: anything the engine logs goes to stderr
console.log = console.info = console.warn = console.debug = (...a: unknown[]) => process.stderr.write(`${a.map(String).join(" ")}\n`);

await createServer().connect(new StdioServerTransport());
